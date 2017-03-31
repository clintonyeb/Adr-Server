'use strict';

const Hapi = require('hapi');
const MongoJS = require('mongojs');

const server = new Hapi.Server();
server.connection({
  host: 'localhost',
  port: 8000
});

server.register(require('./plugins'), (err) => {

  if (err) throw err;

  server.start((err) => {

    if (err) throw err;

    server.log('info', 'Server running at: ' + server.info.uri);

  });

});

module.exports = server;