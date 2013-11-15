// Client stubs

// XXX these could be improved: they don't handle corner cases very
// well, because really they want the same trim logic as the server
// has.

Meteor.methods({
  enqueue: function (songId) {
    check(songId, String);

    var last = QueuedSongs.findOne({}, {sort: { order: -1 }, limit: 1});
    var nextOrder = last ? last.order + 1 : 0;

    var qsid = QueuedSongs.insert({
      url: null,
      file: songId,
      who: this.userId,
      order: nextOrder,
      duration: null
    });
  },

  dequeue: function (songIds) {
    check(songIds, [String]);

    var ps = PlayStatus.findOne();
    var playing = ps.playItem && QueuedSongs.findOne(ps.playItem);

    QueuedSongs.remove({ _id: { $in: songIds } });
    if (_.contains(songIds, playing._id)) {
      var newPlaying = QueuedSongs.findOne({ order: { $gt: playing.order } },
                                           { sort: [ 'order' ] });
      var now = new Date;
      PlayStatus.update({}, {
        playItem: newPlaying ? newPlaying._id : null,
        playTime: newPlaying ? new Date(now.getTime() - 10*1000) : null
      });
    }
  }
});
