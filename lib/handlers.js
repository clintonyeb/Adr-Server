'use strict';

const Boom = require('boom');
const JWT = require('jsonwebtoken');
const Fs = require('fs')
const MongoJS = require('mongojs');
const Bcrypt = require('bcrypt');
const secret = require('./secret');
const nodemailer = require('nodemailer');
var generator = require('generate-password');
const httpStatus = require('./HttpStatus')

const saltRounds = 10;

// users

function generatePassword() {
  return generator.generate({
    length: 6,
    numbers: true,
    excludeSimilarCharacters: true
  });
}

function registerUser(request, reply, db) {

  const user = request.payload
  let password = generatePassword();
  user.password = password;

  Bcrypt.hash(user.password, saltRounds, function (err, hash) {
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

      let mailer = new Mailer();
      let mail = {
        from: '"ADR Admin 👻" <clinton@tinglingcode.com>',
        to: user.username,
        subject: 'ADR Account Registration ✔',
        text: `Hello ${user.fullName},\n\nWe have received your account registration.\nHere is your password, use this password to login to your account.\n\n\tPassword: ${password}\n\nKeep this password secret \nThanks for joining the team\n\nThanks,\nADR Admin.😀\n
          `,
      };

      mailer.sendMail(mail, (err, info) => {
        if (err) {
          return console.log(err);
        }
        console.log('Message %s sent: %s', info.messageId, info.response);

      })

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

function recoverPass(request, reply, db) {
  let data = request.payload;
  let newPass = generatePassword();

  db.users.update({
    username: data.username
  }, (err, doc) => {
    if (err) return reply(Boom.wrap(err, 'Internal server error'));


  })

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


// Authentication Handlers

function authFail(reply, data, callback) {
  return reply({
    message: "Authentication failed",
    data: data
  }).code(httpStatus.UNAUTHORIZED);
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

// mailer

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

module.exports = {
  registerUser: registerUser,
  findUsers: findUsers,
  loginUser: loginUser,
  logout: logout,
  addImage: addImage,
  createReport: createReport
}