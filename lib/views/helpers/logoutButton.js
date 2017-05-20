module.exports = function (page) {
    return page == 'login' || page == 'index' || page == 'error'  ? "Log in" : 'Log out'; 
}