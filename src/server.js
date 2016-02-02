var express = require('express');
var bodyParser = require('body-parser');
var rp = require('request-promise');
var crypto = require('crypto');

var allowedActions = ['opened', 'reopened', 'synchronize'];

//add timestamps in front of log messages
require('console-stamp')(console, '[HH:MM:ss.l]');

//helper method to log runtime messages
//initially logs to console
function runtimeLog() {
    if (process.env.NODE_ENV !== 'test') {
        console.log.apply(console, arguments);
    }
}

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
    return 'Basic ' + (new Buffer(username + ':' + password).toString('base64'));
}

function poll(fn, interval, limit) {
    function delay(interval) {
        return new Promise(function(fulfill) {
            setTimeout(fulfill, interval);
        });
    }

    function timeout(promise, time) {
        return Promise.race([promise, delay(time).then(function () {
            runtimeLog('Operation timed out : interval : %s limit : %s', interval, limit)
            throw new Error('Operation timed out');
        })]);
    }

    function pollRecursive() {
        return fn().then(function(result) {
            if (result) {
                return true;
            } else {
                return delay(interval).then(pollRecursive);
            }
        });
    }

    return timeout(pollRecursive(), limit);
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

            var owner = body.repository.owner.login;
            var repo = body.repository.name;
            var branch = body.pull_request.head.ref;
            var auth_header = calculateBasicAuthValue(jenkinsUsername, jenkinsApiToken);

            runtimeLog('Received : %s %s %s %s', owner, repo, branch, auth_header)

            var handleError = function(err) {
                if (err.hasOwnProperty('options')) {
                    runtimeLog('Could not send request to Jenkins URL: ' + err.options.uri);
                } else {
                    runtimeLog(err);
                }
            };

            // Trigger the setup job and wait for it to complete.
            var setupJobs = function() {
                var setupJobRequest = {
                    uri: jenkinsServer +
                        '/job/setup_' + owner + '-' + repo +
                        '/buildWithParameters?RECONFIGURE_BRANCH=' + branch,
                    method: 'POST',
                    headers: {
                        Authorization: auth_header
                    },
                    resolveWithFullResponse: true
                };

                runtimeLog('setupJobRequest : %j', setupJobRequest)

                // Trigger the setup job. The response header will include the URL with
                // details of the build that will be queued.
                return rp(setupJobRequest)
                    .then(function(response) {
                        // Make a request to the URL in the response header.
                        // When setup job build has been queued, the body of the response
                        // will contain a URL with details of the build including the status.
                        var getQueuedSetupJobRequest = {
                            uri: response.headers.location + '/api/json',
                            method: 'GET',
                            headers: {
                                Authorization: auth_header
                            }
                        };

                        runtimeLog('getQueuedSetupJobRequest : %j', getQueuedSetupJobRequest)

                        var buildUrl;
                        var checkBuildHasBeenQueued = function() {
                            // The setup job build has been queued once the executable.url
                            // property is available in the response.
                            return rp(getQueuedSetupJobRequest)
                                .then(function(body) {
                                    var queuedBuildInfo = JSON.parse(body);
                                    if (queuedBuildInfo.hasOwnProperty('executable')) {
                                        buildUrl = queuedBuildInfo.executable.url;
                                        runtimeLog('Build queued : %s', buildUrl)
                                        return true;
                                    }
                                    runtimeLog('Build not queued')
                                    return false;
                                });
                        };

                        return poll(checkBuildHasBeenQueued, 500, 20000)
                            .then(function() {
                                return buildUrl;
                            });
                    })
                    .then(function(url) {
                        // Check the status of the setup build by making a request to the URL
                        // with the build details.
                        // The build status will be one of the following:
                        // SUCCESS - the build completed successfully. The main build can now take place.
                        // FAILURE - the build failed. We can't continue with the main build.
                        // null - the build is incomplete. Wait and query again.

                        // The host in the URL in the response may not be accessible so replace it
                        // with the provided server URL.
                        url = url.replace(new RegExp('http://[^/]+'), jenkinsServer);
                        var getSetupJobInfoStatus = {
                            uri: url + '/api/json',
                            method: 'GET',
                            headers: {
                                Authorization: auth_header
                            }
                        };

                        runtimeLog('getSetupJobInfoStatus : %j', getSetupJobInfoStatus)

                        var checkIfSetupSucceeded = function() {
                            return rp(getSetupJobInfoStatus)
                                .then(function(body) {
                                    var setupJobStatus = JSON.parse(body);
                                    if (setupJobStatus.result === 'SUCCESS') {
                                        runtimeLog('Setupjob : Succeded');
                                        return true;
                                    } else if (setupJobStatus.result === 'FAILURE') {
                                        runtimeLog('Setupjob : Failed');
                                        throw new Error('Build Failed');
                                    }
                                    runtimeLog('Setupjob : Unknown : %s', setupJobStatus.result)
                                    return false;
                                });
                        };

                        return poll(checkIfSetupSucceeded, 500, 50000);
                    });
            };

            // Request to trigger the build of the main multijob
            var makeBuildRequest = function() {
                var request = {
                    uri: jenkinsServer +
                        '/job/' + owner + '-' + repo +
                        '/job/' + branch +
                        '/job/' + triggerJobName +
                        '/build',
                    method: 'POST',
                    headers: {
                        Authorization: auth_header
                    }
                };
                return rp(request);
            };

            setupJobs()
                .then(makeBuildRequest)
                .then(function() {
                    runtimeLog('Finished successfully');
                    res.sendStatus(200);
                })
                .catch(function(err) {
                    runtimeLog('Finished with error');
                    handleError(err);
                    res.sendStatus(500);
                });
        } catch (e) {
            console.log('Internal server error: ' + e);
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
