// XXX handle token expiry (it's manual, the user does it)

Meteor.methods({
  addDropbox: function (credentialToken) {
    var creds = Dropbox.retrieveCredential(credentialToken);
    console.log(creds);

    var accessToken = creds.serviceData.accessToken;
    var uid = creds.serviceData.id;
    var name = creds.options.profile.name;

    if (! uid || ! name)
      throw new Meteor.Error('dropbox', "Dropbox returned incomplete response");

    var existing = Dropboxes.findOne({uid: uid});
    if (existing)
      throw new Meteor.Error('already', "That Dropbox is already linked");

    Dropboxes.insert({
      accessToken: accessToken,
      name: name,
      uid: uid
    });
  },
  // it will have a 4 hour expiration time (per current dropbox policy)
  getSongUrl: function (songId) {
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

    return data.url;
  }
});