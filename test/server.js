var rp = require('request-promise');
var server = require('../src/server');
var expect = require('chai').expect;

describe('server', function() {
    it('responds with 404', function() {
        var port = 8081;
        server(port);
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
});