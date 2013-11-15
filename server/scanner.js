var Fiber = Npm.require('fibers');

var NUM_SCANNERS = 5;

var Scanner = function () {
  var self = this;
  self.queue = []; // array of File _id's to process
  self.running = false;
  self.fiber = Fiber(function () {
    self.work();
  });
};

var scanners = [];
for (var i = 0; i < NUM_SCANNERS; i++)
  scanners.push(new Scanner);

_.extend(Scanner.prototype, {
  enqueue: function (id) {
    var self = this;
    self.queue.push(id);
    if (! self.running) {
      self.running = true;
      self.fiber.run();
    }
  },
  work: function () {
    var self = this;

    while (true) {
      while (! self.queue.length) {
        self.running = false;
        Fiber.yield();
      }

      // Get objects
      var file = Files.findOne(self.queue.shift());
      if (! file)
        continue;
      var dropbox = Dropboxes.findOne(file.dropbox);
      if (! dropbox)
        continue;

      if (! file.bytes || file.bytes < 128)
        // Not big enough to have an ID3 tag.. no point.
        continue;

      // Get a URL for accessing the file
      try {
        var data = HTTP.post(
          "https://api.dropbox.com/1/media/dropbox" + file.path, {
            params: { access_token: dropbox.accessToken }
          }).data;
      } catch (err) {
        console.log("#" + dropbox.uid + " failed to fetch URL for scanning " +
                    song.path + ": " + err.message);
        continue;
      }

      // Get the last 128 bytes of the file, which is hopefully the ID3 tag
      // XXX except no, get the first 128 for now
      try {
        var result = HTTP.get(data.url, {
          headers: {
            'Range': 'bytes=' + (file.bytes - 128) + "-" + (file.bytes - 1)
          }
        });
      } catch (err) {
        console.log("#" + dropbox.uid + " failed to snap tag for " +
                    song.path + ": " + err.message);
        self.queue.push(file._id);
        sleep(1000); // back off a little bit
        continue;
      }

      var setOp = { dirty: false };

      var metadata = decodeId3v1(result.content);
      if (metadata) {
        _.each(metadata, function (value, key) {
          setOp['metadata.' + key] = value;
        });
        setOp.hasMetadata = true;
      }

      Files.update(file._id, { $set: setOp });
    }
  }
});

var decodeId3v1 = function (raw) {
  // XXX 'raw' is a string (because that's what HTTP gives us)?!
  // that's a bit of a deal-killer?!
  if (raw.substr(0,3) !== "TAG")
    return null;

  var cut = function (s) {
    for (var i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) === 0) {
        s = s.substr(0, i);
        break;
      }
    }

    return s.trim();
  };

  var ret = {};
  ret.title = cut(raw.substr(3, 30));
  ret.artist = cut(raw.substr(33, 30));
  ret.album = cut(raw.substr(63, 30));
  ret.year = + (raw.substr(93, 4));
  var comment = raw.substr(97, 28);
  var zero = raw.substr(125, 1);
  ret.track = zero.charCodeAt(0) === 0 ?
    raw.substr(126, 1).charCodeAt(0) : null;
  var genre = raw.substr(127, 1);
  return ret;
};

Meteor.startup(function () {
  Files.find({ dirty: true }).observeChanges({
    added: function (_id) {
      // pick the least loaded scanner
      var scanner = scanners.sort(function (a, b) {
        return a.queue.length < b.queue.length ? -1 : 1;
      })[0];

      scanner.enqueue(_id);
    }
  });
});
