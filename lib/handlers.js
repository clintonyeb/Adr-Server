"use strict";

const Boom = require("boom");
const JWT = require("jsonwebtoken");
const Fs = require("fs");
const MongoJS = require("mongojs");
const Bcrypt = require("bcrypt");
const generator = require("generate-password");
const secret = require("./secret");
const httpStatus = require("./http-status");
const Path = require("path");
const Dropbox = require("dropbox");

const saltRounds = 10;
const dbx = new Dropbox({
  accessToken: "iDcopksrBPAAAAAAAAAA2aVrf0RWzUxUtg26-kVSufy77zPxTtIdWuS896FriHs1"
});

// users

function generatePassword() {
  return generator.generate({
    length: 8,
    numbers: true,
    excludeSimilarCharacters: true
  });
}

function findDuplicate(db, username, callback) {
  db.users.find(
    {
      username: username
    },
    (err, docs) => {
      if (err) return callback(err);
      if (docs.length > 0)
        return callback(new Error("duplicate username found"));
      return callback(null);
    }
  );
}

function registerUser(request, reply) {
  const user = request.payload;
  const mailer = request.server.app.mailer;
  const db = request.server.app.db;

  findDuplicate(db, user.username, err => {
    if (err) return reply(Boom.wrap(err, 409, "Duplicate usernames found"));

    user.date = new Date();
    user.role = "USER";

    db.users.save(user, (err, result) => {
      if (err) return reply(Boom.wrap(err, "Internal server error"));

      let mail = {
        from: '"ADR Admin 👻" <clinton@tinglingcode.com>',
        to: user.username,
        subject: "ADR Account Registration ✔",
        text: `Hello ${user.fullName},\n\nWe have received your account registration.\nWe will send you a password once your account is verified.\n\nCongrats for deciding to join the team\n\nThanks,\nADR Admin.😀\n
          `
      };

      mailer.sendMail(mail, (err, info) => {
        if (err) {
          return;
        }
        console.log("Message %s sent: %s", info.messageId, info.response);
      });
      return reply(result);
    });
  });
}

function findUsers(request, reply) {
  request.server.app.db.users.find(
    {
      role: "USER"
    },
    (err, docs) => {
      if (err) reply(Boom.wrap(err, "Internal server error"));

      reply(docs);
    }
  );
}

function logout(request, reply) {
  request.server.app.db.auths.remove(
    {
      _id: MongoJS.ObjectId(request.auth.credentials.id)
    },
    (err, res) => {
      if (err) reply(Boom.wrap(err, "Internal server error"));
      reply({
        message: "Successfully logged out"
      });
    }
  );
}

function loginUser(request, reply) {
  return authHandler(request, reply);
}

function recoverPass(request, reply) {
  const mailer = request.server.app.mailer;
  const db = request.server.app.db;
  let data = request.payload;
  let newPass = generatePassword();

  Bcrypt.hash(newPass, saltRounds, function(err, hash) {
    db.users.update(
      {
        username: data.username
      },
      {
        $set: {
          password: hash
        }
      },
      (err, doc) => {
        if (err) return reply(Boom.wrap(err, "Internal server error"));

        reply({
          message: "Update success"
        });

        let mail = {
          from: '"ADR Admin 👻" <clinton@tinglingcode.com>',
          to: data.username,
          subject: "Password Recovery ✔",
          text: `Hello,\n\nHere is your new password\nUse this password to login to your account.\n\n\tPassword: ${newPass}\n\nKeep this password secret\n\nThanks,\nADR Admin.😀\n
          `
        };

        mailer.sendMail(mail, (err, info) => {
          if (err) {
            return;
          }
          console.log("Message %s sent: %s", info.messageId, info.response);
        });
      }
    );
  });
}

function enable(request, reply) {
  let data = request.payload;
  const db = request.server.app.db;
  let password = generatePassword();
  console.log("enable", data);

  Bcrypt.hash(password, saltRounds, function(err, hash) {
    db.users.update(
      {
        username: data.username
      },
      {
        $set: {
          enabled: data.enabled == "true" ? "false" : "true",
          password: hash
        }
      },
      (err, doc) => {
        if (err) return reply().code(500).message("Internal server error");
        reply({
          username: data.username,
          enabled: data.enabled == "true" ? "false" : "true"
        }).code(200);

        db.users.findOne(
          {
            username: data.username
          },
          (err, doc) => {
            // if (err) return reply(Boom.wrap(err, 'Internal server error'))
            if (doc && doc.enabled == "true") {
              let mail = {
                from: '"ADR Admin 👻" <clinton@tinglingcode.com>',
                to: doc.username,
                subject: "Account Registration ✔",
                text: `Hello ${doc.fullName},\n\nHere is your password\nUse this password to log in to your account.\n\n\tPassword: ${password}\n\nYour account was succesfully verified\n\nThanks,\nADR Admin.😀\n`
              };

              request.server.app.mailer.sendMail(mail, (err, info) => {
                if (err) {
                  return;
                }
                console.log(
                  "Message %s sent: %s",
                  info.messageId,
                  info.response
                );
              });
            }
          }
        );
      }
    );
  });
}

// reports

function addImage(request, reply) {
  const db = request.server.app.db;
  let payload = request.payload;

  if (payload.file) {
    let name = payload.file.hapi.filename;
    let path = __dirname + "/uploads/" + name;
    let file = Fs.createWriteStream(path);

    file.on("error", err => {
      console.log("error-on", err);
      return reply(Boom.wrap(err, "Internal server error"));
    });

    payload.file.pipe(file);

    payload.file.on("end", err => {
      if (err) {
        console.log("error-end", err);
        return reply(Boom.wrap(err, "Internal server error"));
      }

      Fs.readFile(path, (err, data) => {
        if (err) return reply(Boom.wrap(err, "Internal server error"));

        dbx
          .filesUpload({ path: "/" + name, contents: data })
          .then(function(response) {
            console.log("file uploaded");
            db.reports.update(
              {
                _id: MongoJS.ObjectId(payload.reportId)
              },
              {
                $push: {
                  files: name
                }
              },
              (err, doc) => {
                if (err) return reply(Boom.wrap(err, "Internal server error"));

                reply({
                  file: name
                });
              }
            );
            // console.log(response);
          })
          .catch(function(error) {
            if (err) return reply(Boom.wrap(error, "Internal server error"));
          });
      });
    });
  }
}

function createReport(request, reply) {
  const db = request.server.app.db;
  let data = request.payload;
  data.date = new Date();

  db.reports.insert(data, (err, doc) => {
    if (err) return reply(Boom.wrap(err, "Internal server error"));
    // console.log("report", doc);
    reply({
      reportId: doc._id,
      created: true,
      date: doc.date
    });
  });
}

function getReports(request, reply) {
  const db = request.server.app.db;
  let data = request.params;
  let page = data.page || 0;

  db.reports
    .find(
      {},
      {
        patientName: 1,
        patientId: 1,
        userId: 1,
        userFullName: 1,
        date: 1
      }
    )
    .limit(20)
    .skip(page * 20)
    .sort({
      date: -1
    })
    .toArray((err, docs) => {
      if (err) return reply(Boom.wrap(err, "Internal server error"));

      reply.view("reports", {
        reports: docs,
        file: "reports",
        page: page,
        limit: docs.length
      });
    });
}

function getReportDetails(request, reply) {
  const db = request.server.app.db;
  let data = request.params;

  db.reports.findOne(
    {
      _id: MongoJS.ObjectId(data.id)
    },
    (err, doc) => {
      if (err) return reply(Boom.wrap(err, "Internal server error"));
      reply.view("report", {
        report: doc,
        file: "reports"
      });
    }
  );
}

function getUserDetails(request, reply) {
  const db = request.server.app.db;
  let data = request.params;
  let id = data.id;
  let isEmail = id.indexOf("@") != -1;

  if (isEmail) {
    db.users.findOne(
      {
        username: data.id
      },
      (err, doc) => {
        if (err) return reply(Boom.wrap(err, "Internal server error"));
        reply.view("user", {
          user: doc,
          file: "users"
        });
      }
    );
  } else {
    db.users.findOne(
      {
        _id: MongoJS.ObjectId(data.id)
      },
      (err, doc) => {
        if (err) return reply(Boom.wrap(err, "Internal server error"));
        reply.view("user", {
          user: doc,
          file: "users"
        });
      }
    );
  }
}

function getUsers(request, reply) {
  let data = request.params;
  const db = request.server.app.db;
  let page = data.page || 0;

  db.users
    .find(
      {
        role: "USER"
      },
      {
        username: 1,
        enabled: 1,
        fullName: 1,
        date: 1,
        userFullName: 1,
        date: 1
      }
    )
    .limit(20)
    .skip(page * 20)
    .sort({
      date: -1
    })
    .toArray((err, docs) => {
      if (err) return reply(Boom.wrap(err, "Internal server error"));

      reply.view("users", {
        users: docs,
        file: "users",
        page: page,
        limit: docs.length
      });
    });
}

function getImage(request, reply) {
  return dbx
    .filesDownload({ path: "/" + request.params.name })
    .then(function(data) {
      reply(data.fileBinary)
        .encoding("binary")
        .bytes(data.fileBinary.length)
        .type("image/jpeg");
    })
    .catch(function(err) {
      console.log(err);
      return reply(Boom.wrap(err, "Internal server error"));
    });
}

function serverStatus(request, reply) {
  reply.view("server-status", {
    file: "server-status",
    server: request.server.info
  });
}

function adminLogout(request, reply) {
  request.cookieAuth.clear();
  return reply.redirect("/admin/login");
}

function adminLogin(request, reply) {
  let data = request.payload;
  let message = "";

  if (request.auth.isAuthenticated) {
    reply.redirect("/admin/reports");
  }

  let username = data.username;
  let password = data.password;

  if (!username || !password) {
    message = "Missing username or password";
    return adminLoginFailed(reply, message, data);
  } else {
    request.server.app.db.users.findOne(
      {
        username: username
      },
      (err, doc) => {
        if (err) {
          return reply(Boom.wrap(err, "Internal server error"));
        }

        if (!doc) {
          message = "Invalid username and password";
          return adminLoginFailed(reply, message, data);
        } else {
          if (doc && doc.role != "ADMIN") {
            message = "'Invalid username and password'";
            return adminLoginFailed(reply, message, data);
          }

          validate(password, doc, (err, isValid) => {
            if (err) {
              console.log(err);
              return reply(Boom.wrap(err, "Internal server error"));
            }
            if (!isValid) {
              message = "Invalid username or password";
              return adminLoginFailed(reply, message, data);
            } else {
              return adminLoginSuccess(request, reply, doc);
            }
          });
        }
      }
    );
  }
}

// Searching

function searchReport(request, reply) {
  const db = request.server.app.db;
  let data = request.payload;
  let page = data.page || 0;

  let searchKey = data["search-key"];
  let searchBy = data["search-by"];

  let searchReg = new RegExp(searchKey, "i");

  let query = {};
  switch (searchBy) {
    case "user":
      if (searchKey.indexOf("@") != -1) {
        // email
        query.userId = searchReg;
      } else {
        query.userFullName = searchReg;
      }

      break;
    case "patient-name":
      query.patientName = searchReg;
      break;
    case "patient-id":
      query.patientId = searchReg;
      break;

    default:
      return reply(Boom.wrap(err, "Invalid search parameters"));
  }

  db.reports
    .find(query, {
      patientName: 1,
      patientId: 1,
      userId: 1,
      userFullName: 1,
      date: 1
    })
    .limit(20)
    .skip(page * 20)
    .sort({
      date: -1
    })
    .toArray((err, docs) => {
      if (err) return reply(Boom.wrap(err, "Internal server error"));
      let extra = {
        search: true,
        "search-key": searchKey,
        "search-by": searchBy,
      };

      return reply.view("reports", {
        reports: docs,
        file: "reports",
        page: page,
        limit: docs.length,
        extra: extra
      });
    });
}

function searchUsers(request, reply) {
  let data = request.payload;
  const db = request.server.app.db;
  let page = data.page || 0;

  let searchKey = data["search-key"];
  let searchBy = data["search-by"];
  let userStatus = data["enabled"];

  let searchReg = new RegExp(searchKey, "i");

  let query = {};
  switch (searchBy) {
    case "name":
      query.fullName = searchReg;
      break;
    case "email":
      query.username = searchReg;
      break;
    case "mobile":
      query.mobile = searchReg;
      break;
    case "designation":
      query.designation = searchReg;
      break;
    case "organization":
      query.organization = searchReg;
      break;
    default:
      return reply(Boom.wrap(err, "Invalid search parameters"));
  }

  if (userStatus != "all") {
    query.enabled = userStatus;
  }

  query.role = "USER";
  console.log("query", query);

  db.users
    .find(query, {
      username: 1,
      enabled: 1,
      fullName: 1,
      date: 1,
      userFullName: 1,
      date: 1
    })
    .limit(20)
    .skip(page * 20)
    .sort({
      date: -1
    })
    .toArray((err, docs) => {
      if (err) return reply(Boom.wrap(err, "Internal server error"));

      let extra = {
        search: true,
        "search-key": searchKey,
        "search-by": searchBy,
      };

      reply.view("users", {
        users: docs,
        file: "users",
        page: page,
        limit: docs.length,
        extra: extra
      });
    });
}

// end of searching

// Error 404 page

function send404(request, reply) {
  reply.view("error", {
    file: "error"
  });
}

// Index page

function index(request, reply) {
  reply.view("index", {
    file: "index"
  });
}

function adminLoginFailed(reply, message, data) {
  return reply.view("login", {
    message: message,
    data: data,
    page: "login"
  });
}

function adminLoginSuccess(request, reply, user) {
  const sid = String(++request.server.app.uuid);

  request.server.app.cache.set(
    sid,
    {
      user: user
    },
    0,
    err => {
      if (err) {
        return reply(Boom.wrap(err, "Internal server error"));
      }

      request.cookieAuth.set({
        sid: sid
      });
      return reply.redirect("/admin");
    }
  );
}

// Authentication Handlers

function authFail(reply, data, callback) {
  return reply({
    message: "Authentication failed",
    data: data
  }).code(httpStatus.UNAUTHORIZED);
}

function authSuccess(request, reply, user) {
  function generateAndStoreToken(request, opts, user) {
    function generateToken(request, user, opts) {
      opts = opts || {};

      let expiresDefault =
        Math.floor(new Date().getTime() / 1000) + 12 * 4 * 7 * 24 * 60 * 60; // 1 year

      let token = JWT.sign(
        {
          id: user._id,
          username: user.username,
          role: user.role || "USER",
          agent: request.headers["user-agent"],
          exp: opts.expires || expiresDefault
        },
        secret
      );

      return token;
    }

    let token = generateToken(request, user, opts);

    let record = {
      _id: user._id,
      valid: true,
      created: new Date().getTime()
    };

    request.server.app.db.auths.save(record, function(err, doc) {
      // console.log("jwt saved data ", doc);
    });

    return token;
  }

  let token = generateAndStoreToken(request, null, user);

  return reply({
    message: "Authentication success",
    token: token,
    username: user.username,
    role: user.role,
    _id: user._id,
    fullName: user.fullName
  }).type("application.json");
}

function validate(password, user, callback) {
  Bcrypt.compare(password, user.password, callback);
}

function authHandler(request, reply) {
  function checkUp(username, callback) {
    request.server.app.db.users.findOne(
      {
        username: username
      },
      (err, doc) => {
        if (err) {
          return reply(Boom.wrap(err, "Internal server error"));
        }

        callback(null, doc && doc.enabled == "true" ? doc : null);
      }
    );
  }

  function login() {
    let data = request.payload;

    checkUp(data.username, (err, doc) => {
      if (!err && doc) {
        let res = validate(data.password, doc, (err, isValid) => {
          if (err) {
            return reply(Boom.wrap(err, "Internal server error"));
          }

          if (isValid) {
            return authSuccess(request, reply, doc);
          } else {
            return authFail(reply, data, null);
          }
        });
      } else {
        return authFail(reply, data, null);
      }
    });
  }

  return login();
}

module.exports = {
  registerUser: registerUser,
  findUsers: findUsers,
  loginUser: loginUser,
  logout: logout,
  addImage: addImage,
  createReport: createReport,
  getReports: getReports,
  getUsers: getUsers,
  enable: enable,
  recoverPass: recoverPass,
  getImage: getImage,
  serverStatus: serverStatus,
  adminLogout: adminLogout,
  adminLogin: adminLogin,
  getReportDetails: getReportDetails,
  getUserDetails: getUserDetails,
  searchReport: searchReport,
  searchUsers: searchUsers,
  send404: send404,
  index: index
};
