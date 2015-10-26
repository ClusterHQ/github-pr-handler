FROM ubuntu:latest

RUN apt-get update
RUN apt-get install -y curl
RUN curl --silent --location https://deb.nodesource.com/setup_4.x | sudo bash -
RUN apt-get install -y nodejs

RUN mkdir /github-pr-handler
ADD . /github-pr-handler

WORKDIR /github-pr-handler

EXPOSE 8080
RUN npm install
RUN npm test
ENTRYPOINT ["node", "index.js"]
