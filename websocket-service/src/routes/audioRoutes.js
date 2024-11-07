// src/routes/audioRoutes.js

const express = require('express');
const router = express.Router();
const audioController = require('../controllers/audioController');

// Parse JSON bodies
router.use(express.json());

router.post('/play/:id', audioController.play);
router.post('/pause/:id', audioController.pause);
router.post('/resume/:id', audioController.resume);
router.post('/stop/:id', audioController.stop);
router.post('/close/:id', audioController.closeConnection);

module.exports = router;
