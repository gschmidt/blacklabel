Meteor.startup(function () {
  Accounts.loginServiceConfiguration.remove({
    service: "dropbox"
  });
  Accounts.loginServiceConfiguration.insert({
    service: "dropbox",
    clientId: "p4ixruo4go46xtq",
    secret: "48mryu16hpg63n5"
  });
});