// XXX handle dropbox token expiry (it's manual, the user does it)

var PREHEAT_TIME_SECS = 1.0;

var trimQueue = function () {
  // XXX contemplate races
  var now = (+ new Date) / 1000;

  var ps = PlayStatus.findOne();
  var queue = QueuedSongs.find({}, { sort: [ 'order' ] }).fetch();

  var expired = [];

  var startTime = null;
  var nextStartTime = null;
  for (var i = 0; i < queue.length; i++) {
    var qs = queue[i];
    startTime = nextStartTime;
    nextStartTime = null;

    if (qs._id === ps.playItem)
      startTime = (+ ps.playTime) / 1000;
    if (startTime && typeof qs.duration === "number")
        nextStartTime = startTime + qs.duration;
    else
      nextStartTime = null;

    if (startTime === null ||
        (nextStartTime && now >= nextStartTime)) {
      expired.push(qs._id);
      continue;
    }

    // Found the currently playing item. Advance the anchor.
    if (qs._id !== ps.playItem) {
      PlayStatus.update({}, { $set: {
        playItem: qs._id,
        playTime: new Date(startTime * 1000)
      } });
    }
    break;
  }

  if (i === queue.length) {
    // Everything in the queue is done playing.
    PlayStatus.update({}, { $set: {
      playItem: null,
      playTime: null
    } });
  }

  // Remove dead entries
  QueuedSongs.remove({ _id: { $in: expired } });
};

Meteor.methods({
  addDropbox: function (credentialToken) {
    check(credentialToken, String);

    if (! this.userId)
      throw new Meteor.Error("access-denied", "Must be logged in");

    var creds = Dropbox.retrieveCredential(credentialToken);

    var accessToken = creds.serviceData.accessToken;
    var uid = creds.serviceData.id;
    var name = creds.options.profile.name;

    if (! uid || ! name)
      throw new Meteor.Error('dropbox', "Dropbox returned incomplete response");

    if (Dropboxes.findOne({ user: this.userId }))
      throw new Meteor.Error('too-many', "You may only link one Dropbox at " +
                             "a time");

    var existing = Dropboxes.findOne({ uid: uid });
    if (existing)
      throw new Meteor.Error('already', "That Dropbox is already linked");

    Dropboxes.insert({
      accessToken: accessToken,
      name: name,
      uid: uid,
      user: this.userId
    });
  },

  removeDropbox: function (dropboxId) {
    if (! this.userId)
      throw new Meteor.Error("access-denied", "Must be logged in");

    var dropbox = Dropboxes.findOne(dropboxId);
    if (! dropbox)
      throw new Meteor.Error("not-found", "No such Dropbox");

    if (dropbox.user !== this.userId)
      throw new Meteor.Error("access-denied", "That doesn't belong to you");

    Dropboxes.remove({ _id: dropboxId, user: this.userId });
  },

  // XXX latency-compensate! (don't get the URL on the client ..)
  enqueue: function (songId) {
    check(songId, String);

    if (! this.userId)
      throw new Meteor.Error("access-denied", "Must be logged in");

    var song = Files.findOne(songId);
    if (! song)
      throw new Meteor.Error("not-found", "No such song");
    var dropbox = Dropboxes.findOne(song.dropbox);
    if (! dropbox)
      throw new Error("missing dropbox for song " + songId);

    try {
      var data = HTTP.post(
        "https://api.dropbox.com/1/media/dropbox" + song.path, {
          params: { access_token: dropbox.accessToken }
        }).data;
    } catch (err) {
      console.log("#" + dropbox.uid + " failed to fetch URL for " +
                  song.path + ": " + err.message);
      throw new Meteor.Error('dropbox', "Couldn't get URL from Dropbox");
    }

    // it will have a 4 hour expiration time (per current dropbox
    // policy) XXX that's a problem. need to get these URLs on demand
    // (and client needs to tolerate them changing)

    trimQueue();

    var last = QueuedSongs.findOne({}, {sort: { order: -1 }, limit: 1});
    // XXX race
    var nextOrder = last ? last.order + 1 : 0;

    var qsid = QueuedSongs.insert({
      url: data.url,
      file: songId,
      who: this.userId,
      order: nextOrder,
      reportedDurations: {},
      duration: null
    });

    if (! last) {
      // Queue was empty until we added this entry.
      var now = new Date;
      PlayStatus.update({}, { $set: {
        // Start play a short time in the future so that there is time
        // to buffer, etc, and the start of the song doesn't get cut
        // off.
        playTime: new Date(now.getTime() + PREHEAT_TIME_SECS * 1000),
        playItem: qsid
      } });
    }
  },

  // XXX latency-compensate! (don't get the URL on the client ..)
  dequeue: function (songIds) {
    check(songIds, [String]);

    if (! this.userId)
      throw new Meteor.Error("access-denied", "Must be logged in");

    // XXX races?
    trimQueue();
    QueuedSongs.remove({ _id: { $in: songIds } });

    // If the playing song was removed, start the next song
    // immediately.
    var ps = PlayStatus.findOne();
    if (ps.playItem && ! QueuedSongs.findOne(ps.playItem)) {
      var first = QueuedSongs.findOne({}, {sort: ['order']});
      var now = new Date;
      PlayStatus.update({}, { $set: {
        playTime: first ? new Date(now.getTime() + PREHEAT_TIME_SECS * 1000)
          : null,
        playItem: first ? first._id : null
      }});
    }
  },

  reportDuration: function (qsid, duration) {
    check(qsid, String);
    check(duration, Number);
    if (! this.userId)
      throw new Meteor.Error("access-denied", "Must be logged in");
    if (this.userId.match(/\./))
      throw new Meteor.Error("access-denied",
                             "How did you get a dot in your userid?");
    var key = 'reportedDurations.' + this.userId;
    var setBody = {};
    setBody[key] = duration;
    QueuedSongs.update(qsid, { $set: setBody });

    // XXX want findAndModify here
    // XXX there is a race here (which findAndModify would not solve)
    var qs = QueuedSongs.findOne(qsid);
    if (qs) {
      var durations = _.values(qs.reportedDurations).sort();
      var len = durations.length;
      var median;
      if (len === 0)
        median = null;
      else if (len % 2 === 0)
        median = (durations[len/2] + durations[len/2 - 1])/2;
      else
        median = durations[Math.floor(len / 2)];
      QueuedSongs.update(qsid, { $set: { duration: median } });
    }
  }
});