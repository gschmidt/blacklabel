// accessToken: credential for making requests
// name: human readable name
// uid: dropbox user id
// user: Meteor user _id of user that owns this dropbox
Dropboxes = new Meteor.Collection('dropboxes');

// dropbox (_id), path, rev, bytes, dirty (boolean),
// metadata: object with keys
// - title
// - artist
// - album
// - year (number)
// - track (number)
Files = new Meteor.Collection('files');

// user (_id)
// when (Date)
// type: currently "chat"
// message: chat message
Events = new Meteor.Collection('events');

// url: URL where media can be fetched
// file: the file that will play (Files _id)
// who: user that queued the song (_id)
// order: sort by this value to get the queue order
// duration: play duration in fractional seconds. null if not known yet
// reportedDurations: durations that have been reported by various
//   users after loading the file. map from userid to reported
//   duration in seconds. the server will set 'duration' to the median
//   of these durations.
QueuedSongs = new Meteor.Collection('queue');

// There is a single object in this collection.
// _id: ''
// playTime: a timestamp
// playItem: _id in the queue that started playing at playTime
// Both will be null if nothing is playing.
PlayStatus = new Meteor.Collection('playstatus');

// Stuff on Meteor.user:
// - invitationCode
// - profile.invitedBy: _id of the inviting user
//   (XXX this is insecure - user shouldn't be able to change it)
Meteor.methods({
  'chat': function (message) {
    check(message, String);
    if (! message.length)
      throw new Meteor.Error("no-message", "Message can't be empty");
    if (! this.userId)
      throw new Meteor.Error("access-denied", "Must be logged in");

    Events.insert({
      user: this.userId,
      when: new Date,
      type: "chat",
      message: message
    });
  }
});

Meteor.startup(function () {
  if (Meteor.isServer) {
    if (PlayStatus.find().count() !== 1) {
      PlayStatus.remove({});
      PlayStatus.insert({
        playTime: null,
        playItem: null
      });
    }
  }
});
