const express = require("express");
const cors = require("cors");
const tagRouter = require("./router/tagRouter");
const editorRouter = require("./router/editorRouter");
const userRouter = require("./router/userRouter");
const sitemapRouter = require("./router/sitemapRouter");
const categoryRouter = require("./router/categoryRouter");
require("dotenv").config();
require("./mongoose");
const session = require("express-session");
const fs = require("fs");
const https = require("https");
// const io = require('socket.io')

const app = express();
// const PORT = 4200
const PORT = process.env.PORT || 4200;
// const CorsOrgin

const corsOptions = {
  origin: [
    "http://uat-dashboard.oogiriinfo.com",
    "http://uat-front.oogiriinfo.com",
  ],
  optionsSuccessStatus: 200, //
  credentials: true,
  // methods: ["GET", "POST", "PATCH", "DELETE"],
  //some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(express.json());
app.use(cors(corsOptions));

//set session attribute
app.use(
  session({
    secret: process.env.SESSIONSECRETKEY,
    // secret: crypto.randomUUID(),
    name: "sid", // optional
    cookie: {
      secure: false, //if set true only excute on https
      // path: userRouter,
      // maxAge: new Date(253402300000000), // Approximately Friday, 31 Dec 9999 23:59:59 GMT
      httpOnly: true,
      domain: ".oogiriinfo.com",
      expires: 28800000,
    },
    maxAge: 28800000, // Approximately Friday, 31 Dec 9999 23:59:59 GMT
    saveUninitialized: false,
    resave: false, //avoid server race condition
    // store: MongoStore.create({ mongoUrl: process.env.CON_STR }),
  })
);

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Credentials", true);
  res.header(
    "Access-Control-Allow-Origin",
    "http://uat-dashboard.oogiriinfo.com",
    "http://uat-front.oogiriinfo.com"
  );
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH");
  res.header(
    "Access-Control-Allow-Headers",
    "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept"
  );
  next();
});

app.use(sitemapRouter);
app.use(categoryRouter);
app.use(userRouter);
app.use(editorRouter);
app.use(tagRouter);

// server.listen(4200)
app.listen(PORT, () => {
  console.log(`server started at port ${PORT}`);
});

// io.listen(server);
