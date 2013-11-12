var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');


// map from _id in Dropboxes (not uid!) to true for pollers that
// should continue running. used to stop polling fibers.
var shouldRun = {};

Meteor.startup(function () {
  Dropboxes.find({}).observeChanges({
    added: function (_id, fields) {
      shouldRun[_id] = true;
      Fiber(function () {
        poll(_id);
      }).run();
    },
    removed: function (_id) {
      delete shouldRun[_id];
    }
  });
});

var sleep = function (ms) {
    var fiber = Fiber.current;
    setTimeout(function() {
        fiber.run();
    }, ms);
    Fiber.yield();
};

var poll = function (_id) {
  var info = Dropboxes.findOne(_id);
  if (! info)
    throw new Error("missing dropbox?");
  var cursor = info.cursor;

  while (true) {
    // Stream changes from Dropbox until there are no more
    while (true) {
      if (! _.has(shouldRun, _id))
        return; // time to exit

      try {
        var params = { access_token: info.accessToken };
        if (cursor)
          params.cursor = cursor;

        var data = HTTP.post(
          "https://api.dropbox.com/1/delta", { params: params } ).data;
      } catch (err) {
        console.log("/delta #" + info.uid + ": " + err.message +
                    JSON.stringify(err.response));
        sleep(5000);
        continue; // never give up! never surrender!
      }

      if (data.reset)
        resetDropbox(_id);
      _.each(data.entries, function (entry) {
        applyEntryToDropbox(_id, entry);
      });

      cursor = data.cursor;
      Dropboxes.update(_id, { $set: { cursor: cursor } } );

      if (! data.has_more)
        break;
    }

    // Wait until more changes are available
    while (true) {
      if (! _.has(shouldRun, _id))
        return; // time to exit

      try {
        var params = { access_token: info.accessToken };
        if (cursor)
          params.cursor = cursor;

        // note: does not take an access_token
        var response = HTTP.get(
          "https://api-notify.dropbox.com/1/longpoll_delta", { params: {
            cursor: cursor
          }});

        // dropbox sets the content-type to text/plain, so we have to
        // parse it ourself
        var data = JSON.parse(response.content);
      } catch (err) {
        console.log("/longpoll_delta #" + info.uid + ": " + err.message +
                    JSON.stringify(err.response));
        sleep(5000);
        continue;
      }

      if (data.changes)
        break; // go fetch the changes

      if (data.backoff) {
        console.log("#" + info.uid + ": dropbox requests backoff: " +
                    data.backoff);
        sleep(data.backoff * 1000);
      }
    }
  }
};

var resetDropbox = function (_id) {
  var info = Dropboxes.findOne(_id);
  if (! info)
    throw new Error("missing dropbox?");

  Files.remove({dropbox: _id});
};

var applyEntryToDropbox = function (_id, entry) {
  var info = Dropboxes.findOne(_id);
  if (! info)
    throw new Error("missing dropbox?");

  var path = entry[0];
  var data = entry[1];

  if (! data || data.is_dir)
    Files.remove({dropbox: _id, path: path});
  else {
    Files.upsert({dropbox: _id, path: path},
                 {$set: { rev: data.rev, dirty: true } });
  }
};
