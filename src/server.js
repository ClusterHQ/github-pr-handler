var express = require('express');
var bodyParser = require('body-parser');
var rp = require('request-promise');
var crypto = require('crypto');

var allowedActions = ['opened', 'reopened', 'synchronize'];

/**
 * Calculate the HMAC hex digest of the given data using the secret.
 * @function
 * @param {string} data - The data used to compute the HMAC.
 * @param {string} key - The HMAC key to be used.
 * @returns {string} A digest of all data passed to the HMAC.
 */
function calculateSignature(data, key) {
    var hmac = crypto.createHmac('sha1', key);
    hmac.update(data);
    return hmac.digest('hex');
}

/**
 * Calculate the Basic Authorization value for the given username and password.
 * @function
 * @param {string} username - The username to authenticate with.
 * @param {string} password - The password to authenticate with.
 * @returns {string} A value to be used within the Authorization HTTP header.
 */
function calculateBasicAuthValue(username, password) {
    return "Basic " + (new Buffer(username + ":" + password).toString("base64"));
}

/**
 * Start the Github PR handler server.
 * @function
 * @param {number} port - The port that should be used to listen for connections.
 * @param {string} jenkinsServer - The URL of the Jenkins server to trigger jobs on.
 * @param {string} secret - The secret used by Github to sign requests.
 * @param {string} triggerJobName - The name of the job to trigger on Jenkins.
 * @param {string} jenkinsUsername - The Jenkins username to authenticate with.
 * @param {string} jenkinsApiToken - The Jenkins API token to authenticate with.
 * @returns {Promise} A Promise that is resolved once the server is started and listening on the given port.
 */
module.exports = function(port, jenkinsServer, secret, triggerJobName, jenkinsUsername, jenkinsApiToken) {
    var app = express();

    app.use(bodyParser.text({
        type: 'application/json'
    }));

    app.post('/', function (req, res) {
        try {
            // Only process requests that have been signed by GitHub.
            // Valid requests will contain a 'X-Hub-Signature' header, where the value
            // is the HMAC hex digest of the body, using the secret provided with the hook.
            var expectedSignature = calculateSignature(req.body, secret);
            var hasValidSignature = req.get('X-Hub-Signature') === 'sha1=' + expectedSignature;
            if (!hasValidSignature) {
                res.status(400).send('Invalid signature');
                return;
            }

            // Only process requests that are 'pull_request' events.
            var isPullRequest = req.get('X-Github-Event') === 'pull_request';
            if (!isPullRequest) {
                res.status(400).send('Unexpected or missing event type');
                return;
            }

            // The body of the request must contain an 'action'.
            var body = JSON.parse(req.body);
            var hasRequiredFields = body.action !== undefined;
            if (!hasRequiredFields) {
                res.status(400).send('Missing required fields in body');
                return;
            }

            // Only process pull request events that are an allowed action and silently
            // ignore others.
            // Allowed actions include  opening, reopening, or synchronizing a pull request.
            var isAllowedAction = allowedActions.indexOf(body.action) !== -1;
            if (!isAllowedAction) {
                res.status(200).send('Ignoring action: ' + body.action);
                return;
            }

            // Extract the necessary data from the request body and construct the correct
            // Jenkins job URL to post a build request to.
            var request = {
                uri: jenkinsServer +
                    '/job/' + body.repository.owner.login + '-' + body.repository.name +
                    '/job/' + body.pull_request.head.ref +
                    '/job/' + triggerJobName +
                    '/build',
                method: 'POST',
                headers: {
                    Authorization: calculateBasicAuthValue(jenkinsUsername, jenkinsApiToken)
                }
            };
            rp(request)
                .then(function() {
                    console.log('Sent POST request to Jenkins');
                    res.sendStatus(200);
                })
                .catch(function() {
                    console.log("Could not send POST request to Jenkins URL: " + request.uri);
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