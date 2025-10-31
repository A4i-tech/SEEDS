// src/auth/nativeAuthProvider.js
// Stub implementation for nativeAuthProvider to fix test errors.

module.exports = {
  register: async (req, res) => {
    // TODO: Implement registration logic
    res.status(501).json({ message: 'Not implemented' });
  },
  login: async (req, res) => {
    // TODO: Implement login logic
    res.status(501).json({ message: 'Not implemented' });
  }
};
