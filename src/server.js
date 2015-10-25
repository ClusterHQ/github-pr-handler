var express = require('express');
var bodyParser = require('body-parser');
var rp = require('request-promise');

var allowedActions = ['opened', 'reopened', 'synchronize'];

module.exports = function(port, externalServer) {
    var app = express();

    app.use(bodyParser.json());

    app.post('/', function (req, res) {
        var isPullRequest = req.get('X-Github-Event') === 'pull_request';
        var isAllowedAction = allowedActions.indexOf(req.body.action) !== -1;
        if (isPullRequest && isAllowedAction) {
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