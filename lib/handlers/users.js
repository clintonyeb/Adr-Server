'use strict';

const Boom = require('boom');
const Bcrypt = require('bcrypt');
const authHandler = require('./auth');
const saltRounds = 10;
const MongoJS = require('mongojs');

function registerUser(request, reply, db) {
  const payload = request.payload
  let user = payload

  Bcrypt.hash(payload.password, saltRounds, function (err, hash) {
    user.password = hash

    db.users.save(user, (err, result) => {
      if (err) reply(Boom.wrap(err, 'Internal server error'))

      reply(user);

    });

  });

}

function findUsers(request, reply, db) {
  db.users.find((err, docs) => {
    if (err) reply(Boom.wrap(err, 'Internal server error'))
    reply(docs);
  });
}

function logout(request, reply, db) {

  db.auths.remove({
    _id: MongoJS.ObjectId(request.auth.credentials.id)
  }, (err, res) => {
    if (err) reply(Boom.wrap(err, 'Internal server error'))
    reply({
      message: 'Successfully logged out'
    })
  })
}

function loginUser(request, reply, db) {
  return authHandler(request, reply, db);
}

module.exports = {
  registerUser: registerUser,
  findUsers: findUsers,
  loginUser: loginUser,
  logout: logout
}