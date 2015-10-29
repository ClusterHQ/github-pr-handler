## Github PR Handler

A small service that is used as the endpoint for a Github webhook. It processes `pull_request` events for Flocker and triggers the relevant jobs on Jenkins.

### How to run

Requires Docker to run.

Clone this repository and build the Dockerfile:

```
$ git clone git@github.com:ClusterHQ/github-pr-handler
$ cd github-pr-handler
$ docker build -t github_pr_handler .
```

The service requires the following environment variables to be set:
* `GITHUB_SECRET` - The secret used with the webhook.
* `JENKINS_USERNAME` - The Jenkins username to authenticate with.
* `JENKINS_API_TOKEN` - The Jenkins API token to authenticate with.

Run the Docker image as follows (including setting the relevant environment variables):

```
$ docker run -p <port>:<port> -e GITHUB_SECRET=<secret> -e JENKINS_USERNAME=<username> \
-e JENKINS_API_TOKEN=<token> github-pr-handler -p <port> -u <jenkins_url>
```

### Fabric
This repository contains fabric code to run this service on an AWS instance.

#### Usage

Clone the following repositories:

```
$ git clone git@github.com:ClusterHQ/github-pr-handler
$ cd github-pr-handler
$ git clone git@github.com:ClusterHQ/segredos.git segredos
```

Export the following environment variables for EC2:

* `AWS_KEY_PAIR` (the KEY_PAIR to use)
* `AWS_KEY_FILENAME` (the full path to your .pem file)
* `AWS_SECRET_ACCESS_KEY`
* `AWS_ACCESS_KEY_ID`

Create a virtualenv:

```
$ virtualenv2 venv
$ . venv/bin/activate
$ pip2 install -r requirements.txt --upgrade
```

Start the service:

```
$ fab it
```
