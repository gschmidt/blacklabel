/*
  Our strategy:

  At any given point in time, be loading the first song in the queue
  that is not fully loaded (and that has not finished playing).

  Keep one Audio object for each item in the queue at all
  times. Change the 'preload' attribute from 'metadata' to 'auto' to
  turn on/off loading for a particular item. (If this doesn't work,
  we'll have to instead create/destroy the audio elements.)
*/

// http://html5doctor.com/html5-audio-the-state-of-play/
// http://jplayer.org/HTML5.Media.Event.Inspector/


var _QueueManager = function () {
  var self = this;
  self.audios = {}; // map from QueuedSong _id to an <audio>
  self.startTime = {}; // map from QueuedSong _id to seconds or null
  self.deps = {}; // map from QueuedSong _id to Deps.Dependency
  self.currentlyPlaying = null; // QueuedSong _id of currently playing song
  self.transitionTimer = null; // setTimeout handle
  self.mainDep = new Deps.Dependency; // for top-level changes
  Meteor.startup(function () {
    self.startup();
  });
};

_.extend(_QueueManager.prototype, {
  now: function () {
    // XXX eventually maintain a time delta to the server
    return (+ new Date) / 1000;
  },

  startup: function () {
    var self = this;
    QueuedSongs.find().observeChanges({
      addedBefore: function (qsid, fields) {
        var a = new Audio;
        a.addEventListener("loadedmetadata", function () {
          Meteor.call("reportDuration", qsid, a.duration);
          self.update();
          self.deps[qsid] && self.deps[qsid].changed();
        });
        a.addEventListener("progress", function () {
          if (self.fractionLoaded(qsid) > .99 ||
              (self.currentlyPlaying === qsid && a.paused))
            self.update();
          self.deps[qsid] && self.deps[qsid].changed();
        });

        a.src = fields.url;
        a.preload = "metadata";
        self.audios[qsid] = a;
      },
      changed: function () { self.update(); },
      movedBefore: function () { self.update(); },
      removed: function (qsid) {
        var a = self.audios[qsid];
        if (a)
          // XXX really should remove handlers so that it can be
          // garbage collected.. but this will at least free the
          // downloaded media.
          a.src = "";
        delete self.audios[qsid];
        delete self.deps[qsid];
      }
    });
    PlayStatus.find().observeChanges({
      changed: function () { self.update(); }
    });
  },

  update: function () {
    console.log("update");
    var self = this;
    var now = self.now();

    clearTimeout(self.transitionTimer);

    var ps = PlayStatus.findOne();
    if (! ps) {
      // XXX replace this with subscription ready (and have
      // QueueManager actually be the thing that makes the
      // subscription)
      setTimeout(function () {
        self.update();
      }, 250);
      return;
    }

    // Compute self.currentlyPlaying. Arrange to rerun ourselves when
    // it changes. Enable prefetching of the earliest upcoming song
    // that is not prefetched. Make the currently playing song play.
    var startTime = null;
    var nextStartTime = null;
    var pastAnchor = false;
    var allLoadedSoFar = true;
    var currentlyPlaying = null;
    var previouslyPlaying = self.currentlyPlaying;
    QueuedSongs.find({}, { sort: [ 'order' ] }).forEach(function (qs) {
      var audio = self.audios[qs._id];

      if (qs._id === ps.playItem) {
        // Found the item relative to which we're expressing start
        // times, which is either the currently playing item or an
        // item that stopped playing in the recent past
        startTime = (+ ps.playTime) / 1000;
        pastAnchor = true;
      }
      self.startTime[qs._id] = startTime;

      if (startTime && typeof qs.duration === "number")
        // We know when this item finishes
        nextStartTime = startTime + qs.duration;
      else
        // We're either in the distant past, or we're at or past an
        // item whose play duration we don't know, so we don't know
        // when this item finishes
        nextStartTime = null;

      if (startTime && now >= startTime &&
          (nextStartTime === null || now < nextStartTime)) {
        // This is the currently playing song.
        currentlyPlaying = qs._id;

        if (nextStartTime !== null) {
          self.transitionTimer = setTimeout(function () {
            // Rerun update() when the transition happens.
            self.update();
          }, (nextStartTime - now) * 1000);
        }
      }

      // Turn on prefetching only for the first item (past
      // PlayStatus.playItem) that isn't fully loaded yet.
      var needsLoading = pastAnchor && self.fractionLoaded(qs._id) < .99;
      audio.preload = (needsLoading && allLoadedSoFar) ? "auto" : "metadata";
      if (! needsLoading)
        allLoadedSoFar = false;

      // Make this song play iff it is the currently playing song.
      //
      // Strategy: Never seek in a song. Only change what's playing if
      // the wrong song is playing. And when we start playing a song,
      // start at the beginning if that's within a few seconds of the
      // correct timing, else seek to our best guess of where we're
      // supposed to be. So, if playback happens faster or slower than
      // it's supposed to, we will either insert silence at the end of
      // songs or we will clip off the ends of songs.
      if (qs._id === currentlyPlaying) {
        if (audio.paused) {
          var idealOffset = now - startTime;
          var actualOffset = idealOffset < 1.0 ? 0.0 : idealOffset;

          // See if it is capable of seeking to the desired offset.
          var readyToPlay = false;
          for (var i = 0; i < audio.seekable.length; i++) {
            if (actualOffset >= audio.seekable.start(i) &&
                actualOffset < audio.seekable.end(i)) {
              readyToPlay = true;
              break;
            }
          }

          // Don't try to seek if the browser says it can't seek yet
          // (to avoid an exception). Instead, we'll leave it paused,
          // and give it another shot the next time we run.
          if (readyToPlay) {
            audio.currentTime = actualOffset;
            audio.play();
          }
        }
      } else {
        // Not currently playing. Make it not make sound.
        audio.pause();
      }

      // Set up for next iteration of loop
      startTime = nextStartTime;
    });

    // If we're before the beginning of the queue, then it follows
    // that nothing is playing and we didn't set a transition
    // timer. Set a transition timer that will fire at the start of
    // the queue.
    var beginTime = ps.playTime ? (+ ps.playTime) / 1000 : null;
    if (beginTime && now < beginTime) {
      self.transitionTimer = setTimeout(function () {
        self.update();
      }, (beginTime - now) * 1000);
    }

    self.currentlyPlaying = currentlyPlaying;
    self.mainDep.changed();
  },

  fractionLoaded: function (qsid) {
    var self = this;

    if (! _.has(self.deps, qsid))
      // XXX messy -- this will recreate (and leak) the dependency if
      // we've already stopped tracking this queue entry ...
      self.deps[qsid] = new Deps.Dependency;
    self.deps[qsid].depend();

    var audio = self.audios[qsid];
    if (! audio || isNaN(audio.duration))
      return 0;

    var totalBuffered = 0;
    for (var i = 0; i < audio.buffered.length; i++)
      totalBuffered += audio.buffered.end(i) - audio.buffered.start(i);

    return totalBuffered / audio.duration;
  },

  // True if qsid is previous in the queue to the currently playing
  // song.
  isInPast: function (qsid) {
    var self = this;

    self.mainDep.depend();

    var threshold =
      self.currentlyPlaying ||
      PlayStatus.findOne().playItem ||
      null;

    if (threshold === null)
      return true; // queue is dead

    if (qsid === threshold)
      return false;

    var me = QueuedSongs.findOne(qsid);
    var them = QueuedSongs.findOne(threshold);
    if (! me || ! them)
      return true;

    return me.order < them.order;
  },

  // True if qsid is currectly playing.
  isCurrentlyPlaying: function (qsid) {
    var self = this;
    self.mainDep.depend();
    return self.currentlyPlaying === qsid;
  }
});


QueueManager = new _QueueManager;