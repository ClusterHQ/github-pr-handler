var express = require('express');
var bodyParser = require('body-parser');
var rp = require('request-promise');
var crypto = require('crypto');

var allowedActions = ['opened', 'reopened', 'synchronize'];

function calculateSignature(body, secret) {
    var hmac = crypto.createHmac('sha1', secret);
    hmac.update(body);
    return hmac.digest('hex');
}

module.exports = function(port, externalServer, secret, triggerJobName) {
    var app = express();

    app.use(bodyParser.text({
        type: 'application/json'
    }));

    app.post('/', function (req, res) {
        try {
            var expectedSignature = calculateSignature(req.body, secret);
            var hasValidSignature = req.get('X-Hub-Signature') === 'sha1=' + expectedSignature;
            if (!hasValidSignature) {
                res.status(400).send('Invalid signature');
                return;
            }

            var isPullRequest = req.get('X-Github-Event') === 'pull_request';
            if (!isPullRequest) {
                res.status(400).send('Unexpected or missing event type');
                return;
            }

            var body = JSON.parse(req.body);
            var hasRequiredFields = body.action !== undefined;
            if (!hasRequiredFields) {
                res.status(400).send('Missing required fields in body');
                return;
            }

            var isAllowedAction = allowedActions.indexOf(body.action) !== -1;
            if (!isAllowedAction) {
                res.sendStatus(200);
                return;
            }

            var request = {
                uri: externalServer +
                    '/job/' + body.repository.owner.login + '-' + body.repository.name +
                    '/job/' + body.head.ref +
                    '/job/' + triggerJobName +
                    '/build',
                method: 'POST'
            };
            rp(request)
                .then(function() {
                    res.sendStatus(200);
                })
                .catch(function() {
                    res.sendStatus(500);
                });
        } catch (e) {
            console.log("Internal server error: " + e);
            console.log(e.stack);
            res.sendStatus(500);
        }
    });

    return new Promise(function(resolve, reject) {
        var server = app.listen(port, function() {
            resolve(server);
        });
        server.on('error', reject);
    });
};