var http = require('http');
var rp = require('request-promise');
var expect = require('chai').expect;
var createrServer = require('../src/server');

describe('server', function() {
    var port = 8081;
    var server;

    var externalServer = http.Server();
    var externalServerPort = 8082;
    var externalServerURL = 'http://localhost:' + externalServerPort;
    var externalRequestMade = false;
    externalServer.on('request', function(req, res) {
        externalRequestMade = true;
        res.statusCode = 200;
        res.end();
    });

    before(function() {
        return new Promise(function(resolve, reject) {
            externalServer.listen(externalServerPort, resolve);
        })
    });

    after(function() {
       externalServer.close();
    });

    beforeEach(function() {
        externalRequestMade = false;
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

    it('responds with 404', function() {
        var options = {
            uri: 'http://localhost:' + port,
            simple: false,
            resolveWithFullResponse: true
        };
        return rp(options)
            .then(function(response) {
                expect(response.statusCode).to.equal(404);
            });
    });

    it('responds with 200 for POST requests', function() {
        var options = {
            method: 'POST',
            uri: 'http://localhost:' + port,
            resolveWithFullResponse: true
        };
        return rp(options)
            .then(function(response) {
               expect(response.statusCode).to.equal(200);
            });
    });

    it('makes a request to external server after receiving a POST request', function() {
        var options = {
            method: 'POST',
            uri: 'http://localhost:' + port
        };

        return rp(options)
            .then(function(response) {
                expect(externalRequestMade).to.equal(true);
            });
    });
});