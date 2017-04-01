'use strict';

const Hapi = require('hapi');
const MongoJS = require('mongojs');

const server = new Hapi.Server();
server.connection({
  host: 'localhost',
  port: 8000
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