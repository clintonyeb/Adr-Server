'use strict';

const Boom = require('boom');
const JWT = require('jsonwebtoken');
const Fs = require('fs')
const MongoJS = require('mongojs');
const Bcrypt = require('bcrypt');
const secret = require('./secret');
var generator = require('generate-password');
const httpStatus = require('./HttpStatus')

const saltRounds = 10;

// users

function generatePassword() {
  return generator.generate({
    length: 8,
    numbers: true,
    excludeSimilarCharacters: true
  });
}

function findDuplicate(db, username, callback) {

  db.users.find({
    username: username
  }, (err, docs) => {
    if (err) return callback(err);
    if (docs.length > 0) return callback(new Error('duplicate username found'))
    return callback(null)
  })
}

function registerUser(request, reply, db, mailer) {

  const user = request.payload

  findDuplicate(db, user.username, (err) => {
    if (err) return reply(Boom.wrap(err, 409, "Duplicate usernames found"))
    let password = generatePassword();
    user.password = password;

    Bcrypt.hash(user.password, saltRounds, function (err, hash) {
      user.password = hash
      user.date = new Date();

      db.users.save(user, (err, result) => {
        
        if (err) return reply(Boom.wrap(err, 'Internal server error'))

        reply(result);

        let mail = {
          from: '"ADR Admin 👻" <clinton@tinglingcode.com>',
          to: user.username,
          subject: 'ADR Account Registration ✔',
          text: `Hello ${user.fullName},\n\nWe have received your account registration.\nHere is your password, use this password to login to your account.\n\n\tPassword: ${password}\n\nKeep this password secret \nThanks for joining the team\n\nThanks,\nADR Admin.😀\n
          `,
        };

        mailer.sendMail(mail, (err, info) => {
          if (err) {
            return;
          }
          console.log('Message %s sent: %s', info.messageId, info.response);

        })

      });

    });
  })

}

function findUsers(request, reply, db) {
  db.users.find((err, docs) => {
    if (err) reply(Boom.wrap(err, 'Internal server error'))
    reply(docs);
  });
}

function findUser(request, reply, db) {
  db.users.findOne((err, doc) => {
    if (err) reply(Boom.wrap(err, 'Internal server error'))
 
    reply.view('users', {
      users: [doc],
      page: 'users'
    });
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

function recoverPass(request, reply, db, mailer) {
  let data = request.payload;
  let newPass = generatePassword();

  Bcrypt.hash(newPass, saltRounds, function (err, hash) {
    db.users.update({
      username: data.username
    }, {
      $set: {
        password: hash
      }
    }, (err, doc) => {
      if (err) return reply(Boom.wrap(err, 'Internal server error'));

      reply({
        message: "Update success"
      });

      let mail = {
        from: '"ADR Admin 👻" <clinton@tinglingcode.com>',
        to: data.username,
        subject: 'Password Recovery ✔',
        text: `Hello ${doc.fullName},\n\nHere is your new password\nUse this password to login to your account.\n\n\tPassword: ${newPass}\n\nKeep this password secret\n\nThanks,\nADR Admin.😀\n
          `,
      };

      mailer.sendMail(mail, (err, info) => {
        if (err) {
          return;
        }
        console.log('Message %s sent: %s', info.messageId, info.response);

      })

    })
  });

}


function enable(request, reply, db) {
  let data = request.params

  db.users.update({
    username: data.username
  }, {
    $set: {
      enabled: data.enable == 'true' ? 'false' : 'true'
    }
  }, (err, res) => {
    if (err) return reply(Boom.wrap(err, 'Internal server error'))
    reply().redirect('/admin/users');
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
  data.date = new Date();

  db.reports.insert(data, (err, doc) => {
    if (err) return reply(Boom.wrap(err, 'Internal server error'));

    reply({
      reportId: doc._id,
      created: true,
      date: doc.date
    })
  })
}

function getReports(request, reply, db) {
  let data = request.params
  let page = data.page || 0
  
  db.reports.find({})
    .limit(10)
    .skip(page * 10)
    .sort({
      date: -1
    })
    .toArray((err, docs) => {

      if (err) return reply(Boom.wrap(err, 'Internal server error'));
      
      reply.view('reports', {
        reports: docs,
        file: 'reports',
        page: page,
        limit: docs.length
      }).state('token', request.auth.token);

    })
}

function getUsers(request, reply, db) {
  let data = request.params

  db.users.find({})
    .limit(10)
    .skip(data.offset ? data.offset : 0)
    .sort({
      date: -1
    })
    .toArray((err, docs) => {

      if (err) return reply(Boom.wrap(err, 'Internal server error'));

      reply.view('users', {
        users: docs,
        file: 'users'
      });

    })
}

// Authentication Handlers

function authFail(reply, data, callback, type) {
 
  if (type === 'admin') {
    return reply.view('index')
  } else {
    return reply({
      message: "Authentication failed",
      data: data
    }).code(httpStatus.UNAUTHORIZED);
  }

}


function authSuccess(request, reply, db, user, type) {

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


  let token = generateAndStoreToken(request, null, db, user);

  if (type === 'admin') {
    return reply().redirect('/admin/reports?token=' + token)
  } else {
    return reply({
        message: "Athentication success",
        token: token,
        username: user.username
      })
      .type('application.json')
  }


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
    let type = null;

    if (request.path.indexOf('admin') != -1) {
      type = 'admin'
    } else {
      type = 'user'
    }

    checkUp(data.username, (err, doc) => {
    
      if (!err && doc) {

        let res = validate(data.password, doc, (err, isValid) => {
          if (err) {
            reply(Boom.wrap(err, 'Internal server error'));
          }

          if (isValid) {

            return authSuccess(request, reply, db, doc, type);
          } else {
            return authFail(reply, data, null, type);
          }

        });

      } else {
        return authFail(reply, data, null, type);
      }
    })

  }

  return login();

}

module.exports = {
  registerUser: registerUser,
  findUsers: findUsers,
  findUser: findUser,
  loginUser: loginUser,
  logout: logout,
  addImage: addImage,
  createReport: createReport,
  getReports: getReports,
  getUsers: getUsers,
  enable: enable,
  recoverPass: recoverPass
}