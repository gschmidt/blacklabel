Dropbox = {};

// Request Dropbox credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Dropbox.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'dropbox'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }
  var credentialToken = Random.id();

  var scope = (options && options.requestPermissions) || [];
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  // Dropbox requires a https URL except for localhost.
  // XXX this is a bit of a mess, and it's duplicated in dropbox_server too
  if (Meteor.absoluteUrl({}).match(/http:\/\/localhost[:\/]/))
    var https = false;
  else
    var https = true;

  var loginUrl =
    'https://dropbox.com/1/oauth2/authorize' +
    '?client_id=' + config.clientId +
    '&response_type=code' +
    '&scope=' + flatScope +
    '&redirect_uri=' + Meteor.absoluteUrl('_oauth/dropbox?close',
                                          {secure: https}) +
    '&state=' + credentialToken;

  Oauth.initiateLogin(credentialToken, loginUrl, credentialRequestCompleteCallback,
                                {width: 900, height: 450});
};
