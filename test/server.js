var http = require('http');
var rp = require('request-promise');
var expect = require('chai').expect;
var createrServer = require('../src/server');

describe('server', function() {
    var port = 8081;
    var server;
    var serverURL = 'http://localhost:' + port + '/';

    var externalServer = http.Server();
    var externalServerPort = 8082;
    var externalServerURL = 'http://localhost:' + externalServerPort;
    var externalRequest;
    externalServer.on('request', function(req, res) {
        externalRequest = req;
        res.statusCode = 200;
        res.end();
    });

    var request;

    before(function() {
        return new Promise(function(resolve, reject) {
            externalServer.listen(externalServerPort, resolve);
        })
    });

    after(function() {
       externalServer.close();
    });

    beforeEach(function() {
        externalRequest = null;
        request = {
            method: 'POST',
            headers: {
                'X-Github-Event' : 'pull_request'
            },
            body: {
                action: 'opened'
            },
            json: true,
            uri: serverURL,
            simple: false,
            resolveWithFullResponse: true
        };
        return createrServer(port, externalServerURL)
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
        var response;
        beforeEach(function() {
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it("responds with a 200", function() {
            expect(response.statusCode).to.equal(200);
        });
        it("sends a request", function() {
            expect(externalRequest).to.not.be.null;
        });
        describe("the request", function() {
            xit('includes the branch name for the pull-request in the URL', function() {

            });
            it('sends a POST request', function() {
                expect(externalRequest.method).to.equal('POST');
            });
            xit('includes the correct authentication header', function() {

            });
        });
    });

    it('considers "opened" a valid action', function () {
        request.body.action = "opened";
        return rp(request)
            .then(function(response) {
                expect(response.statusCode).to.equal(200);
            });
    });
    it('considers "reopened" a valid action', function () {
        request.body.action = "reopened";
        return rp(request)
            .then(function(response) {
                expect(response.statusCode).to.equal(200);
            });
    });
    it('considers "synchronize" a valid action', function () {
        request.body.action = "synchronize";
        return rp(request)
            .then(function(response) {
                expect(response.statusCode).to.equal(200);
            });
    });
    context('when the received request is for the wrong URL', function() {
        var response;
        beforeEach(function() {
            request.uri = serverURL + 'something-completely-different';
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it('responds with a 404', function() {
            expect(response.statusCode).to.equal(404);
        });
        it('does not send a request', function() {
            expect(externalRequest).to.be.null;
        });
    });
    context('when the received request is not a POST request', function() {
        var response;
        beforeEach(function() {
            request.method = 'GET';
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it('responds with a 404', function() {
            expect(response.statusCode).to.equal(404);
        });
        it('does not send a request', function() {
            expect(externalRequest).to.be.null;
        });
    });
    context('when the received request does not contain a X-Github-Event header', function() {
        var response;
        beforeEach(function() {
            delete request.headers["X-Github-Event"];
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it('responds with a 400', function() {
            expect(response.statusCode).to.equal(400);
        });
        it('does not send a request', function() {
            expect(externalRequest).to.be.null;
        });
    });
    context('when the received request is for the wrong event type', function() {
        var response;
        beforeEach(function() {
            request.headers["X-Github-Event"] = 'issue_comment';
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it('responds with a 400', function() {
            expect(response.statusCode).to.equal(400);
        });
        it('does not send a request', function() {
            expect(externalRequest).to.be.null;
        });
    });
    context('when the received request is for the wrong action type', function() {
        var response;
        beforeEach(function() {
            request.body.action = 'closed';
            return rp(request)
                .then(function(r) {
                    response = r;
                });
        });
        it('responds with a 200', function() {
            expect(response.statusCode).to.equal(200);
        });
        it('does not send a request', function() {
            expect(externalRequest).to.be.null;
        });
    });
    xcontext('when the received request does not have the correct secret', function() {
        it('responds with a 400', function() {
            expect(response.statusCode).to.equal(400);
        });
        it('does not send a request', function() {
            expect(externalRequest).to.be.null;
        });
    });
});