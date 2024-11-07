// src/app.js

const express = require('express');
const audioRoutes = require('./routes/audioRoutes');

const app = express();

// Use the audio routes under /api/audio
app.use('/api/audio', audioRoutes);

module.exports = app;
