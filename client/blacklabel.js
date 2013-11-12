console.log("loading blacklabel.js");

//////////////////////////////////////////////////////////////////////////////

Template.login.loggingIn = function () {
  return Meteor.loggingIn();
};

Template.login.error = function () {
  return Session.get("loginError");
};

Template.login.events({
  // XXX really looking forward to the day when we can find elements
  // relative to a template
  'click .login': function (evt) {
    var username = $('.loginForm .username').val().trim();
    var password = $('.loginForm .password').val().trim();
    if (! username || ! password) {
      Session.set("loginError", "It puts both a username and a password " +
                 "or else it doesn't get in.");
      return;
    }
    Meteor.loginWithPassword(username, password, function (error) {
      if (error) {
        Session.set("loginError", "Login failed");
      } else {
        Session.set("loginError", null);
      }
    });
  }
});

//////////////////////////////////////////////////////////////////////////////

Session.setDefault("activity", "chat");

Template.leftPane.activities = [
  { id: "chat", name: "Chat", icon: "fa-comments-o" },
  { id: "library", name: "Library", icon: "fa-folder-open" },
  { id: "account", name: "Account", icon: "fa-cog" }
];

Template.leftPane.maybeActive = function (what) {
  return Session.equals("activity", this.id) ? "active" : "";
};

Template.leftPane.events({
  'click li': function () {
    Session.set("activity", this.id);
  }
});

//////////////////////////////////////////////////////////////////////////////

Template.chatPane.events = function () {
  console.log("{{events}} evaluated");
  return Events.find();
};

Template.chatPane.username = function () {
  var user = Meteor.users.findOne(this.user);
  return user ? user.username : "???";
};

Template.chatPane.events({
  'keypress textarea': function (evt) {
    if (evt.keyCode === 13) {
      // They pressed enter. Send the message, if nonempty.
      evt.preventDefault();

      var elt = $('.chat-entry textarea');
      var val = elt.val();
      if (val.trim().length === 0)
        return;
      Meteor.call('chat', val);
      elt.val('');
    }
  }
});

//////////////////////////////////////////////////////////////////////////////


Template.top.events({
  'click .linkDropbox': function (evt) {
    Dropbox.requestCredential({}, function (tokenOrError) {
      if (typeof tokenOrError === "string")
        Meteor.call("addDropbox", tokenOrError);
      else
        alert("didn't work: " + tokenOrError);
    });
  }
});

//////////////////////////////////////////////////////////////////////////////

Template.dropboxes.dropboxes = function () {
  return Dropboxes.find();
};

Template.dropboxes.files = function () {
  return Files.find({dropbox: this._id});
};

Template.dropboxes.events({
  'click .song': function () {
    Meteor.call("getSongUrl", this._id, function (err, url) {
      if (err) {
        alert("couldn't fetch url?");
        return;
      } else {
        var player = $('#player');
        player.attr('src',url);
        player[0].play();
      }
    });
  }
});


console.log("done loading blacklabel.js");
