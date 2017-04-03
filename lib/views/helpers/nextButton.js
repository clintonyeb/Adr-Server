module.exports = function (limit) {
    console.log(limit);
    return limit < 10 ? "disabled" : ""; 
}