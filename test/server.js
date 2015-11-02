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
    var externalServerResponseCodes = [];
    var externalRequests = [];
    externalServer.on('request', function(req, res) {
        externalRequests.push(req);
        res.statusCode = externalServerResponseCodes.shift() || 200;
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

    beforeEach(function() {
        externalRequests = [];
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
        it("responds with a 200", function() {
            expect(response.statusCode).to.equal(200);
        });
        it("sends two requests", function() {
            expect(externalRequests).to.have.length(2);
        });
        describe('the setup request', function() {
            it('includes the branch name for the pull-request in the URL', function() {
                var url = "/job/setup_Org-Repo/buildWithParameters?RECONFIGURE_BRANCH=branch";
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
                    externalServerResponseCodes = [ 500 ];
                    return doRequest()
                        .then(function() {
                            expect(response.statusCode).to.equal(500);
                        });
                });
            });
        });
        describe("the build request", function() {
            it('includes the branch name for the pull-request in the URL', function() {
                var url = "/job/Org-Repo/job/branch/job/triggerJobName/build";
                expect(externalRequests).to.have.deep.property('[1].url', url);
            });
            it('sends a POST request', function() {
                expect(externalRequests).to.have.deep.property('[1].method', 'POST');
            });
            it('includes the correct authentication header', function() {
                expect(externalRequests).to.have.deep
                    .property('[1].headers.authorization', 'Basic dXNlcjphcGlfdG9rZW4=');
            });
            context('when the request fails', function() {
                it('responds with a 500', function() {
                    externalServerResponseCodes = [ 200, 500 ];
                    return doRequest()
                        .then(function() {
                            expect(response.statusCode).to.equal(500);
                        });
                });
            });
        });
    });

    it('considers "opened" a valid action', function () {
        body.action = "opened";
        return doRequest()
            .then(function() {
                expect(response.statusCode).to.equal(200);
            });
    });
    it('considers "reopened" a valid action', function () {
        body.action = "reopened";
        return doRequest()
            .then(function() {
                expect(response.statusCode).to.equal(200);
            });
    });
    it('considers "synchronize" a valid action', function () {
        body.action = "synchronize";
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
            delete request.headers["X-Github-Event"];
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
            request.headers["X-Github-Event"] = 'issue_comment';
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
});