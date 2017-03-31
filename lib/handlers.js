'use strict';

const Boom = require('boom');
const JWT = require('jsonwebtoken');
const Fs = require('fs')
const MongoJS = require('mongojs');
const Bcrypt = require('bcrypt');
const secret = require('./secret');

const saltRounds = 10;

// users

function registerUser(request, reply, db) {
  const payload = request.payload
  let user = payload

  Bcrypt.hash(payload.password, saltRounds, function (err, hash) {
    user.password = hash

    db.users.save(user, (err, result) => {
      if (err) {
        if (err.code === 11000) {
          return reply(Boom.wrap(err, 409, "Duplicate username"));
        } else {
          reply(Boom.wrap(err, 'Internal server error'))
        }

      }

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

// reports

function addImage(request, reply, db) {
  let payload = request.payload;

  if (payload.file) {

    let name = payload.file.hapi.filename;
    let path = __dirname + '/uploads/' + name;
    let file = Fs.createWriteStream(path)

    file.on('error', (err) => {
      console.log(err);
      return reply(Boom.wrap(err, 'Internal server error'))
    })

    payload.file.pipe(file);

    payload.file.on('end', (err) => {
      if (err) return reply(Boom.wrap(err, 'Internal server error'))


      db.reports.update({
        _id: MongoJS.ObjectId(payload.reportId)
      }, {
        $push: {
          files: name
        }
      }, (err, doc) => {
        if (err) return reply(Boom.wrap(err, 'Internal server error'))

        reply({
          file: name
        });
      })



    })
  }
}

function createReport(request, reply, db) {
  let data = request.payload;

  db.reports.insert(data, (err, doc) => {
    if (err) return reply(Boom.wrap(err, 'Internal server error'));

    reply({
      reportId: doc._id,
      created: true,
      date: doc.date
    })
  })
}

function authFail(reply, data, callback) {
  return reply({
    message: "Authentication failed",
    data: data
  })
}


function authSuccess(request, reply, db, user) {

  function generateAndStoreToken(request, opts, db, user) {

    function generateToken(request, user, opts) {

      opts = opts || {};

      let expiresDefault = Math.floor(new Date().getTime() / 1000) + 12 * 4 * 7 * 24 * 60 * 60; // 1 year

      let token = JWT.sign({
        id: user._id,
        username: user.username,
        agent: request.headers['user-agent'],
        exp: opts.expires || expiresDefault
      }, secret);

      return token;
    }

    let token = generateToken(request, user, opts);

    let record = {
      _id: user._id,
      valid: true,
      created: new Date().getTime()
    };

    db.auths.save(record, function (err, doc) {
      // console.log("jwt saved data ", doc);
    });

    return token;
  }

  reply({
      message: "Athentication success",
      token: generateAndStoreToken(request, null, db, user)
    })
    .type('application.json')

}



function authHandler(request, reply, db) {

  function checkUp(username, callback) {
    db.users.findOne({
      username: username
    }, (err, doc) => {
      if (err) {
        return reply(Boom.wrap(err, 'Internal server error'));
      }

      callback(null, (doc && (doc.enabled == 'true')) ? doc : null);
    })
  }

  function validate(password, user, callback) {
    Bcrypt.compare(password, user.password, callback)
  }

  function login() {

    let data = request.payload;

    checkUp(data.username, (err, doc) => {
      if (doc) {
        console.log(doc);
      }
      if (!err && doc) {

        let res = validate(data.password, doc, (err, isValid) => {
          if (err) {
            reply(Boom.wrap(err, 'Internal server error'));
          }

          if (isValid) {
            return authSuccess(request, reply, db, doc);
          } else {
            return authFail(reply, data, null);
          }

        });

      } else {
        return authFail(reply, data, null);
      }
    })

  }

  return login();

}

module.exports = {
  registerUser: registerUser,
  findUsers: findUsers,
  loginUser: loginUser,
  logout: logout,
  addImage: addImage,
  createReport: createReport
}