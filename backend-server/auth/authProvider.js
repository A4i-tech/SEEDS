const firebaseAuthProvider = require('./firebaseAuthProvider');
const nativeAuthProvider = require('./nativeAuthProvider');

const AUTH_TYPE = process.env.AUTH_TYPE || 'native'; // 'firebase' or 'native'

let authProvider;
if (AUTH_TYPE === 'firebase') {
    authProvider = firebaseAuthProvider;
} else {
    authProvider = nativeAuthProvider;
}

module.exports = authProvider;
