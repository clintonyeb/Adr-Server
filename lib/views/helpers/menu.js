module.exports = function (send, page) {
    return send === page ? "is-active" : ''; 
}