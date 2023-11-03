const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const sitemapRouter = require("./router/sitemapRouter");
const editorRouter = require("./router/editorRouter");
const userRouter = require("./router/userRouter");
const tagRouter = require("./router/tagRouter");
const categoryRouter = require("./router/categoryRouter");
const logRouter = require("./router/logRouter");
const bannerRouter = require("./router/bannerRouter");
const editorLinkMangerRouter = require("./router/editorLinkMangerRouter");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const session = require("express-session");
const YAML = require("yamljs");
const fs = require("fs");
require("dotenv").config();

const PORT = process.env.PORT;

mongoose.set("strictQuery", true);
mongoose
  .connect(process.env.CON_STR)
  .then(() => {
    console.log("連結到mongodb...");
  })
  .catch((e) => {
    console.log(e);
  });

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
      domain: ".wilsonwan.com",
      expires: 1800000,
    },
    maxAge: 1800000, // Approximately Friday, 31 Dec 9999 23:59:59 GMT
    saveUninitialized: false,
    resave: false, //avoid server race condition
    // store: MongoStore.create({ mongoUrl: process.env.CON_STR }),
  })
);

const swaggerDocument = YAML.load("./index.yml");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const corsOptions = {
  origin: [
    "http://localhost",
    "http://localhost:3000",
    "http://backstage.wilsonwan.com",
    "http://backstage.wilsonwan.com:4200",
    "http://backstage.wilsonwan.com:8080",
    "http://backstage.wilsonwan.com:8081",
    "http://wilsonwan.com",
    "http://10.88.0.103:4200",
    "http://10.88.0.103",
    "http://127.0.0.1:5050",
  ],
  optionsSuccessStatus: 200, //
  credentials: true,
  // methods: ["GET", "POST", "PUT", "DELETE"],
  //some legacy browsers (IE11, various SmartTVs) choke on 204
};
const staticFolderPath = path.join(__dirname, "saved_image");
app.use("/saved_image", express.static(staticFolderPath));
app.use(express.static(__dirname));

app.use(express.json());
app.use(cors(corsOptions));
app.disable("x-powered-by");
app.use(function (req, res, next) {
  const allowedOrigins = [
    "http://localhost",
    "http://localhost:3000",
    "http://backstage.wilsonwan.com",
    "http://backstage.wilsonwan.com:4200",
    "http://backstage.wilsonwan.com:8080",
    "http://backstage.wilsonwan.com:8081",
    "http://wilsonwan.com",
    "http://10.88.0.103:4200",
    "http://10.88.0.103",
    "http://127.0.0.1:5050",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", true);
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH");
  res.header(
    "Access-Control-Allow-Headers",
    "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept"
  );
  next();
});
// app.use(logUserActivity);
app.use(sitemapRouter);
app.use(editorRouter);
app.use(userRouter);
app.use(tagRouter);
app.use(categoryRouter);
app.use(bannerRouter);
app.use(logRouter);
app.use(editorLinkMangerRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(PORT, () => {
  console.log(`server started at port ${PORT}`);
});
