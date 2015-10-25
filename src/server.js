var express = require('express');

module.exports = function(port) {
    var app = express();

    app.post('/', function (req, res) {
        res.sendStatus(200);
    });

    return new Promise(function(resolve, reject) {
        var server = app.listen(port, function () {
            resolve(server);
        });
        server.on('error', reject);
    });
};