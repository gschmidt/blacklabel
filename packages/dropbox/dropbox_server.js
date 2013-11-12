Dropbox = {};

Oauth.registerService('dropbox', 2, null, function(query) {
  var accessToken = getAccessToken(query);
  var identity = getIdentity(accessToken);

  return {
    serviceData: {
      id: identity.uid,
      accessToken: accessToken
    },
    options: {profile: {name: identity.display_name}}
  };
});

var getAccessToken = function (query) {
  var config = ServiceConfiguration.configurations.findOne({service: 'dropbox'});
  if (!config)
    throw new ServiceConfiguration.ConfigError("Service not configured");

  // Dropbox requires a https URL except for localhost.
  // XXX this is a bit of a mess, and it's duplicated in dropbox_client too
  if (Meteor.absoluteUrl({}).match(/http:\/\/localhost[:\/]/))
    var https = false;
  else
    var https = true;

  var response;
  try {
    response = HTTP.post(
      "https://api.dropbox.com/1/oauth2/token", {
        headers: {
          Accept: 'application/json'
        },
        params: {
          code: query.code,
          client_id: config.clientId,
          client_secret: config.secret,
          grant_type: 'authorization_code',
          redirect_uri: Meteor.absoluteUrl("_oauth/dropbox?close",
                                           {secure: https})
        }
      });
  } catch (err) {
    throw _.extend(new Error("Failed to complete OAuth handshake with Dropbox. " + err.message),
                   {response: err.response});
  }
  if (response.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with Dropbox. " + response.data.error);
  } else {
    // also returns 'uid', but we can get that via /account/info too
    return response.data.access_token;
  }
};

var getIdentity = function (accessToken) {
  try {
    return HTTP.get(
      "https://api.dropbox.com/1/account/info", {
        params: {access_token: accessToken}
      }).data;
  } catch (err) {
    throw _.extend(new Error("Failed to fetch identity from Dropbox. " + err.message),
                   {response: err.response});
  }
};


Dropbox.retrieveCredential = function(credentialToken) {
  return Oauth.retrieveCredential(credentialToken);
};
