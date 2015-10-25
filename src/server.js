var express = require('express');
var rp = require('request-promise');

module.exports = function(port, externalServer) {
    var app = express();

    app.post('/', function (req, res) {
        var request = {
            uri: externalServer,
            method: 'POST'
        };
        rp(request)
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