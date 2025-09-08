const firebaseAuthProvider = require('./firebaseAuthProvider');
const nativeAuthProvider = require('./nativeAuthProvider');

const AUTH_TYPE = process.env.AUTH_TYPE || 'native';

function getLoginType() {
    return AUTH_TYPE;
}

let provider;
if (AUTH_TYPE === 'native') {
    provider = nativeAuthProvider;
} else if (AUTH_TYPE === 'firebase') {
    provider = firebaseAuthProvider;
}

module.exports = {
    ...provider,
    getLoginType
};
