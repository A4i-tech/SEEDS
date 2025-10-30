const firebaseAuthProvider = require('./firebaseAuthProvider');
const nativeAuthProvider = require('./nativeAuthProvider');
const {authType} = require('../config/env');

function getLoginType() {
  return authType;
}

let provider;
if (authType === 'firebase') {
  provider = firebaseAuthProvider;
} else {
  provider = nativeAuthProvider;
}

module.exports = {
  ...provider,
  getLoginType
};
