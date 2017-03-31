'use strict';

const JWT = require('jsonwebtoken');
const secret = require('../secret');
const Boom = require('boom')
const Bcrypt = require('bcrypt')

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
                reply(Boom.wrap(err, 'Internal server error'));
                return callback(err);
            }
            callback(null, doc);
        })
    }

    function validate(password, user, callback) {
        Bcrypt.compare(password, user.password, callback)
    }

    function login() {

        let data = request.payload;

        checkUp(data.username, (err, doc) => {

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


module.exports = authHandler