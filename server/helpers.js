var Fiber = Npm.require('fibers');

sleep = function (ms) {
    var fiber = Fiber.current;
    setTimeout(function() {
        fiber.run();
    }, ms);
    Fiber.yield();
};

