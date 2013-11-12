Template.top.events = {
  'click .linkDropbox': function (evt) {
    Dropbox.requestCredential({}, function (tokenOrError) {
      if (typeof tokenOrError === "string")
        Meteor.call("addDropbox", tokenOrError);
      else
        alert("didn't work: " + tokenOrError);
    });
  }
};

Template.dropboxes.dropboxes = function () {
  return Dropboxes.find();
};

Template.dropboxes.files = function () {
  return Files.find({dropbox: this._id});
};

Template.dropboxes.events = {
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
};
