Meteor.autorun(function () {
  Meteor.userId(); // create a dependency
  Meteor.call('getInvitationCode', function (err, code) {
    if (! err)
      Session.set("invitationCode", code);
  });
});

var locationDep = new Deps.Dependency;
window.addEventListener("popstate", function (event) {
  locationDep.changed();
});

var providedInvitationCode = function () {
  locationDep.depend();
  var match = document.location.pathname.match(/^\/engulf\/(.+)$/);
  return match ? match[1] : null;
};

Meteor.autorun(function () {
  var code = providedInvitationCode();
  if (code) {
    if (Meteor.userId())
      Meteor.logout();

    Meteor.call('getInvitationInfo', code, function (err, info) {
    if (! err)
      Session.set("invitationInfo", info);
    });
  }
});


UI.body.haveInvitationCode = function () {
  return !! providedInvitationCode();
};

//////////////////////////////////////////////////////////////////////////////

Template.join.by = function () {
  var info = Session.get("invitationInfo");
  return info && info.by || "???";
};

Template.join.songCount = function () {
  var info = Session.get("invitationInfo");
  return info && info.songs || "???";
};

Template.join.userCount = function () {
  var info = Session.get("invitationInfo");
  return info && info.users || "???";
};

Template.join.error = function () {
  return Session.get("loginError");
};

Template.join.events({
  'submit': function (evt) {
    var username = $('.join-form .username').val().trim();
    var password = $('.join-form .password').val().trim();
    if (! username || ! password) {
      Session.set("loginError", "You have to fill in. Both. Things.");
      return;
    }
    Accounts.createUser({
      username: username,
      password: password,
      invitationCode: providedInvitationCode()
    }, function (err) {
      if (err) {
        Session.set("loginError", "No good. " + err.reason);
        return;
      }
      history.pushState({}, "", "/");
      Session.set("loginError", null);
    });

    evt.preventDefault();
  }
});


//////////////////////////////////////////////////////////////////////////////

Template.login.error = function () {
  return Session.get("loginError");
};

Template.login.events({
  // XXX really looking forward to the day when we can find elements
  // relative to a template
  'submit': function (evt) {
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
    evt.preventDefault();
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
  'click li.activity': function () {
    Session.set("activity", this.id);
  },
  'click .logout': function () {
    Meteor.logout();
  }
});

//////////////////////////////////////////////////////////////////////////////

Template.top.activityIs = function (what) {
  return Session.equals("activity", what);
};

//////////////////////////////////////////////////////////////////////////////

// XXX need to add scroll position management

Template.chatPane.allEvents = function () {
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

Template.accountPane.haveDropbox = function () {
  return Dropboxes.find({ user: Meteor.userId() }).count() > 0;
};

Template.accountPane.linkedDropboxName = function () {
  var dropbox = Dropboxes.findOne({ user: Meteor.userId() })
  return dropbox.name + " (#" + dropbox.uid + ")";
};

Template.accountPane.events({
  'click .linkDropbox': function (evt) {
    Dropbox.requestCredential({}, function (tokenOrError) {
      if (typeof tokenOrError === "string")
        Meteor.call("addDropbox", tokenOrError);
      else
        alert("didn't work: " + tokenOrError);
    });
  },
  'click .unlinkDropbox': function (evt) {
    Meteor.call("removeDropbox",
                Dropboxes.findOne({ user: Meteor.userId() })._id,
                function (err) {
                  if (err)
                    alert("Failed to unlink Dropbox?? " +
                          "How is this possible?!");
                });
  }
});

Template.accountPane.invitationLink = function () {
  var code = Session.get("invitationCode");
  if (! code)
    return "[loading your code]";
  return Meteor.absoluteUrl("engulf/" + code);
};

Template.accountPane.invitedBy = function () {
  var user = Meteor.user();
  if (! user || ! user.profile || ! user.profile.invitedBy)
    return "nobody";
  var by = Meteor.users.findOne(user.profile.invitedBy);
  return by && by.username || "???";
};

Template.accountPane.whoYouInvited = function () {
  var invitees =
    Meteor.users.find({ 'profile.invitedBy': Meteor.userId() }).fetch();

  var names = _.map(invitees, function (i) {
    return "<b>" + (i.username || '???').replace(/[<>]/g, '.') + "</b>";
  });

  if (names.length === 0)
    return "You haven't recruited anyone yet.";
  else if (names.length === 1)
    return "You recruited " + names[0] + ".";
  else {
    var allButLast = names.slice(0, names.length - 1);
    var last = names[names.length - 1];
    return "You recruited " + allButLast.join(", ") + " and " + last + ".";
  }
};


//////////////////////////////////////////////////////////////////////////////

Template.libraryPane.dropboxes = function () {
  return Dropboxes.find();
};

Template.libraryPane.files = function () {
  return Files.find({ dropbox: this._id },
                    { sort: ["metadata.artist", "metadata.album",
                             "metadata.track", "metadata.title" ] });
};

Template.libraryPane.filesWithoutMetadata = function () {
  return Files.find({ hasMetadata: { $ne: true } },
                    { sort: [ "path" ] });
};

Template.libraryPane.anyWithoutMetadata = function () {
  return Files.find({ hasMetadata: { $ne: true } }).count() > 0;
};

Template.libraryPane.events({
  'click .song': function () {
    Meteor.call("enqueue", this._id, function (err) {
      if (err) {
        alert("couldn't queue song?");
      }
    });
  }
});

//////////////////////////////////////////////////////////////////////////////

// Map from qsid to true for selected items.
// XXX provide an easy, public way to set up migration on ReactiveDicts
Selection = new ReactiveDict(
  Package.reload.Reload._migrationData('selection'));
Package.reload.Reload._onMigrate('selection', function () {
  return [true, {keys: Selection.getMigrationData()}];
});

//////////////////////////////////////////////////////////////////////////////

Template.rightPane.queuedSongs = function () {
  return QueuedSongs.find({}, { sort: ['order'] });
};

Template.rightPane.percentLoaded = function () {
  var fraction = QueueManager.fractionLoaded(this._id);
  return (fraction * 100).toFixed(1) + "%";
};

Template.rightPane.username = function () {
  var user = Meteor.users.findOne(this.who);
  return user && user.username || "???";
};

Template.rightPane.file = function () {
  return Files.findOne(this.file);
};

Template.rightPane.maybeSelected = function () {
  return Selection.get(this._id) ? "selected" : "";
};

Template.rightPane.maybeDragging = function () {
  var dqi = Session.get("draggingQueueItems") || [];
  return _.contains(dqi, this._id) ? "dragging" : "";
};

Template.rightPane.maybeDropAfter = function () {
  // XXX would be nice to write 'dropInQueue.after' for better
  // reactive performance
  var drop = Session.get("dropInQueue");
  if (! drop)
    return "";
  if ((this._id && drop.after === this._id) ||
      (! this._id && drop.atTop /* header */))
    return "drop-after";
  return "";
};

Template.rightPane.isInPast = function () {
  return QueueManager.isInPast(this._id);
};

Template.rightPane.maybePlaying = function () {
  return QueueManager.isCurrentlyPlaying(this._id) ? "playing" : "";
};

Template.rightPane.events({
  'click .entry': function (evt) {
    var mode = "normal";
    if (evt.ctrlKey || evt.metaKey)
      mode = "toggle";
    else if (evt.shiftKey)
      mode = "range";

    if (mode === "normal") {
      // Clear existing selection
      // XXX provide a public way to get keys on ReactiveDicts
      _.each(Selection.keys, function (value, key) {
        Selection.set(key, undefined);
      });

      Selection.set(this._id, true);
    }

    if (mode === "toggle") {
      Selection.set(this._id, ! Selection.get(this._id));
    }

    if (mode === "range") {
      // This is fairly primitive range selection behavior, but it'll
      // do for Blacklabel.
      //
      // "Proper" multiple selection behavior is a lot more
      // sophisticated in how it handles repeated shift-clicks, and in
      // how it handles shift-up and shift-down as combined with
      // shift-click and command-click. The OS X Finder does a good
      // job.
      var queue = QueuedSongs.find({}, { sort: ["order"] }).fetch();
      var findIndex = function (id) {
        for (var i = 0; i < queue.length; i++)
          if (queue[i]._id === id)
            return i;
        return 0;
      }

      var from = findIndex(Session.get("lastClickedItem"));
      var to = findIndex(this._id);

      if (from > to) {
        var swap = to;
        to = from;
        from = swap;
      }

      for (var i = from; i <= to; i++)
        Selection.set(queue[i]._id, true);
    }

    Session.set("lastClickedItem", this._id);
  },
  'keydown': function (evt) {
    if (evt.which === 8 || evt.which === 46) { // backspace, delete
      var items = [];
      // XXX it looks like keys hang around in selection forever, so
      // that it grows without bound? setting to undefined should be
      // made to release the memory..
      _.each(Selection.keys, function (selected, id) {
        if (selected === "true") {
          items.push(id);
          Selection.set(id, undefined);
        }
      });

      Meteor.call('dequeue', items);
      evt.preventDefault();
      return;
    }
  },
  'dragstart': function (evt) {
    // If you start the drag outside the selection, make the dragged
    // item be the selection.
    if (! Selection.get(this._id)) {
      // XXX use of private interface
      _.each(Selection.keys, function (value, key) {
        Selection.set(key, undefined);
      });
      Selection.set(this._id, true);
    }

    var items = [];
    QueuedSongs.find({}, { sort: ["order"] }).forEach(function (qs) {
      if (Selection.get(qs._id) === true &&
          ! QueueManager.isInPast(qs._id))
        items.push(qs._id);
    });

    Session.set("draggingQueueItems", items);
    evt.originalEvent.dataTransfer.effectAllowed = "move";
    evt.originalEvent.dataTransfer.setData(
      "application/x-blacklabel-queue-move", "");
  },
  'dragend': function () {
    Session.set("draggingQueueItems", []);
    Session.set("dropInQueue", null);
  },
  'dragover .entry': function (evt) {
    evt.preventDefault(); // necessary for drop to happen

    var pageY;
    if (_.has(evt, 'pageY'))
      pageY = evt.pageY;
    else if (_.has(evt.originalEvent, 'pageY'))
      pageY = evt.originalEvent.pageY;
    else {
      // OK, so this property is nonstandard, but provided by jQuery
      // and at least modern Chrome and Firefox. But, jQuery doesn't
      // provide it on dragover (yet?). If you get this error you
      // should either fix that about jQuery or cut and paste the
      // jQuery logic here.
      Log.error("Unsupported browser -- no pageY");
      return;
    }

    var elt = $('.item-' + this._id);
    var y = pageY - elt.offset().top;
    var ymax = elt.height();
    if (! ymax)
      return;
    if (y / ymax > .5) {
      Session.set("dropInQueue", { after: this._id });
    } else {
      // Find previous item
      var prev = QueuedSongs.findOne({ order: { $lt: this.order } },
                                     { sort: { order: -1 } });
      if (! prev || QueueManager.isInPast(prev._id)) {
        Session.set("dropInQueue", { atTop: true });
      }
      else
        Session.set("dropInQueue", { after: prev._id });
    }

    evt.originalEvent.dataTransfer.dropEffect = "move";
  },
  'dragleave .entry': function (evt) {
    Session.set("dropInQueue", null);
  },
  'drop .entry': function (evt) {
    evt.stopPropagation();
    evt.preventDefault();

    if (Session.get("draggingQueueItems")) {
      // This is a queue reordering
      Meteor.call("moveInQueue",
                  Session.get("draggingQueueItems"),
                  (Session.get("dropInQueue") || {}).after || null);
    } else {
      Log.error("bad drop in queue?");
    }
  }
});
