'use strict';

const Hapi = require('hapi');
const MongoJS = require('mongojs');
const Path = require('path')

const server = new Hapi.Server();
server.connection({
  host: '0.0.0.0',
  port: +process.env.PORT || 8001,
});

const plugins = [{
    register: require('good'),
    options: {
      reporters: {
        console: [{
          module: 'good-squeeze',
          name: 'Squeeze',
          args: [{
            response: '*',
            log: '*'
          }]
        }, {
          module: 'good-console'
        }, 'stdout']
      }
    }
  },
  {
    register: require('inert')
  },
  {
    register: require('vision')
  },
  {
    register: require('hapi-auth-jwt2')
  },
  {
    register: require('./routes')
  }

];

server.register(plugins, (err) => {

  if (err) throw err;

  server.start((err) => {

    if (err) throw err;

    server.log('info', 'Server running at: ' + server.info.uri);

  });

});

module.exports = server;