var server = require('./src/server');
var commandLineArgs = require('command-line-args');

var cli = commandLineArgs([
    { name: 'port', alias: 'p', type: Number, description: 'Port to run the server on' },
    { name: 'url', alias: 'u', type: String, description: 'The URL of the Jenkins server to trigger jobs on' },
    { name: 'job', alias: 'j', type: String, defaultValue: '__main_multijob',  description: 'The name of the Jenkins job to trigger' }
]);

var options = cli.parse();

if (Object.keys(options).length < 3) {
    console.log('Incorrect number of arguments specified');
    console.log(cli.getUsage());
    process.exit(1);
}

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

// Start the Github PR handler with the provided options.
server(options.port, options.url, githubSecret, options.job, jenkinsUsername, jenkinsApiToken)
    .then(function (s) {
        console.log('Github PR handler listening at %s:%s', s.address().address, s.address().port);
    });
