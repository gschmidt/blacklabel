console.log("loading model");

Dropboxes = new Meteor.Collection('dropboxes');

// dropbox (_id), path, rev, dirty (boolean)
Files = new Meteor.Collection('files');

// user (_id)
// when (Date)
// type: currently "chat"
// message: chat message
Events = new Meteor.Collection('events');


Meteor.methods({
  'chat': function (message) {
    console.log("chat", message);
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


console.log("done loading model");
