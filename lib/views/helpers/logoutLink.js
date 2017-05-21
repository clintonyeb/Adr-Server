module.exports = function (page) {
    return page == 'login' || page == 'index' || page == 'error'  ? "login" : 'logout'; 
}