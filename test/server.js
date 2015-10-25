var rp = require('request-promise');
var createrServer = require('../src/server');
var expect = require('chai').expect;

describe('server', function() {
    var port = 8081;
    var server;

    beforeEach(function() {
        return createrServer(port)
            .then(function(s) {
                server = s;
            });
    });

    afterEach(function(end) {
        server.close(function() {
            end();
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
});