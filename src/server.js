var express = require('express');
var rp = require('request-promise');

module.exports = function(port, externalServer) {
    var app = express();

    app.post('/', function (req, res) {
        rp(externalServer)
            .then(function() {
                res.sendStatus(200);
            });
    });

    return new Promise(function(resolve, reject) {
        var server = app.listen(port, function () {
            resolve(server);
        });
        server.on('error', reject);
    });
};