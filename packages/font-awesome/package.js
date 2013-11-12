Package.describe({
  summary: "Comprehensive, easy-to-use icon set"
});

// XXX APP WEEK NOTES
// - including urls to static assets in css continues to be a pain! we need
//   to parse the css and relocate them.
// - packages need to have a private, per-package chunk of URL space
//   that they can take to serve their HTTP assets. maybe we already
//   have something like this but if so I don't understand it.
// - there needs to be a clear way to include client assets (just HTTP
//   files?  or Assets.getXXX assets? I am actually sort of unclear on
//   the difference) in packages, so that they are served over HTTP. a
//   comment in packages.js says that having a file with no extension
//   handler will do for now but that it's considered a hack. clean
//   this up.

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('underscore', 'client');
  api.use('templating', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Dropbox');

  api.add_files(
    [
      // This has been modified to change the relative path
      // '../fonts/' to the absolute path '/_fonts'.
      'font-awesome.modified.css',

      '_fonts/FontAwesome.otf',
      '_fonts/fontawesome-webfont.ttf',
      '_fonts/fontawesome-webfont.eot',
      '_fonts/fontawesome-webfont.woff',
      '_fonts/fontawesome-webfont.svg'
    ], 'client');
});
