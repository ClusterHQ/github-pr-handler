var http = require('http');
var rp = require('request-promise');
var expect = require('chai').expect;
var createrServer = require('../src/server');
var crypto = require('crypto');

describe('server', function() {
    var port = 8081;
    var server;
    var serverURL = 'http://localhost:' + port + '/';
    var secret = 'this-is-a-very-good-secret-indeed';
    var triggerJobName = 'triggerJobName';

    var externalServer = http.Server();
    var externalServerPort = 8082;
    var externalServerURL = 'http://localhost:' + externalServerPort;
    var externalServerResponses = [];
    var externalRequests = [];
    externalServer.on('request', function(req, res) {
        externalRequests.push(req);
        var externalResponse = externalServerResponses.shift();
        res.writeHead(externalResponse.statusCode, externalResponse.headers);
        res.write(JSON.stringify(externalResponse.body));
        res.end();
    });

    var body, request, response;

    before(function() {
        return new Promise(function(resolve) {
            externalServer.listen(externalServerPort, resolve);
        })
    });

    after(function() {
       externalServer.close();
    });

    function hmacBody(body, secret) {
        var hmac = crypto.createHmac('sha1', secret);
        hmac.update(JSON.stringify(body));
        return hmac.digest('hex');
    }

    function doRequest() {
        request.headers['X-Hub-Signature'] = 'sha1=' + hmacBody(body, secret);
        request.body = body;
        return rp(request)
            .then(function(r) {
                response = r;
            });
    }

    var setupJobQueueURL = '/job/in/queue';
    var setupJobBuildURL = '/job/build/id';

    function createExternalResponses() {
        var responses = [];
        responses.push(
            // Response from triggering the setup job
            {
                statusCode: 200,
                headers: {
                    location: externalServerURL + setupJobQueueURL
                },
                body: {}
            },
            // Response from inspecting the setup job in the queue
            {
                statusCode: 200,
                headers: {},
                body: {
                    executable: {
                        url: externalServerURL + setupJobBuildURL
                    }
                }
            },
            // Response from checking the setup job status
            {
                statusCode: 200,
                headers: {},
                body: {
                    result: 'SUCCESS'
                }
            },
            // Response from triggering the main build job
            {
                statusCode: 200,
                headers: {},
                body: {}
            }
        );
        return responses;
    }

    beforeEach(function() {
        externalRequests = [];
        externalServerResponses = createExternalResponses();
        response = null;
        body = {
            action: 'opened',
            repository: {
                name: 'Repo',
                owner: {
                    login: 'Org'
                }
            },
            pull_request: {
                head: {
                    ref: 'branch'
                }
            }
        };
        request = {
            method: 'POST',
            headers: {
                'X-Github-Event': 'pull_request'
            },
            json: true,
            uri: serverURL,
            simple: false,
            resolveWithFullResponse: true
        };
        return createrServer(port, externalServerURL, secret, triggerJobName, 'user', 'api_token')
            .then(function(s) {
                server = s;
            });
    });

    afterEach(function(done) {
        server.close(function() {
            done();
        });
    });

    context('when a valid request is received', function() {
        beforeEach(doRequest);
        it('responds with a 200', function() {
            expect(response.statusCode).to.equal(200);
        });
        it('sends four requests', function() {
            expect(externalRequests).to.have.length(4);
        });
        describe('the setup request', function() {
            it('includes the branch name for the pull-request in the URL', function() {
                var url = '/job/setup_Org-Repo/buildWithParameters?RECONFIGURE_BRANCH=branch';
                expect(externalRequests).to.have.deep.property('[0].url', url);
            });
            it('sends a POST request', function() {
                expect(externalRequests).to.have.deep.property('[0].method', 'POST');
            });
            it('includes the correct authentication header', function() {
                expect(externalRequests).to.have.deep
                    .property('[0].headers.authorization', 'Basic dXNlcjphcGlfdG9rZW4=');
            });
            context('when the request fails', function() {
                it('responds with a 500', function() {
                    externalServerResponses = createExternalResponses();
                    externalServerResponses[0].statusCode = 500;
                    return doRequest()
                        .then(function() {
                            expect(response.statusCode).to.equal(500);
                        });
                });
            });
        });
        describe('the build queue request', function() {
            it('uses the URL included in the response from the setup request', function() {
                var url = setupJobQueueURL + '/api/json';
                expect(externalRequests).to.have.deep.property('[1].url', url);
            });
            it('sends a GET request', function() {
                expect(externalRequests).to.have.deep.property('[1].method', 'GET');
            });
            it('includes the correct authentication header', function() {
                expect(externalRequests).to.have.deep
                    .property('[1].headers.authorization', 'Basic dXNlcjphcGlfdG9rZW4=');
            });
            context('when the request fails', function() {
                it('responds with a 500', function() {
                    externalServerResponses = createExternalResponses();
                    externalServerResponses[1].statusCode = 500;
                    return doRequest()
                        .then(function() {
                            expect(response.statusCode).to.equal(500);
                        });
                });
            });
        });
        describe('the setup job status request', function() {
            it('uses the URL included in the response from the build queue request', function() {
                var url = setupJobBuildURL + '/api/json';
                expect(externalRequests).to.have.deep.property('[2].url', url);
            });
            it('sends a GET request', function() {
                expect(externalRequests).to.have.deep.property('[2].method', 'GET');
            });
            it('includes the correct authentication header', function() {
                expect(externalRequests).to.have.deep
                    .property('[2].headers.authorization', 'Basic dXNlcjphcGlfdG9rZW4=');
            });
            context('when the respsonse URL host does not match the external server host', function() {
                it('replaces the host in the request with the external server host', function () {
                    var host = 'http://127.0.0.1:8082';
                    externalRequests = [];
                    externalServerResponses = createExternalResponses();
                    externalServerResponses[1].body.executable.url = host + setupJobBuildURL;
                    return doRequest()
                        .then(function() {
                            var expectedHost = externalServerURL.replace('http://', '');
                            expect(externalRequests).to.have.deep.property('[2].headers.host', expectedHost);
                        });
                });
            });
            context('when the request fails', function() {
                it('responds with a 500', function() {
                    externalServerResponses = createExternalResponses();
                    externalServerResponses[2].statusCode = 500;
                    return doRequest()
                        .then(function() {
                            expect(response.statusCode).to.equal(500);
                        });
                });
            });
        });
        describe('the build request', function() {
            it('includes the branch name for the pull-request in the URL', function() {
                var url = '/job/Org-Repo/job/branch/job/triggerJobName/build';
                expect(externalRequests).to.have.deep.property('[3].url', url);
            });
            it('sends a POST request', function() {
                expect(externalRequests).to.have.deep.property('[3].method', 'POST');
            });
            it('includes the correct authentication header', function() {
                expect(externalRequests).to.have.deep
                    .property('[3].headers.authorization', 'Basic dXNlcjphcGlfdG9rZW4=');
            });
            context('when the request fails', function() {
                it('responds with a 500', function() {
                    externalServerResponses = createExternalResponses();
                    externalServerResponses[3].statusCode = 500;
                    return doRequest()
                        .then(function() {
                            expect(response.statusCode).to.equal(500);
                        });
                });
            });
        });
    });

    it('considers "opened" a valid action', function () {
        body.action = 'opened';
        return doRequest()
            .then(function() {
                expect(response.statusCode).to.equal(200);
            });
    });
    it('considers "reopened" a valid action', function () {
        body.action = 'reopened';
        return doRequest()
            .then(function() {
                expect(response.statusCode).to.equal(200);
            });
    });
    it('considers "synchronize" a valid action', function () {
        body.action = 'synchronize';
        return doRequest()
            .then(function() {
                expect(response.statusCode).to.equal(200);
            });
    });
    context('when the received request is for the wrong URL', function() {
        beforeEach(function() {
            request.uri = serverURL + 'something-completely-different';
            return doRequest();
        });
        it('responds with a 404', function() {
            expect(response.statusCode).to.equal(404);
        });
        it('does not send a request', function() {
            expect(externalRequests).to.be.empty;
        });
    });
    context('when the received request is not a POST request', function() {
        beforeEach(function() {
            request.method = 'GET';
            return doRequest();
        });
        it('responds with a 404', function() {
            expect(response.statusCode).to.equal(404);
        });
        it('does not send a request', function() {
            expect(externalRequests).to.be.empty;
        });
    });
    context('when the received request does not contain a X-Github-Event header', function() {
        beforeEach(function() {
            delete request.headers['X-Github-Event'];
            return doRequest();
        });
        it('responds with a 400', function() {
            expect(response.statusCode).to.equal(400);
        });
        it('does not send a request', function() {
            expect(externalRequests).to.be.empty;
        });
    });
    context('when the received request is for the wrong event type', function() {
        beforeEach(function() {
            request.headers['X-Github-Event'] = 'issue_comment';
            return doRequest();
        });
        it('responds with a 400', function() {
            expect(response.statusCode).to.equal(400);
        });
        it('does not send a request', function() {
            expect(externalRequests).to.be.empty;
        });
    });
    context('when the received request is for the wrong action type', function() {
        beforeEach(function() {
            body.action = 'closed';
            return doRequest();
        });
        it('responds with a 200', function() {
            expect(response.statusCode).to.equal(200);
        });
        it('does not send a request', function() {
            expect(externalRequests).to.be.empty;
        });
    });
    context('when the received request does not a valid signature', function() {
        beforeEach(function() {
            request.headers['X-Hub-Signature'] = 'sha1=3ace7701c65b02e3a19dfadf977e2559f5a04397';
            request.body = body;
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it('responds with a 400', function() {
            expect(response.statusCode).to.equal(400);
        });
        it('does not send a request', function() {
            expect(externalRequests).to.be.empty;
        });
    });

    context('when the setup job has not been queued yet', function () {
        beforeEach(function() {
            externalServerResponses = createExternalResponses();
            // add an external server response that does not have
            // the details of the queued build
            externalServerResponses.splice(1, 0, {
                statusCode: 200,
                headers: {},
                body : {}
            });
            return doRequest();
        });
        it('repeats the request to check for the queued job', function() {
            expect(externalRequests).to.have.length(5);
            // check that the URL is requested twice
            expect(externalRequests[1].url).to.equal(externalRequests[2].url);
        });
    });
    context('when the setup job status is null or incomplete', function () {
        beforeEach(function() {
            externalServerResponses = createExternalResponses();
            // add an external server response that states the build is incomplete
            externalServerResponses.splice(2, 0, {
                statusCode: 200,
                headers: {},
                body: {
                    result: null
                }
            });
            return doRequest();
        });
        it('repeats the request to check the job status', function() {
            expect(externalRequests).to.have.length(5);
            // check that the URL is requested twice
            expect(externalRequests[2].url).to.equal(externalRequests[3].url);
        });
    });
    context('when the setup job status is failed', function () {
        beforeEach(function() {
            externalServerResponses = createExternalResponses();
            externalServerResponses[2].body.result = 'FAILURE';
            return doRequest();
        });
        it('responds with 500', function() {
            expect(response.statusCode).to.equal(500);
        });
    });
});
