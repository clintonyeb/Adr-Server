'use strict';

module.exports =  [{
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
]