module.exports = function (time) {
    const moment = require('moment')

    return moment(time).fromNow();
}