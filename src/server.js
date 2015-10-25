var express = require('express');
var rp = require('request-promise');

module.exports = function(port, externalServer) {
    var app = express();

    app.post('/', function (req, res) {
        if(req.get('X-Github-Event') === 'pull_request') {
            var request = {
                uri: externalServer,
                method: 'POST'
            };
            rp(request)
                .then(function() {
                    res.sendStatus(200);
                });
        } else {
            res.sendStatus(404);
        }
    });

    return new Promise(function(resolve, reject) {
        var server = app.listen(port, function () {
            resolve(server);
        });
        server.on('error', reject);
    });
};