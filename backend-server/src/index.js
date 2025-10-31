"use strict";
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require('cors');
const bodyParser = require("body-parser");
const rateLimit = require('express-rate-limit');

const morgan = require(path.join(__dirname, "morganConfig.js"));
const {dbConnection, port} = require("./config/env");
const authenticateToken = require('./auth/authenticateToken');
const callRouter = require("./routes/callRouter.js");
const teacherRouter = require("./routes/teacherRouter.js");
const contentRouter = require("./routes/contentRouter");
const classRoomRouter = require("./routes/classRouter.js");
const userRouter = require("./routes/userRouter.js");
const logRouter = require("./routes/logRouter.js");
const {constants} = require("zlib");
const setupSwagger = require("./swagger");
const tenantRouter = require('./routes/tenantRouter.js');

const app = express();

// Initialize Swagger
setupSwagger(app);

// Define the rate limiter options
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes - The time window for which requests are counted.
  max: 5000, // 5000 requests - The maximum number of requests per IP within the time window.
});

// Root route - redirect to API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

app.use(bodyParser.json());

// Existing code remains unchanged
app.use(morgan('dev'));
app.use('*', cors());
app.use("/call", authenticateToken, callRouter);
app.use("/teacher", authenticateToken, teacherRouter);
app.use("/content", authenticateToken, contentRouter);
app.use("/class", authenticateToken, classRoomRouter);
app.use("/log", authenticateToken, logRouter);
app.use("/user", authenticateToken, userRouter);
app.use("/tenant", tenantRouter);
if (require.main === module) {
  mongoose.connect(dbConnection, () => {
    console.log("Connected to DB")
    app.listen(port, () => {
      console.log(`server running on port ${port}`)
    });
  });
}
module.exports = app;
