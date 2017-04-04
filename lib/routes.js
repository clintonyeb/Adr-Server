'use strict';

const Boom = require('boom');
const Joi = require('joi');
const MongoJS = require('mongojs');
const nodemailer = require('nodemailer');
const handlers = require('./handlers');
const secret = require('./secret');
const Path = require('path')
const quotes = require('./quotes');

exports.register = function (server, options, next) {

  // const db = MongoJS('adrdb', ['users', 'reports', 'auths']) // local for testing

  server.app.db = MongoJS('clinton:adradmin@ds147510.mlab.com:47510/adrdb', ['users', 'reports', 'auths'])

  server.app.mailer = new Mailer()
  
  server.app.uuid = 1000;  
  // setup views  

  server.views({

    engines: {
      'html': {
        module: require('handlebars'),
        compileMode: 'sync'
      }
    },

    relativeTo: __dirname,
    path: './views',
    layout: true,
    helpersPath: './views/helpers',
    layoutPath: './views/layouts'

  });

  let jwtValidate = function (decoded, request, callback) {

    server.app.db.auths.findOne({
      _id: MongoJS.ObjectId(decoded.id)
    }, (err, res) => {

      if (err) reply(Boom.wrap(err, 'Internal server error'))
      if (!res) {
        return callback(null, false);
      }

      return callback(null, res.valid);
    })

  };

  let cookieValidate = function (request, session, callback) {
    cache.get(session.sid, (err, cached) => {

      if (err) {
        return callback(err, false);
      }

      if (!cached) {
        return callback(null, false);
      }

      return callback(null, true, cached.account);
    });
  }

  const cache = server.cache({
    segment: 'sessions',
    expiresIn: 3 * 24 * 60 * 60 * 1000
  });
  server.app.cache = cache;

  server.auth.strategy('jwt', 'jwt', {
    key: secret,
    validateFunc: jwtValidate,
    verifyOptions: {
      algorithms: ['HS256']
    }
  });

  server.auth.strategy('session', 'cookie', true, {
    password: secret,
    cookie: 'cookie-auth',
    redirectTo: '/admin/login',
    isSecure: false,
    validateFunc: cookieValidate
  });


  // server.auth.default('jwt');

  const routes = [

    {
      method: 'GET',
      path: '/',
      handler: function (request, reply) {
        reply('App is running...')
      },
      config: {
        auth: false
      }
    },

    {
      method: 'POST',
      path: '/api/users',
      handler: handlers.registerUser,

      config: {
        // validate: {
        //   payload: Joi.object({
        //     username: Joi.string().email().required(),
        //     enabled: Joi.string().default('false'),
        //     fullName: Joi.string().required(),
        //     mobile: Joi.string().required(),
        //     organization: Joi.string().alphanum().min(3).required(),
        //     designation: Joi.string().alphanum(),
        //     date: Joi.string().default(new Date())
        //   })
        // },
        auth: false
      }
    },

    {
      method: 'GET',
      path: '/api/users',
      handler: handlers.findUsers,
      config: {
        auth: false
      }
    },

    {
      method: 'GET',
      path: '/admin/users/{username}',
      handler: handlers.findUser,
      config: {
        auth: false
      }
    },

    {
      method: 'POST',
      path: '/api/users/{username}/{enable}',
      handler: handlers.enable,
      config: {
        auth: "jwt"
      }
    },

    {
      method: 'POST',
      path: '/api/login',
      handler: handlers.loginUser,
      config: {
        auth: false
      }
    },
    {
      method: 'POST',
      path: '/api/logout',
      handler: handlers.logout,
      config: {
        auth: "jwt"
      }
    },

    {
      method: 'POST',
      path: '/api/users/recover',
      handler: handlers.recoverPass,
      config: {
        auth: false
      }
    },

    // report routes

    {
      method: 'POST',
      path: '/api/reports',
      handler: handlers.createReport,
      config: {
        // validate: {
        //   payload: {
        //     userId: Joi.string().email().required(),
        //     patientName: Joi.string().required(),
        //     patientId: Joi.string(),
        //     date: Joi.string().default(new Date())
        //   }
        // },
        auth: "jwt"
      }
    },

    {
      method: 'POST',
      path: '/api/images',
      handler: handlers.addImage,
      config: {
        payload: {
          output: 'stream',
          parse: true,
          allow: 'multipart/form-data'
        },
        auth: "jwt"
      }
    },

    {
      method: 'GET',
      path: '/admin/images/{name}',
      handler: handlers.getImage,
      config: {
        auth: "session"
      }
    },

    // admin 

    {
      method: 'GET',
      path: '/admin/reports/{page?}',
      handler: handlers.getReports,
      config: {
        auth: "session"
      }
    },
    {
      method: 'GET',
      path: '/admin/users',
      handler: handlers.getUsers,
      config: {
        auth: "session"
      }
    },

    {
      method: 'GET',
      path: '/admin/server-status',
      handler: handlers.serverStatus,
      config: {
        auth: "session"
      }
    },

    {
      method: 'GET',
      path: '/admin',
      handler: handlers.getReports,
      config: {
        auth: "session"
      }
    },

    {
      method: 'POST',
      path: '/admin/login',
      handler: handlers.adminLogin,
      config: {
        auth: false
      }
    },

    {
      method: 'GET',
      path: '/admin/login',
      handler: function (request, reply) {
        reply.view('login', {
          file: 'login'
        })
      },
      config: {
        auth: false
      }
    },

    {
      method: 'GET',
      path: '/admin/logout',
      handler: handlers.adminLogout,
      config: {
        auth: "session"
      }
    },

    // assets

    {
      method: 'GET',
      path: '/assets/{path}/{name}',
      handler: function (request, reply) {
        let file = Path.join(__dirname + '/views/static/' + request.params.path + '/' + request.params.name);
        reply.file(file);
      },
      config: {
        auth: false
      }
    },

    {
      method: '*',
      path: '/{path*}',
      handler: function (request, reply) {
        let x = Math.floor((Math.random() * quotes.length));
        reply(`
        <blockquote>
        <p>${quotes[x].text}</p>
        <small>--${quotes[x].author}</small>
        </blockquote>`);
      },
      config: {
        auth: false
      }
    }

  ]

  server.route(routes);

  function Mailer() {

    this.transporter = nodemailer.createTransport({
      host: 'smtp.tinglingcode.com',
      port: 587,
      secure: false,
      auth: {
        user: 'clinton@tinglingcode.com',
        pass: 'holyspirit33'
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    this.sendMail = function (options, callback) {
      this.transporter.sendMail(options, callback);
    }
  }

  return next();

};

exports.register.attributes = {
  name: 'routes'
};