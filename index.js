var server = require('./src/server');

var port = process.argv[2];
var jenkinsServer = process.argv[3];

var githubSecret = process.env.GITHUB_SECRET;
if (githubSecret === undefined) {
    console.error('Environment variable GITHUB_SECRET must be defined');
    process.exit(1);
}

var jenkinsUsername = process.env.JENKINS_USERNAME;
if (jenkinsUsername === undefined) {
    console.error('Environment variable JENKINS_USERNAME must be defined');
    process.exit(1);
}

var jenkinsApiToken = process.env.JENKINS_API_TOKEN;
if (jenkinsApiToken === undefined) {
    console.error('Environment variable JENKINS_API_TOKEN must be defined');
    process.exit(1);
}

server(port, jenkinsServer, githubSecret, jenkinsUsername, jenkinsApiToken)
    .then(function (s) {
        console.log('Github PR handler listening at %s:%s', s.address().address, s.address().port);
    });
