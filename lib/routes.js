'use strict';

const Boom = require('boom');
const Joi = require('joi');
const MongoJS = require('mongojs');
const handlers = require('./handlers');
const secret = require('./secret');

exports.register = function (server, options, next) {

  const db = MongoJS('adrdb', ['users', 'reports', 'auths'])

  const setIndexes = function (db) {

    db.users.ensureIndex({
      "username": ""
    }, {
      unique: true
    }, function (err, res) {
      if (err) throw err;
    })

  }

  setIndexes(db);

  let validate = function (decoded, request, callback) {

    db.auths.findOne({
      _id: MongoJS.ObjectId(decoded.id)
    }, (err, res) => {

      if (err) reply(Boom.wrap(err, 'Internal server error'))
      if (!res) {
        return callback(null, false);
      }

      return callback(null, res.valid);
    })

  };

  server.auth.strategy('jwt', 'jwt', {
    key: secret,
    validateFunc: validate,
    verifyOptions: {
      algorithms: ['HS256']
    }
  });

  server.auth.default('jwt');

  const routes = [

    {
      method: 'POST',
      path: '/api/users',
      handler: function (request, reply) {
        handlers.registerUser(request, reply, db);
      },

      config: {
        validate: {
          payload: Joi.object({
            username: Joi.string().email().required(),
            password: Joi.string().regex(/^[a-zA-Z0-9]{3,30}$/),
            enabled: Joi.string().default('false'),
            organization: Joi.string().alphanum().min(3).required(),
            designation: Joi.string().alphanum(),
            date: Joi.string().default(new Date())
          })
        },
        auth: false
      }
    },

    {
      method: 'GET',
      path: '/api/users',
      handler: function (request, reply) {
        handlers.findUsers(request, reply, db);
      },
      config: {
        auth: "jwt"
      }
    },

    {
      method: 'POST',
      path: '/api/login',
      handler: function (request, reply) {
        handlers.loginUser(request, reply, db);
      },
      config: {
        auth: false
      }
    },
    {
      method: 'POST',
      path: '/api/logout',
      handler: function (request, reply) {
        handlers.logout(request, reply, db);
      },
      config: {
        auth: "jwt"
      }
    },

    // report routes

    {
      method: 'POST',
      path: '/api/reports',
      handler: function name(request, reply) {
        handlers.createReport(request, reply, db);
      },
      config: {
        validate: {
          payload: Joi.object({
            userId: Joi.string().email().required(),
            patientName: Joi.string().required(),
            patientId: Joi.string(),
            date: Joi.string().default(new Date())
          })
        },
        auth: "jwt"
      }
    },

    {
      method: 'POST',
      path: '/api/images',
      handler: function (request, reply) {
        handlers.addImage(request, reply, db);
      },
      config: {
        payload: {
          output: 'stream',
          parse: true,
          allow: 'multipart/form-data'
        },
        auth: "jwt"
      }
    }
  ]

  server.route(routes);
  return next();
};

exports.register.attributes = {
  name: 'routes'
};