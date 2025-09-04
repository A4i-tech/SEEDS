"use strict";
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require('cors');
const bodyParser = require("body-parser");
const rateLimit = require('express-rate-limit');

const morgan = require(path.join(__dirname, "morganConfig.js"));
const dotenv = require("dotenv/config");
const authProviderMiddleware = require('./auth/authProviderMiddleware');
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
app.use(cors());
app.use("/call", authProviderMiddleware, callRouter);
app.use("/teacher", authProviderMiddleware, teacherRouter);
app.use("/content", authProviderMiddleware, contentRouter);
app.use("/class", authProviderMiddleware, classRoomRouter);
app.use("/log", authProviderMiddleware, logRouter);
app.use("/user", authProviderMiddleware, userRouter);
app.use("/tenant", tenantRouter);

if (require.main === module) {
    mongoose.connect(process.env.DB_CONNECTION, () => {
        console.log("Connected to DB")
        const PORT = process.env.PORT || 4000
        app.listen(PORT, () => {
            console.log(`server running on port ${PORT}`)
        });
    });
}
module.exports = app;
