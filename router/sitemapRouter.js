const express = require("express");
const sitemapRouter = new express.Router();
const { SitemapStream, streamToPromise } = require("sitemap");
const { createGzip } = require("zlib");
const { Readable } = require("stream");
const Sitemap = require("../model/sitemap");
const Editor = require("../model/editor");
const Categories = require("../model/categories");
const Tags = require("../model/tags");
require("dotenv").config();

let sitemap;
const domain = process.env.DOMAIN;

sitemapRouter.get("/checkUrl/:url", async function (req, res) {
  try {
    const url = decodeURIComponent(req.params.url);
    const findData = await Sitemap.findOne({ url: url }).select(
      "url originalID type -_id"
    );
    let targetData;
    switch (findData.type) {
      case "editor":
        targetData = await Editor.findOne({ _id: findData.originalID })
          .populate({ path: "tags", select: "name" })
          .populate({ path: "categories", select: "name" });
        const tagIds = targetData.tags.map((tag) => tag._id);

        const [categorySitemap, tagSitemaps] = await Promise.all([
          Sitemap.findOne({
            originalID: targetData.categories._id,
            type: "category",
          }),
          Sitemap.find({ originalID: { $in: tagIds }, type: "tag" }),
        ]);

        const tagSitemapMap = new Map(
          tagSitemaps.map((sitemap) => [
            sitemap.originalID.toString(),
            sitemap.url,
          ])
        );

        targetData = targetData.toObject();

        if (categorySitemap) {
          targetData.categories = {
            ...targetData.categories,
            sitemapUrl: categorySitemap.url,
          };
        }

        targetData.tags = targetData.tags.map((tag) => ({
          ...tag,
          sitemapUrl: tagSitemapMap.get(tag._id.toString()),
        }));

        const editorSitemap = await Sitemap.findOne({
          originalID: targetData._id,
          type: "editor",
        });

        if (editorSitemap) {
          targetData.sitemapUrl = editorSitemap.url;
        }

        break;
      case "category":
        targetData = await Categories.findOne({ _id: findData.originalID });
        break;
      case "tag":
        targetData = await Tags.findOne({ _id: findData.originalID });
        break;
    }
    const result = { Type: findData.type, data: targetData };

    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

sitemapRouter.get("/sitemap/getAllUrl", async function (req, res) {
  try {
    const unCategorizedUrl = await Categories.findOne({
      keyName: "Uncategorized",
    });
    const urlList = await Sitemap.find({
      originalID: { $ne: unCategorizedUrl._id },
    }).select("-_id url");

    res.status(200).json(urlList);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// sitemapRouter.post("/urls", async function (req, res) {
//   try {
//     const { url } = req.body;
//     const sitemap = new Sitemap({
//       url: url,
//     });

//     await sitemap.save();
//     res.status(201).json({
//       sitemap,
//     });
//   } catch (e) {
//     return res.status(500).send({ message: e.message });
//   }
// });

sitemapRouter.get("/sitemap.xml", async function (req, res) {
  res.header("Content-Type", "application/xml");
  res.header("Content-Encoding", "gzip");
  // if we have a cached entry send it
  if (sitemap) {
    res.send(sitemap);
    return;
  }

  try {
    const smStream = new SitemapStream({
      hostname: domain,
    });
    const pipeline = smStream.pipe(createGzip());
    const urlData = await Sitemap.find({}).select("url changefreq priority");
    // await Sitemap.find({});
    smStream.write({ url: "/", changefreq: "daily", priority: 0.9 });
    for (const url of urlData) {
      smStream.write({
        url: url.url,
        changefreq: url.changefreq,
        priority: url.priority,
      });
    }

    // cache the response
    streamToPromise(pipeline).then((sm) => (sitemap = sm));
    // make sure to attach a write stream such as streamToPromise before ending
    smStream.end();
    // stream write the response
    pipeline.pipe(res).on("error", (e) => {
      throw e;
    });
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

module.exports = sitemapRouter;

// const express = require("express");
// const sitemapRouter = new express.Router();
// const {
//   SitemapAndIndexStream,
//   SitemapStream,
//   streamToPromise,
//   lineSeparatedURLsToSitemapOptions,
// } = require("sitemap");
// const { createGzip } = require("zlib");
// const { createReadStream, createWriteStream } = require("fs");
// const { resolve } = require("path");
// const { Readable } = require("stream");
// const Sitemap = require("../model/sitemap");
// const Editor = require("../model/editor");
// const Categories = require("../model/categories");
// const Tags = require("../model/tags");

// require("dotenv").config();

// const domain = "http://127.0.0.1/";

// sitemapRouter.get("/checkUrl/:url", async function (req, res) {
//   try {
//     const url = decodeURIComponent(req.params.url);
//     const findData = await Sitemap.findOne({ url: url }).select(
//       "url originalID type -_id"
//     );
//     let schema;
//     switch (findData.type) {
//       case "editor":
//         schema = Editor;
//         break;
//       case "category":
//         schema = Categories;
//         break;
//       case "tag":
//         schema = Tags;
//         break;
//     }
//     const targetData = await schema.findOne({ _id: findData.originalID });
//     const result = { data: targetData };

//     res.status(200).send(result);
//   } catch (err) {
//     res.status(500).send({ message: err.message });
//   }
// });

// sitemapRouter.get("/sitemap.xml", async function (req, res) {
//   res.header("Content-Type", "application/xml");
//   res.header("Content-Encoding", "gzip");

//   try {
//     const sms = new SitemapAndIndexStream({
//       limit: 50000,
//       getSitemapStream: (i) => {
//         const sitemapStream = new SitemapStream({
//           hostname: domain,
//         });
//         const path = `C:/Users/user/Desktop/seo-IND-dev/SIT-code/sitemap-${
//           i + 1
//         }.xml`;

//         const ws = sitemapStream
//           .pipe(createGzip())
//           .pipe(createWriteStream(resolve(path + ".gz")));

//         return [new URL(path, domain).toString(), sitemapStream, ws];
//       },
//     });

//     sms
//       .pipe(createGzip())
//       .pipe(
//         createWriteStream(
//           resolve(
//             "C:/Users/user/Desktop/seo-IND-dev/SIT-code/sitemap-index.xml.gz"
//           )
//         )
//       );
//     const arrayOfSitemapItems = await Sitemap.find({}).select(
//       "url changefreq priority"
//     );
//     arrayOfSitemapItems.forEach((item) => sms.write(item));
// sms.write({ url: "/", changefreq: "daily", priority: 0.9 });
// for (const url of urlData) {
//   sms.write({
//     url: url.url,
//     changefreq: url.changefreq,
//     priority: url.priority,
//   });
// }
// streamToPromise(sms).then((sm) => (sitemap = sm));
// Readable.from(urlData).pipe(sms);

// sms.pipe(res).on("error", (e) => {
//   throw e;
// });

// const sitemapIndexPath = resolve(
//   "C:/Users/user/Desktop/seo-IND-dev/SIT-code/sitemap-index.xml.gz"
// );
// const sitemapIndex = createGzip().pipe(createWriteStream(sitemapIndexPath));
// sms.pipe(sitemapIndex).on("error", (e) => {
//   throw e;
// });

// sms.end();
// Once the sitemapIndex is finished, read the file and pipe it to the response
// sitemapIndex.on("finish", () => {
//   createReadStream(sms).pipe(res);
// });
// console.log("done");
//   } catch (e) {
//     console.error(e);
//     res.status(500).end();
//   }
// });

// module.exports = sitemapRouter;
