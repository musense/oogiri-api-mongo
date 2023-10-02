const express = require("express");
const Editor = require("../model/editor");
const Sitemap = require("../model/sitemap");
const Categories = require("../model/categories");
const Tags = require("../model/tags");
const tempEditor = require("../model/tempEditor");
const draftEditor = require("../model/draftEditor");
const Ips = require("../model/ip");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const slugify = require("slugify");
const escapeHtml = require("escape-html");
const { Text } = require("slate");
const path = require("path");
const url = require("url");
const requestIp = require("request-ip");
const Log = require("../model/changeLog");
const logChanges = require("../logChanges");
const verifyUser = require("../verifyUser");
const { setCache, getCache, scanAndDelete } = require("../redisCache");
require("dotenv").config();

const editorRouter = new express.Router();
// *simulate delay situation in real world
// editorRouter.use(function (req, res, next) {
//     console.time('simulate get editor delay...')
//     setTimeout(() => {
//         next()
//         console.timeEnd('simulate get editor delay...')
//     }, 0 * 1000)
// })
const domain = process.env.DOMAIN;
const LOCAL_DOMAIN = process.env.LOCAL_DOMAIN;
const IMG_CONTENT_PATH = process.env.IMG_CONTENT_PATH;
const IMG_HOMEPAGE_PATH = process.env.IMG_HOMEPAGE_PATH;
const DBLOG_FILE_PATH = process.env.DBLOG_FILE_PATH;

function getIpInfo(req, res, next) {
  const clientIp = requestIp.getClientIp(req);
  res.clientIp = clientIp;
  next();
}
function parseRequestBody(req, res, next) {
  const {
    headTitle,
    headKeyword,
    headDescription,
    title,
    manualUrl,
    altText,
    hidden,
    topSorting,
    popularSorting,
    recommendSorting,
    scheduledAt,
    draft,
  } = req.body;
  if (req.method === "POST") {
    res.headTitle = headTitle !== undefined ? JSON.parse(headTitle) : null;
    res.headKeyword =
      headKeyword !== undefined ? JSON.parse(headKeyword) : null;
    res.headDescription =
      headDescription !== undefined ? JSON.parse(headDescription) : null;
    res.altText = altText !== undefined ? JSON.parse(altText) : null;
    res.title = title !== undefined ? JSON.parse(title) : null;
    res.topSorting = topSorting !== undefined ? JSON.parse(topSorting) : null;
    res.hidden = hidden !== undefined ? JSON.parse(hidden) : false;
    res.popularSorting =
      popularSorting !== undefined ? JSON.parse(popularSorting) : null;
    res.recommendSorting =
      recommendSorting !== undefined ? JSON.parse(recommendSorting) : null;
    res.manualUrl = manualUrl !== undefined ? JSON.parse(manualUrl) : null;
    res.scheduledAt =
      scheduledAt !== undefined ? new Date(JSON.parse(scheduledAt)) : null;
    res.draft = draft !== undefined ? JSON.parse(draft) : false;
  }
  if (req.method === "PATCH") {
    res.headTitle =
      headTitle === undefined
        ? undefined
        : headTitle === null
        ? null
        : JSON.parse(headTitle);
    res.headKeyword =
      headKeyword === undefined
        ? undefined
        : headKeyword === null
        ? null
        : JSON.parse(headKeyword);
    res.headDescription =
      headDescription === undefined
        ? undefined
        : headDescription === null
        ? null
        : JSON.parse(headDescription);
    res.title =
      title === undefined
        ? undefined
        : title === null
        ? null
        : JSON.parse(title);
    res.manualUrl =
      manualUrl === undefined
        ? undefined
        : manualUrl === null
        ? null
        : JSON.parse(manualUrl);
    res.altText =
      altText === undefined
        ? undefined
        : altText === null
        ? null
        : JSON.parse(altText);
    res.hidden =
      hidden === undefined
        ? undefined
        : hidden === null
        ? false
        : JSON.parse(hidden);
    res.scheduledAt =
      scheduledAt === undefined
        ? undefined
        : scheduledAt === null
        ? null
        : new Date(JSON.parse(scheduledAt));
    res.draft =
      draft === undefined
        ? undefined
        : draft === false
        ? false
        : JSON.parse(draft);
  }
  next();
}

async function getMaxSerialNumber() {
  const maxSerialNumberEditor = await Editor.findOne()
    .sort({ serialNumber: -1 })
    .select("-_id serialNumber");
  return maxSerialNumberEditor ? maxSerialNumberEditor.serialNumber : 0;
}

async function parseCategories(req, res, next) {
  try {
    let categoryJsonString = req.body.categories;
    let categories;
    if (req.method === "POST") {
      categories =
        categoryJsonString !== undefined
          ? JSON.parse(categoryJsonString)
          : null;
    }
    if (req.method === "PATCH") {
      categories =
        categoryJsonString === undefined
          ? undefined
          : categoryJsonString === null
          ? null
          : JSON.parse(categoryJsonString);
    }
    //分類為空值時因JSON stringtify的關係會被轉成字串null
    if (categories === undefined) {
      res.categories = undefined;
      return next();
    } else if (categories === null) {
      const findUncategorized = await Categories.findOne({
        name: "未分類",
      }).select("_id name");
      res.categories = findUncategorized;
      return next();
    }

    if (!(categories instanceof Array)) {
      throw new Error("Invalid input: categories must be an array");
    }
    if (categories.length > 1) {
      throw new Error("Invalid input: cannot over one category");
    }

    const categoriesMap = new Map();

    for (const category of categories) {
      if (!categoriesMap.has(category.name)) {
        const existingCategory = await Categories.findOne({
          name: category.name,
        });

        if (existingCategory) {
          categoriesMap.set(category.name, existingCategory._id);
        } else {
          throw new Error("Category name error");
        }
      }
    }
    const categoriesArray = categories.map((category) =>
      categoriesMap.get(category.name)
    );

    res.categories = categoriesArray;
    next();
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
}

async function parseTags(req, res, next) {
  try {
    let tagJsonString = req.body.tags;
    let tags;
    if (req.method === "POST") {
      tags = tagJsonString !== undefined ? JSON.parse(tagJsonString) : null;
    }
    if (req.method === "PATCH") {
      tags =
        tagJsonString === undefined
          ? undefined
          : tagJsonString === null
          ? null
          : JSON.parse(tagJsonString);
    }
    // console.log(tags);
    // console.log(typeof tags);

    if (tags === null) {
      res.tags = [];
      return next();
    } else if (tags === undefined) {
      res.tags = undefined;
      return next();
    }

    if (!(tags instanceof Array)) {
      throw new Error("Invalid input: tags must be an array");
    }

    const tagsMap = new Map();

    for (const tag of tags) {
      if (tag.__isNew__ === true) {
        const newTagUrl = `${domain}tag_${tag.name}.html`;
        const newTag = new Tags({
          name: tag.name,
          originalUrl: newTagUrl,
        });
        await newTag.save();
        tagsMap.set(tag.name, newTag._id);

        const newTagSitemap = new Sitemap({
          url: newTagUrl,
          originalID: newTag._id,
          type: "tag",
        });
        await newTagSitemap.save();
      } else {
        if (!tagsMap.has(tag.name)) {
          const existingTag = await Tags.findOne({ name: tag.name });

          if (existingTag) {
            tagsMap.set(tag.name, existingTag._id);
          } else {
            throw new Error("Tag name error");
          }
        }
      }
    }

    const tagsArray = tags.map((tag) => tagsMap.get(tag.name));

    res.tags = tagsArray;
    next();
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
}

function parseHTML(req, res, next) {
  const contentJsonString = req.body.content;
  if (req.method === "PATCH" && !contentJsonString) {
    res.content = undefined;
    next();
    return;
  }
  if (!contentJsonString) {
    res.content = "";
    next();
    return;
  }

  const content = JSON.parse(contentJsonString);
  // console.log(typeof content);

  const serialize = (node) => {
    if (Text.isText(node)) {
      let string = escapeHtml(node.text);
      let textStyle = "";
      if (node.bold) {
        string = `<strong>${string}</strong>`;
      }
      if (node.hide) {
        string = `<span style="display: none;">${string}</span>`;
      }
      if (node.italic) {
        string = `<em>${string}</em>`;
      }
      if (node.underline) {
        string = `<span style="text-decoration: underline;">${string}</span>`;
      }
      if (node.code) {
        string = `<code>${string}</code>`;
      }

      if (node.color) {
        textStyle += `color: ${escapeHtml(node.color)};`;
      }
      if (node.backgroundColor) {
        textStyle += `background-color: ${escapeHtml(node.backgroundColor)};`;
      }
      if (textStyle) {
        string = `<span style="${textStyle}">${string}</span>`;
      }
      return string;
    }

    const children = node.children.map((n) => serialize(n)).join("");
    let style = node.hide ? "display: none;" : "";

    if (node.align === "left") {
      style += "text-align: left;";
    } else if (node.align === "center") {
      style += "text-align: center;";
    } else if (node.align === "right") {
      style += "text-align: right;";
    } else if (node.align === "justify") {
      style += "text-align: justify;";
    }

    const alignmentClasses = {
      left: "left",
      center: "center",
      right: "right",
    };

    let classString = `class="${alignmentClasses[node.alignment] || ""}"`;

    switch (node.type) {
      case "quote":
        return `<blockquote style="${style}"><p>${children}</p></blockquote>`;
      case "paragraph":
        const hasCodeChild = node.children.some((child) => child.code);
        if (hasCodeChild) {
          return `<p class="code" style="${style}">${children}</p>`;
        } else {
          return `<p style="${style}">${children}</p>`;
        }
      case "block-quote":
        return `<blockquote style="${style}">${children}</blockquote>`;
      case "h1":
        return `<h1 style="${style}"><strong>${children}</strong></h1>`;
      case "h2":
        return `<h2 style="${style}"><strong>${children}</strong></h2>`;
      case "h3":
        return `<h3 style="${style}"><strong>${children}</strong></h3>`;
      case "table":
        return `<table ${classString}><tbody>${children}</tbody></table>`;
      case "table-row":
        return `<tr ${classString}>${children}</tr>`;
      case "table-cell":
        return `<td ${classString}>${children}</td>`;
      case "list-item":
        return `<li style="${style}">${children}</li>`;
      case "numbered-list":
        return `<ol style="${style}">${children}</ol>`;
      case "bulleted-list":
        return `<ul style="${style}">${children}</ul>`;
      case "image":
        const hrefAttribute = node.href
          ? `href="${escapeHtml(node.href)}"`
          : "";
        const titleAttribute = node.href
          ? escapeHtml(node.href)
          : escapeHtml(node.alt);
        const srcAttribute = node.url ? `src="${escapeHtml(node.url)}"` : "";
        const altAttribute = node.alt ? `alt="${escapeHtml(node.alt)}"` : "";
        if (node.href) {
          return `<a ${hrefAttribute} title = ${titleAttribute} rel = "noopener noreferrer" target = "_blank"> <img ${srcAttribute} ${altAttribute}>${children}</img></a>`;
        } else {
          return `<img ${srcAttribute} ${altAttribute}>${children}</img>`;
        }
      case "link":
        return `<a target="_blank" rel="noopener noreferrer" href="${escapeHtml(
          node.url
        )}">${children}</a>`;
      case "button":
        const buttonType = node.buttonType
          ? `type="${escapeHtml(node.buttonType)}"`
          : "";
        return `<button ${buttonType}>${children}</button>`;
      case "badge":
        return `<span class="badge">${children}</span>`;
      default:
        return children;
    }
  };

  const htmlContent = content.map(serialize).join("");

  res.content = content;
  res.htmlContent = htmlContent;
  next();
}

//後台編輯熱門文章用
async function getNewPopularEditors() {
  try {
    // 1. 取 popular 不為空值的文章
    const popularEditorsWithSorting = await Editor.find({
      popularSorting: { $exists: true, $ne: null },
      status: "已發布",
    }).select(
      "_id serialNumber title htmlContent publishedAt popularSorting pageView homeImagePath"
    );
    const sortingEditorIds = popularEditorsWithSorting.map(
      (editor) => editor._id
    );

    // 2. 取前五名自然點閱率的熱門文章
    let popularEditors = await Editor.find({
      pageView: { $ne: null },
      status: "已發布",
      _id: { $nin: sortingEditorIds },
    })
      .sort({ pageView: -1, publishedAt: -1 })
      .limit(5)
      .select(
        "_id serialNumber title htmlContent publishedAt pageView popularSorting homeImagePath"
      );

    const sortingMap = new Map();
    popularEditorsWithSorting.forEach((editor) => {
      sortingMap.set(editor.popularSorting, editor);
    });

    // 初始化 finalEditors 並填充
    const finalEditors = [];
    let j = 0; // 用於追踪 popularEditors 的索引
    for (let i = 0; i < 5; i++) {
      if (sortingMap.has(i + 1)) {
        finalEditors.push(sortingMap.get(i + 1));
      } else {
        if (popularEditors[j]) {
          finalEditors.push(popularEditors[j]);
        }
        j++;
      }
    }

    const updatePopularEditors = await Promise.all(
      finalEditors.map(async (editor) => {
        const sitemapUrl = await Sitemap.findOne({
          originalID: editor._id,
          type: "editor",
        });
        if (sitemapUrl) {
          editor = editor.toObject(); // convert mongoose document to plain javascript object
          editor.sitemapUrl = sitemapUrl.url; // add url property
        }
        if (editor.htmlContent) {
          editor.htmlContent = extractFirstParagraph(editor.htmlContent);
        }
        return editor;
      })
    );
    // 傳回新的結果
    return updatePopularEditors;
  } catch (error) {
    throw new Error(error.message);
  }
}

async function getNewUnpopularEditors(skip, limit, name) {
  // 1. Get top 5 pageVies data
  const popularEditors = await getNewPopularEditors();
  //2. Get popular editors' _id array
  const popularEditorIds = popularEditors.map((editor) => editor._id);
  // Create the base query
  const baseQuery = {
    _id: { $nin: popularEditorIds },
    status: "已發布",
  };

  // Add the title filter if a name is provided
  if (name) {
    baseQuery.title = { $regex: name, $options: "i" };
  }

  // 3. Find all editors that don't have _id in the newPopularEditors array
  const nonPopularEditors = await Editor.find(baseQuery)
    .sort({ pageView: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select(
      "_id serialNumber title publishedAt popularSorting pageView homeImagePath"
    );
  const updateNonPopularEditors = await Promise.all(
    nonPopularEditors.map(async (editor) => {
      const sitemapUrl = await Sitemap.findOne({
        originalID: editor._id,
        type: "editor",
      });
      if (sitemapUrl) {
        editor = editor.toObject(); // convert mongoose document to plain javascript object
        editor.sitemapUrl = sitemapUrl.url; // add url property
      }
      return editor;
    })
  );

  // 4. Get the total number of documents that don't have _id in the popularEditorIds array
  const totalDocs = await Editor.countDocuments(baseQuery).exec();
  return {
    editors: updateNonPopularEditors,
    totalCount: totalDocs,
  };
}
//* _id
async function getEditor(req, res, next) {
  const id = req.params.id;
  let draft = req.query.draft;
  if (draft !== undefined) {
    draft = parseInt(draft, 10);

    if (!isPositiveInteger(draft) || draft !== 1) {
      return res.status(400).send({
        message: "Invalid draft. It must be a positive integer.",
      });
    }
  }
  let editor;
  try {
    if (draft === 1) {
      editor = await draftEditor
        .findOne({ _id: id })
        .populate({ path: "categories", select: "name" })
        .populate({ path: "tags", select: "name" });
    } else {
      editor = await Editor.findOne({ _id: id })
        .populate({ path: "categories", select: "name" })
        .populate({ path: "tags", select: "name" });
    }
    if (editor == undefined) {
      return res.status(404).json({ message: "can't find editor!" });
    }
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }

  res.editor = editor;
  next();
}

function isPositiveInteger(input) {
  return typeof input === "number" && Number.isInteger(input) && input >= 0;
}

function parseQuery(req, res, next) {
  let pageNumber = req.query.pageNumber;
  let limit = req.query.limit;

  if (pageNumber !== undefined) {
    pageNumber = parseInt(pageNumber, 10);

    if (!isPositiveInteger(pageNumber)) {
      return res.status(400).send({
        message: "Invalid pageNumber. It must be a positive integer.",
      });
    }
  }

  if (limit !== undefined) {
    limit = parseInt(limit, 10);
    if (!isPositiveInteger(limit)) {
      return res.status(400).send({
        message: "Invalid limit. It must be a positive integer.",
      });
    }
  }

  req.pageNumber = pageNumber;
  req.limit = limit;
  next();
}

function uploadImage() {
  const storage = multer.memoryStorage();
  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 10000000, //maximim size 10MB
      fieldSize: 10 * 1024 * 1024,
    },
  });
  // return upload.single("homeImagePath");
  return upload.fields([
    { name: "homeImagePath", maxCount: 1 },
    { name: "contentImagePath", maxCount: 1 },
  ]);
}

async function processImage(file, originalFilename) {
  // console.log(file);
  if (!file || !originalFilename) {
    // If there is no file or originalFilename, return null
    return null;
  }
  if (file.mimetype.startsWith("text/")) {
    return file.buffer.toString("utf-8");
  } else if (file.mimetype.startsWith("image/")) {
    // compress image using sharp
    const compressedImage = await sharp(file.buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true, quality: 90 });

    const compressedImage2 = await sharp(file.buffer)
      .resize(450, 300, { fit: "inside", withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true, quality: 70 });

    const extension = originalFilename.substring(
      originalFilename.lastIndexOf(".")
    );
    const filenameWithoutExtension = originalFilename.substring(
      0,
      originalFilename.lastIndexOf(".")
    );
    const newFilename =
      slugify(filenameWithoutExtension, {
        replacement: "-", // replace spaces with replacement character, defaults to `-`
        remove: /[^a-zA-Z0-9]/g, // remove characters that match regex, defaults to `undefined`
        lower: true, // convert to lower case, defaults to `false`
        strict: false, // strip special characters except replacement, defaults to `false`
        trim: true, // trim leading and trailing replacement chars, defaults to `true`
      }) +
      "-" +
      Date.now() +
      extension;

    // save compressed image to disk
    fs.writeFileSync(
      `${IMG_CONTENT_PATH}/${newFilename}`,
      compressedImage.data
    );
    fs.writeFileSync(
      `${IMG_HOMEPAGE_PATH}/${newFilename}`,
      compressedImage2.data
    );
    return newFilename;
    // }
  } else {
    return null;
  }
}

const extractFirstParagraph = (htmlContent) => {
  const match = htmlContent.match(/<p.*?>(.*?)<\/p>/);
  return match ? match[1] : "";
};

editorRouter.patch("/updateStatus", async (req, res) => {
  try {
    const updateList = await Editor.find();
    let updateCount = 0;
    for (let editor of updateList) {
      let editorDocument = await Editor.findById(editor._id);

      // 修改它的屬性
      if (["隱藏文章", "已發布"].includes(editorDocument.status)) {
        editorDocument.publishedAt = editorDocument.createdAt;
      }
      await editorDocument.save();
      updateCount++;
    }
    res.status(200).send({ message: `Update ${updateCount} successfully` });

    // const editors = await Editor.find({
    //   originalUrl: { $exists: true, $ne: null },
    // });

    // editors.forEach(async (editor) => {
    //   editor.originalUrl = editor.originalUrl.replace(
    //     "http://10.88.0.103:3000",
    //     "http://10.88.0.103:3001"
    //   );
    //   await editor.save();
    // });
    // res.status(200).send({ message: `Update successfully` });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

editorRouter.post("/editor/verifyUser", verifyUser, (req, res) => {
  res.status(200).json({ message: "User is verified" });
});

//列出前台全部文章
editorRouter.get(
  "/editor/frontEnd/getAllEditors",
  verifyUser,
  parseQuery,
  async (req, res) => {
    try {
      const { pageNumber, limit } = req;
      const { regexSearch } = req.query;
      const skip = pageNumber ? (pageNumber - 1) * limit : 0;

      let matchQuery = { status: "已發布" };

      if (regexSearch) {
        matchQuery.$or = [
          { title: { $regex: regexSearch, $options: "i" } },
          { "tagDetails.name": { $regex: regexSearch, $options: "i" } },
        ];
      }

      const allItems = await Editor.aggregate([
        {
          $lookup: {
            from: "tags",
            localField: "tags",
            foreignField: "_id",
            as: "tagDetails",
          },
        },
        {
          $unwind: {
            path: "$tagDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$_id",
            root: { $first: "$$ROOT" },
            tagNames: { $push: "$tagDetails.name" },
          },
        },
        {
          $addFields: {
            "root.tags": "$tagNames",
          },
        },
        {
          $replaceRoot: { newRoot: "$root" },
        },
        {
          $sort: { publishedAt: -1 },
        },
        {
          $match: matchQuery,
        },
        {
          $addFields: {
            sortTop: {
              $cond: [
                { $eq: ["$topSorting", null] },
                Number.MAX_VALUE,
                "$topSorting",
              ],
            },
          },
        },
        {
          $sort: { sortTop: 1 },
        },
        {
          $facet: {
            data: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  serialNumber: 1,
                  title: 1,
                  htmlContent: 1,
                  tags: 1,
                  publishedAt: 1,
                  topSorting: 1,
                  homeImagePath: 1,
                },
              },
            ],
            totalCount: [
              {
                $count: "count",
              },
            ],
          },
        },
      ]).exec();
      const [{ data, totalCount }] = allItems;
      const updateData = await Promise.all(
        data.map(async (editor) => {
          const sitemapUrl = await Sitemap.findOne({
            originalID: editor._id,
            type: "editor",
          });
          if (sitemapUrl) {
            editor.sitemapUrl = sitemapUrl.url; // add url property
          }
          if (editor.htmlContent) {
            editor.htmlContent = extractFirstParagraph(editor.htmlContent);
          }
          return editor;
        })
      );
      const totalDocs = totalCount[0] ? totalCount[0].count : 0;

      const result = {
        data: updateData,
        totalCount: totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        limit: limit,
        currentPage: pageNumber,
      };

      res.status(200).json(result);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

//後台編輯文章處顯示用
editorRouter.get("/editor", verifyUser, parseQuery, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { pageNumber, limit } = req;
    const { status } = req.query;
    const skip = pageNumber ? (pageNumber - 1) * limit : 0;

    const titlesQuery = req.query.title;
    const categoriesQuery = req.query.category;

    const query = {};

    let start;
    let end;
    // Try to get data from cache
    const generateCacheKey = (query) => {
      let objectTypeString = "editorList";
      for (const [key, value] of Object.entries(query)) {
        objectTypeString += `:${key}:${value}`;
      }
      return objectTypeString;
    };
    const cacheKey = generateCacheKey(req.query);

    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
      return res.status(200).send(cachedResult);
    }

    if (startDate) {
      start = new Date(Number(startDate));
      if (isNaN(start)) {
        res.status(400).send({
          message:
            "Invalid startDate. It must be a valid date format or a timestamp.",
        });
        return;
      }
    }

    if (endDate) {
      end = new Date(Number(endDate));
      if (isNaN(end)) {
        res.status(400).send({
          message:
            "Invalid endDate. It must be a valid date format or a timestamp.",
        });
        return;
      }
    }

    if (end && start && end <= start) {
      res.status(400).send({
        message: "End date cannot be smaller than or equal to start date.",
      });
      return;
    }

    if (titlesQuery) {
      const titlesArray = titlesQuery.split(",");
      const titleQueries = titlesArray.map((title) => ({
        title: { $regex: title, $options: "i" },
      }));
      query.$or = titleQueries;
    }

    if (categoriesQuery) {
      const category = await Categories.findOne({ name: categoriesQuery });

      if (!category) {
        res.status(400).send({ message: "Invalid category name." });
        return;
      }
      query.categories = category._id;
    }

    if (startDate && endDate) {
      query.createdAt = { $gte: start, $lt: end };
    } else if (startDate) {
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      query.createdAt = { $gte: start, $lt: end };
    }

    switch (status) {
      case "全部":
        query.status = { $in: ["草稿", "已排程", "已發布"] };
        break;
      case "草稿":
        query.status = "草稿";
        break;
      case "已排程":
        query.status = "已排程";
        break;
      case "隱藏文章":
        query.status = "隱藏文章";
        break;
      case "已發布":
        query.status = "已發布";
        break;
    }

    let editorsQueryEditor;
    let editorsQueryDraftEditor;

    if (status === "全部") {
      editorsQueryEditor = Editor.find({
        ...query,
        status: { $in: ["已排程", "已發布"] },
      })
        .populate({ path: "categories", select: "name" })
        .populate({ path: "tags", select: "name" })
        // .sort({ serialNumber: -1 })
        .select("-content -htmlContent");

      editorsQueryDraftEditor = draftEditor
        .find(query)
        .populate({ path: "categories", select: "name" })
        .populate({ path: "tags", select: "name" })
        // .sort({ updatedAt: -1 })
        .select("-content -htmlContent");
    } else if (status === "草稿") {
      editorsQueryDraftEditor = draftEditor
        .find(query)
        .populate({ path: "categories", select: "name" })
        .populate({ path: "tags", select: "name" })
        // .sort({ updatedAt: -1 })
        .select("-content -htmlContent");
    } else {
      editorsQueryEditor = Editor.find(query)
        .populate({ path: "categories", select: "name" })
        .populate({ path: "tags", select: "name" })
        // .sort({ updatedAt: -1 })
        .select("-content -htmlContent");
    }

    if (limit && limit > 0) {
      if (editorsQueryEditor) {
        editorsQueryEditor.skip(skip).limit(limit);
      }
      if (editorsQueryDraftEditor) {
        editorsQueryDraftEditor.skip(skip).limit(limit);
      }
    }

    let editors = [];
    if (editorsQueryEditor) {
      editors = editors.concat(await editorsQueryEditor);
    }
    if (editorsQueryDraftEditor) {
      editors = editors.concat(await editorsQueryDraftEditor);
    }

    let totalDocs = 0;
    if (status === "全部") {
      totalDocs += await Editor.countDocuments({
        ...query,
        status: { $in: ["已排程", "已發布"] },
      }).exec();
      totalDocs += await draftEditor.countDocuments(query).exec();
    } else if (status === "草稿") {
      totalDocs += await draftEditor.countDocuments(query).exec();
    } else {
      totalDocs += await Editor.countDocuments(query).exec();
    }

    const updateEditor = await Promise.all(
      editors.map(async (editor) => {
        const tagIds = editor.tags ? editor.tags.map((tag) => tag._id) : [];
        //JP站沒有分類
        const categoryID = editor.categories ? editor.categories._id : null;

        const [categorySitemap, tagSitemaps] = await Promise.all([
          categoryID
            ? Sitemap.findOne({ originalID: categoryID, type: "category" })
            : null,
          Sitemap.find({ originalID: { $in: tagIds }, type: "tag" }),
        ]);

        const tagSitemapMap = new Map(
          tagSitemaps.map((sitemap) => [
            sitemap.originalID.toString(),
            sitemap.url,
          ])
        );

        editor = editor.toObject();

        if (categorySitemap) {
          editor.categories = {
            ...editor.categories,
            sitemapUrl: categorySitemap.url,
          };
        }

        editor.tags = editor.tags
          ? editor.tags.map((tag) => ({
              ...tag,
              sitemapUrl: tagSitemapMap.get(tag._id.toString()),
            }))
          : [];

        const editorSitemap = await Sitemap.findOne({
          originalID: editor._id,
          type: "editor",
        });

        if (editorSitemap) {
          editor.sitemapUrl = editorSitemap.url;
        }

        return editor;
      })
    );

    const result = {
      data: updateEditor,
      totalCount: totalDocs,
      totalPages: limit > 0 ? Math.ceil(totalDocs / limit) : 1,
      limit: limit,
      currentPage: pageNumber,
    };

    setCache(cacheKey, result, 60 * 60 * 12);
    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

editorRouter.get(
  "/editor/adjacentArticle/:id",
  verifyUser,
  async (req, res) => {
    const id = req.params.id;
    try {
      const currentEditor = await Editor.findOne({ _id: id }).select(
        "serialNumber"
      );
      if (!currentEditor) {
        return res.status(404).send({ message: "Editor not found." });
      }

      const minSerialNumber = await Editor.findOne({ hidden: false })
        .sort({ serialNumber: 1 })
        .select("serialNumber");
      const maxSerialNumber = await Editor.findOne({ hidden: false })
        .sort({ serialNumber: -1 })
        .select("serialNumber");

      let previousEditor = null;
      let nextEditor = null;

      for (
        let i = currentEditor.serialNumber - 1;
        i >= minSerialNumber.serialNumber;
        i--
      ) {
        previousEditor = await Editor.findOne({
          serialNumber: i,
          hidden: false,
        }).select("title");

        if (previousEditor) {
          const sitemapUrl = await Sitemap.findOne({
            originalID: previousEditor._id,
            type: "editor",
          });
          if (sitemapUrl) {
            previousEditor = previousEditor.toObject();
            previousEditor.sitemapUrl = sitemapUrl.url;
          }
          break;
        }
      }

      for (
        let i = currentEditor.serialNumber + 1;
        i <= maxSerialNumber.serialNumber;
        i++
      ) {
        nextEditor = await Editor.findOne({
          serialNumber: i,
          hidden: false,
        }).select("title");
        if (nextEditor) {
          const sitemapUrl = await Sitemap.findOne({
            originalID: nextEditor._id,
            type: "editor",
          });
          if (sitemapUrl) {
            nextEditor = nextEditor.toObject();
            nextEditor.sitemapUrl = sitemapUrl.url;
          }
          break;
        }
      }

      res.status(200).json({
        previousEditor: previousEditor,
        nextEditor: nextEditor,
      });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

editorRouter.get("/editor/frontEnd/popular", verifyUser, async (req, res) => {
  try {
    const PopularEditors = await getNewPopularEditors();
    const totalDocs = PopularEditors.length;

    const result = {
      data: PopularEditors,
      totalCount: totalDocs,
    };

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//列出後台熱門文章
editorRouter.get("/editor/popular", verifyUser, async (req, res) => {
  try {
    const PopularEditors = await getNewPopularEditors();
    const totalDocs = PopularEditors.length;

    const result = {
      data: PopularEditors,
      totalCount: totalDocs,
    };

    return res.status(200).json(result);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

//後台搜尋非熱門文章
editorRouter.get(
  "/editor/searchUnpopular",
  verifyUser,
  parseQuery,
  async (req, res) => {
    try {
      // 1. Get top 5 pageVies data
      const name = req.query.name;
      const { pageNumber, limit } = req;
      const skip = pageNumber ? (pageNumber - 1) * limit : 0;

      const { editors: nonPopularEditors, totalCount: totalDocs } =
        await getNewUnpopularEditors(skip, limit, name);

      const result = {
        data: nonPopularEditors,
        totalCount: totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        limit: limit,
        currentPage: pageNumber,
      };

      res.status(200).send(result);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

editorRouter.get("/editor/frontEnd/recommend", verifyUser, async (req, res) => {
  try {
    const recommendList = await Editor.find({
      recommendSorting: { $ne: null },
      status: "已發布",
    })
      .limit(8)
      .select(
        "serialNumber title htmlContent publishedAt recommendSorting homeImagePath"
      )
      .sort({ recommendSorting: 1 });

    const updateData = await Promise.all(
      recommendList.map(async (editor) => {
        const sitemapUrl = await Sitemap.findOne({
          originalID: editor._id,
          type: "editor",
        });
        const editorObj = editor.toObject();
        if (sitemapUrl) {
          editorObj.sitemapUrl = sitemapUrl.url; // add url property
        }
        if (editor.htmlContent) {
          editorObj.htmlContent = extractFirstParagraph(editor.htmlContent);
        }
        return editorObj;
      })
    );
    const result = {
      data: updateData,
      totalCount: updateData.length,
    };

    res.status(200).json(result);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});
//後台列出推薦文章
editorRouter.get(
  "/editor/recommend",
  verifyUser,
  parseQuery,
  async (req, res) => {
    const { pageNumber, limit } = req;
    const skip = pageNumber ? (pageNumber - 1) * limit : 0;
    let query = {
      status: "已發布",
      recommendSorting: { $ne: null },
    };

    try {
      const items = await Editor.find(query)
        .sort({ recommendSorting: 1, publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "_id serialNumber title createdAt publishedAt recommendSorting "
        )
        .exec();

      const totalDocs = await Editor.countDocuments(query).exec();
      const result = {
        data: items,
        totalCount: totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        limit: limit,
        currentPage: pageNumber,
      };

      res.status(200).json(result);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

//後台搜尋非推薦文章
editorRouter.get(
  "/editor/searchUnrecommend",
  verifyUser,
  parseQuery,
  async (req, res) => {
    try {
      let name = req.query.name;
      const { pageNumber, limit } = req;
      const skip = pageNumber ? (pageNumber - 1) * limit : 0;

      if (name === undefined) {
        name = "";
      }

      const aggregation = await Editor.aggregate([
        {
          $match: {
            status: "已發布",
            recommendSorting: null,
            title: { $regex: name, $options: "i" },
          },
        },
        {
          $sort: { publishedAt: -1 },
        },
        {
          $facet: {
            findUnrecommendEditors: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  serialNumber: 1,
                  title: 1,
                  createdAt: 1,
                  publishedAt: 1,
                  recommendSorting: 1,
                },
              },
            ],
            totalCount: [{ $count: "count" }],
          },
        },
      ]);

      const findUnrecommendEditors = aggregation[0].findUnrecommendEditors;
      const totalDocs =
        aggregation[0].totalCount.length > 0
          ? aggregation[0].totalCount[0].count
          : 0;

      const result = {
        data: findUnrecommendEditors,
        totalCount: totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        limit: limit,
        currentPage: pageNumber,
      };

      res.status(200).send(result);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

editorRouter.get(
  "/editor/frontEnd/topAndNews",
  verifyUser,
  async (req, res) => {
    try {
      const topSortingData = await Editor.find({
        topSorting: { $ne: null },
        status: "已發布",
      })
        .sort({ topSorting: 1 })
        .limit(2)
        .select(
          "serialNumber title htmlContent publishedAt topSorting homeImagePath"
        )
        .exec();

      // 2. publishedAt資料依照時間新到舊排列，取前四筆
      const publishedAtData = await Editor.find({
        status: "已發布",
        publishedAt: { $ne: null },
      })
        .sort({ publishedAt: -1 })
        .limit(6)
        .select("serialNumber title htmlContent publishedAt homeImagePath")
        .exec();

      // 3. 將這兩個條件的資料併為一個搜尋結果回傳
      const mergedData = [...topSortingData];
      let addedCount = 0;

      for (const item of publishedAtData) {
        if (!mergedData.some((e) => e._id.equals(item._id))) {
          mergedData.push(item);
          addedCount++;
        }
        if (addedCount >= 4) break;
      }

      const updateData = await Promise.all(
        mergedData.map(async (editor) => {
          const sitemapUrl = await Sitemap.findOne({
            originalID: editor._id,
            type: "editor",
          });
          const editorObj = editor.toObject();
          if (sitemapUrl) {
            editorObj.sitemapUrl = sitemapUrl.url; // add url property
          }
          if (editor.htmlContent) {
            editorObj.htmlContent = extractFirstParagraph(editor.htmlContent);
          }
          return editorObj;
        })
      );
      const result = {
        data: updateData,
        totalCount: updateData.length,
      };

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

//後台列出置頂與最新文章
editorRouter.get(
  "/editor/topAndNews",
  verifyUser,
  parseQuery,
  async (req, res) => {
    const { pageNumber, limit } = req;
    const skip = pageNumber ? (pageNumber - 1) * limit : 0;
    let query = { status: "已發布", topSorting: { $ne: null } };

    try {
      const items = await Editor.find(query)
        .sort({ topSorting: 1, publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("_id serialNumber title createdAt publishedAt topSorting ")
        .exec();

      const totalDocs = await Editor.countDocuments(query).exec();

      const result = {
        data: items,
        totalCount: totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        limit: limit,
        currentPage: pageNumber,
      };

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

//後台搜尋非置頂文章
editorRouter.get(
  "/editor/searchUntop",
  verifyUser,
  parseQuery,
  async (req, res) => {
    try {
      let name = req.query.name;
      const { pageNumber, limit } = req;
      const skip = pageNumber ? (pageNumber - 1) * limit : 0;
      if (name === undefined) {
        name = "";
      }

      const aggregation = await Editor.aggregate([
        {
          $match: {
            status: "已發布",
            topSorting: null,
            title: { $regex: name, $options: "i" },
          },
        },
        {
          $sort: { publishedAt: -1 },
        },
        {
          $facet: {
            findUntopEditors: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  serialNumber: 1,
                  title: 1,
                  createdAt: 1,
                  publishedAt: 1,
                  topSorting: 1,
                },
              },
            ],
            totalCount: [{ $count: "count" }],
          },
        },
      ]);

      const findUntopEditors = aggregation[0].findUntopEditors;
      const totalDocs =
        aggregation[0].totalCount.length > 0
          ? aggregation[0].totalCount[0].count
          : 0;

      const result = {
        data: findUntopEditors,
        totalCount: totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        limit: limit,
        currentPage: pageNumber,
      };

      res.send(result);
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: err.message });
    }
  }
);
// 後台編輯文章用 *get only title & _id field
editorRouter.get("/editor/title", verifyUser, async (req, res) => {
  try {
    const editor = await Editor.find().select("title updatedAt");
    // .limit(10)
    res.send(editor);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

editorRouter.get(
  "/editor/relatedArticles/:id",
  verifyUser,
  async (req, res) => {
    try {
      const targetArticleId = req.params.id;
      const targetArticle = await Editor.findOne({
        _id: targetArticleId,
      }).select("tags");
      const targetTags = targetArticle.tags;

      const relatedArticles = await Editor.find({
        tags: { $in: targetTags },
        _id: { $ne: targetArticleId },
        statius: "已發布",
      })
        .select(
          "title tags publishedAt hidden homeImagePath categories altText"
        )
        .populate({ path: "tags", select: "name" });
      relatedArticles.forEach((article) => {
        let commonTagsCount = 0;
        article.tags.forEach((tag) => {
          if (targetTags.includes(tag._id.toString())) {
            commonTagsCount++;
          }
        });
        article._doc.commonTagsCount = commonTagsCount;
      });

      // Sort related articles by the number of common tags in descending order
      relatedArticles.sort((a, b) => {
        if (b._doc.commonTagsCount === a._doc.commonTagsCount) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        } else {
          return b._doc.commonTagsCount - a._doc.commonTagsCount;
        }
      });

      const topRelatedArticles = relatedArticles.slice(0, 6);

      const updateRelatedArticles = await Promise.all(
        topRelatedArticles.map(async (editor) => {
          const sitemapUrl = await Sitemap.findOne({
            originalID: editor._id,
            type: "editor",
          });
          if (sitemapUrl) {
            editor = editor.toObject(); // convert mongoose document to plain javascript object
            editor.sitemapUrl = sitemapUrl.url; // add url property
          }
          return editor;
        })
      );

      res.status(200).send({ data: updateRelatedArticles });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

// editorRouter.get(
//   "/editor/tag/:tag",
//   async (req, res, next) => {
//     const tag = req.params.tag;
//     console.log(tag);
//     try {
//       const editors = await Editor.find();

//       const editorsIncludesTag = editors.filter((editor) =>
//         editor.tags.includes(tag.toLowerCase())
//       );

//       res.editor = editorsIncludesTag;
//       next();
//     } catch (e) {
//       res.status(500).send({ message: e.message });
//     }
//   },
//   parseJSON,
//   async (req, res) => {
//     const { editor: editorList } = res;
//     try {
//       res.send(editorList);
//     } catch (e) {
//       res.status(500).send({ message: e.message });
//     }
//   }
// );
editorRouter.get(
  "/editor/:id",
  verifyUser,
  getEditor,
  async (req, res, next) => {
    try {
      const sitemapUrl = await Sitemap.findOne({
        originalID: res.editor._id,
        type: "editor",
      });
      if (sitemapUrl) {
        res.editor = res.editor.toObject(); // convert mongoose document to plain javascript object
        res.editor.sitemapUrl = sitemapUrl.url; // add url property
      }

      if (res.editor.categories) {
        const categoriesSitemap = await Sitemap.findOne({
          originalID: res.editor.categories._id,
          type: "category",
        });
        if (categoriesSitemap) {
          res.editor.categories.sitemapUrl = categoriesSitemap.url;
        }
      }

      if (res.editor.tags) {
        res.editor.tags = await Promise.all(
          res.editor.tags.map(async (tag) => {
            const tagsSitemap = await Sitemap.findOne({
              originalID: tag._id,
              type: "tag",
            });
            if (tagsSitemap) {
              tag = { ...tag, sitemapUrl: tagsSitemap.url };
            }
            return tag;
          })
        );
      }
      res.status(200).send(res.editor);
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

editorRouter.get("/tempEditor/:id", verifyUser, async (req, res, next) => {
  const id = req.params.id;

  let editor;
  try {
    editor = await tempEditor.findOne({ _id: id }).select(" -__v");
    if (editor === undefined) {
      return res.status(404).json({ message: "can't find editor!" });
    }
    res.status(200).send(editor);
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
});

editorRouter.get("/domainInfo", verifyUser, async (req, res, next) => {
  try {
    const result = { domain: "http://10.88.0.103:3000" };
    console.log("get domainInfo");
    res.status(200).send({ data: result });
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
});

//新增文章點擊率
editorRouter.patch(
  "/editor/incrementPageview/:id",
  getEditor,
  getIpInfo,
  async (req, res) => {
    try {
      const editorId = res.editor._id;
      const ip = res.clientIp;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existingIp = await Ips.findOne({
        sourceIp: ip,
        relatedId: editorId,
        createdAt: { $gte: oneHourAgo },
      });
      // If the IP has not made a request in the last hour, increment the page view and save the IP
      if (!existingIp) {
        // const article = await Editor.findOneAndUpdate(
        //   { _id: editorId },
        //   { $inc: { pageView: 1 }, $set: { updatedAt: article.updatedAt } },
        //   { new: true }
        // );
        const article = await Editor.findOne({ _id: editorId });
        await Editor.updateOne(
          { _id: editorId },
          { $inc: { pageView: 1 } },
          { timestamps: false }
        );
        await Tags.updateMany(
          { _id: { $in: article.tags } },
          { $inc: { pageView: 1 } }
        );

        const newIp = new Ips({
          sourceIp: ip,
          relatedId: editorId,
        });
        await newIp.save();
        await scanAndDelete();

        res.status(201).json({
          message: `Editor number:${article.serialNumber} page view count incremented`,
        });
      } else {
        res.status(200).json({
          message: `Editor number:${res.editor.serialNumber} page view count not incremented, IP has already made a request in the last hour`,
        });
      }
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);
//熱門文章復原按鈕
editorRouter.patch(
  "/editor/renewPopularEditors",
  verifyUser,
  async (req, res) => {
    try {
      const result = await Editor.updateMany(
        { popularSorting: { $ne: null } },
        { $set: { popularSorting: null } },
        { multi: true }
      );
      const log = new Log({
        httpMethod: "PATCH",
        path: req.path,
        type: "editor",
        userName: req.session.user,
        changes: [
          {
            field: "popularSorting",
            oldValue: "all manual setting value",
            newValue: null,
            changedAt: new Date(),
          },
        ],
      });
      await log.save();
      // 回傳更新筆數
      res.status(201).json({
        message: "Renew popular data successfully",
        totalUpdate: result.modifiedCount,
        matchedCount: result.matchedCount,
      });
    } catch (err) {
      // 如果發生錯誤，回傳錯誤訊息
      res.status(400).json({ message: err.message });
    }
  }
);

//熱門文章後台調整確認按鍵
editorRouter.patch(
  "/editor/popular/bunchModifiedByIds",
  verifyUser,
  async (req, res) => {
    const ids = req.body.ids;
    let updateCount = 0;
    let failedCount = 0;
    let result;

    try {
      for (const idObject of ids) {
        const id = Object.keys(idObject)[0];
        const popularSorting = idObject[id];
        if (popularSorting === -1) {
          result = await Editor.updateOne(
            { _id: id },
            { $set: { popularSorting: null } }
          );
        } else {
          result = await Editor.updateOne(
            { _id: id },
            { $set: { popularSorting } }
          );
        }

        if (result.matchedCount === 0) {
          failedCount++;
        }

        if (result.modifiedCount > 0) {
          updateCount++;
        }
      }
      res
        .status(201)
        .send({ updateCount: updateCount, failedCount: failedCount });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

editorRouter.patch(
  "/editor/recommend/bunchModifiedByIds",
  verifyUser,
  async (req, res) => {
    const ids = req.body.ids;
    let updateCount = 0;
    let failedCount = 0;
    let result;
    try {
      for (const idObject of ids) {
        const id = Object.keys(idObject)[0];
        const recommendSorting = idObject[id];

        if (recommendSorting === -1) {
          result = await Editor.updateOne(
            { _id: id },
            { $set: { recommendSorting: null } }
          );
        } else {
          result = await Editor.updateOne(
            { _id: id },
            { $set: { recommendSorting } }
          );
        }
        // if (result.matchedCount === 0) {
        //   res.status(404).send({ error: `找不到對應的id: ${id}` });
        //   return;
        // }
        if (result.matchedCount === 0) {
          failedCount++;
        }

        if (result.modifiedCount > 0) {
          updateCount++;
        }
      }
      res
        .status(201)
        .send({ updateCount: updateCount, failedCount: failedCount });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

//置頂文章後台調整確認按鍵
editorRouter.patch(
  "/editor/top/bunchModifiedByIds",
  verifyUser,
  async (req, res) => {
    const ids = req.body.ids;
    let updateCount = 0;
    let failedCount = 0;
    let result;

    try {
      for (const idObject of ids) {
        const id = Object.keys(idObject)[0];
        const topSorting = idObject[id];
        if (topSorting === -1) {
          result = await Editor.updateOne(
            { _id: id },
            { $set: { topSorting: null } }
          );
        } else {
          result = await Editor.updateOne(
            { _id: id },
            { $set: { topSorting } }
          );
        }
        // if (result.matchedCount === 0) {
        //   res.status(404).send({ error: `找不到對應的id: ${id}` });
        //   return;
        // }
        if (result.matchedCount === 0) {
          failedCount++;
        }

        if (result.modifiedCount > 0) {
          updateCount++;
        }
      }
      res
        .status(201)
        .send({ updateCount: updateCount, failedCount: failedCount });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  }
);

editorRouter.patch("/editor/checkScheduleEditors", async (req, res) => {
  //取得當前時間區間
  let now = new Date();
  let oneHourAgo = new Date();
  oneHourAgo.setTime(oneHourAgo.getTime() - 1 * 60 * 60 * 1000);
  try {
    //取得需要發布的名單
    const listEditor = await Editor.find({
      hidden: true,
      status: "已排程",
      scheduledAt: {
        $exists: true,
        $ne: null,
        $ne: "",
        $gte: oneHourAgo,
        $lte: now,
      },
    }).select("-content -htmlContent");
    let updateCount = 0;
    let updatedIds = [];
    for (let editor of listEditor) {
      editor.hidden = false;
      await editor.save();
      updateCount++;
      updatedIds.push(editor._id);
    }
    if (updateCount === 0) {
      res.status(200).send({
        message: "No scheduled article need to update status",
      });
    } else {
      await scanAndDelete();
      res.status(200).send({
        message: `Successfully updated the following ids: ${updatedIds.join(
          ", "
        )}`,
      });
    }
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

editorRouter.patch(
  "/editor/:id",
  verifyUser,
  uploadImage(),
  parseRequestBody,
  parseTags,
  parseHTML,
  parseCategories,
  getEditor,
  async (req, res) => {
    const {
      title,
      tags,
      content,
      htmlContent,
      categories,
      headTitle,
      headKeyword,
      headDescription,
      manualUrl,
      altText,
      hidden,
      scheduledAt,
      draft,
    } = res;
    const contentImagePath =
      req.files.contentImagePath && req.files.contentImagePath[0];
    const homeImagePath = req.files.homeImagePath && req.files.homeImagePath[0];

    const contentFilename = contentImagePath
      ? await processImage(contentImagePath, contentImagePath.originalname)
      : undefined;

    const homeFilename = homeImagePath
      ? await processImage(homeImagePath, homeImagePath.originalname)
      : undefined;

    if (contentFilename !== undefined) {
      if (homeImagePath) {
        res.editor.homeImagePath = homeFilename;
        if (contentFilename === "") {
          res.editor.contentImagePath = contentFilename;
        } else {
          const regex = /src="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"/;
          const match = contentFilename.match(regex);

          if (match && match[1]) {
            const youtubeUrl = match[1];
            console.log(youtubeUrl);
            res.editor.contentImagePath = youtubeUrl;
          }
        }
      } else {
        res.editor.homeImagePath = `${LOCAL_DOMAIN}home/saved_image/homepage/${contentFilename}`;
        res.editor.contentImagePath = `${LOCAL_DOMAIN}home/saved_image/content/${contentFilename}`;
      }
    }

    if (manualUrl !== undefined) {
      res.editor.manualUrl = manualUrl;
      await Sitemap.updateOne(
        { originalID: res.editor._id, type: "editor" },
        { $set: { url: `${domain}p_${manualUrl}.html` } }
      );
    }
    if (tags !== undefined) res.editor.tags = [...tags];
    if (categories !== undefined) res.editor.categories = categories;
    if (title !== undefined) res.editor.title = title;
    if (content !== undefined) res.editor.content = content;
    if (htmlContent !== undefined) res.editor.htmlContent = htmlContent;
    if (headTitle !== undefined) res.editor.headTitle = headTitle;
    if (headKeyword !== undefined) res.editor.headKeyword = headKeyword;
    if (headDescription !== undefined)
      res.editor.headDescription = headDescription;
    if (altText !== undefined) res.editor.altText = altText;
    if (hidden !== undefined) res.editor.hidden = hidden;
    if (scheduledAt !== undefined) res.editor.scheduledAt = scheduledAt;
    if (draft !== undefined) res.editor.draft = draft;

    try {
      await logChanges(
        req.method,
        req.path,
        res.editor,
        Editor,
        "editor",
        req.session.user,
        true
      );
      await res.editor.save();
      await scanAndDelete();
      res.status(201).send({ message: "Editor update successfully" });
    } catch (err) {
      res.status(400).send({ message: err.message });
    }
  }
);

editorRouter.post(
  "/editor",
  verifyUser,
  uploadImage(),
  parseRequestBody,
  parseHTML,
  parseTags,
  parseCategories,
  async (req, res) => {
    const {
      title,
      content,
      htmlContent,
      tags,
      categories,
      headTitle,
      headKeyword,
      headDescription,
      manualUrl,
      altText,
      topSorting,
      hidden,
      popularSorting,
      recommendSorting,
      scheduledAt,
      draft,
    } = res;

    const serialNumber = await getMaxSerialNumber();
    let contentImagePath =
      req.files.contentImagePath && req.files.contentImagePath[0];
    let homeImagePath = req.files.homeImagePath && req.files.homeImagePath[0];
    let message = "";
    if (title === null) {
      message += "title is required\n";
    }
    if (serialNumber === null) {
      message += "serialNumber is required\n";
    }
    if (content === "") {
      message += "content is required\n";
    }
    if (draft === true) {
      message +=
        "A draft article cannot be set to true as it contradicts the definition of a draft, which is an unpublished or unfinished piece of content. \n";
    }
    if (message) {
      res.status(400).send({ message });
    } else {
      try {
        const editorData = {
          serialNumber: serialNumber + 1,
          title,
          content,
          htmlContent,
          tags,
          categories, //: category ? category._id : null,
          headTitle,
          headKeyword,
          headDescription,
          manualUrl,
          altText,
          topSorting,
          hidden,
          popularSorting,
          recommendSorting,
          scheduledAt,
          draft,
        };

        if (contentImagePath === undefined && homeImagePath === undefined) {
          editorData.contentImagePath = null;
          editorData.homeImagePath = null;
        } else {
          const contentFilename = contentImagePath
            ? await processImage(
                contentImagePath,
                contentImagePath.originalname
              )
            : null;

          const homeFilename = homeImagePath
            ? await processImage(homeImagePath, homeImagePath.originalname)
            : null;
          if (homeImagePath && homeFilename.startsWith("http")) {
            editorData.homeImagePath = homeFilename;
            const regex = /src="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"/;
            const match = contentFilename.match(regex);

            if (match && match[1]) {
              const youtubeUrl = match[1];
              editorData.contentImagePath = youtubeUrl;
            }
          } else {
            editorData.homeImagePath = `${LOCAL_DOMAIN}home/saved_image/homepage/${contentFilename}`;
            editorData.contentImagePath = `${LOCAL_DOMAIN}home/saved_image/content/${contentFilename}`;
          }
        }
        const newEditor = new Editor(editorData);
        await newEditor.save();

        //save sitemap
        let newEditorSitemap;
        const newEditorOriginalUrl = `${domain}p_${newEditor._id}.html`;
        if (newEditor) {
          let sitemapUrl;
          if (newEditor.manualUrl) {
            sitemapUrl = `${domain}p_${newEditor.manualUrl}.html`;
          } else {
            sitemapUrl = newEditorOriginalUrl;
          }

          newEditorSitemap = new Sitemap({
            url: sitemapUrl,
            originalID: newEditor._id,
            type: "editor",
          });
          await newEditorSitemap.save();
        }
        await Editor.updateOne(
          { _id: newEditor.id },
          { $set: { originalUrl: newEditorOriginalUrl } }
        );
        const updateEditor = await Editor.findOne({ _id: newEditor.id })
          .populate({ path: "categories", select: "name" })
          .populate({ path: "tags", select: "name" });

        await logChanges(
          req.method,
          req.path,
          newEditor,
          Editor,
          "editor",
          req.session.user
        );
        await scanAndDelete();
        res.status(201).json({
          ...updateEditor._doc, // Spread operator to include all properties of newEditor
          sitemapUrl: newEditorSitemap.url,
        });
      } catch (err) {
        res.status(400).json({ message: err.message });
      }
    }
  }
);

editorRouter.post(
  "/tempEditor",
  // verifyUser,
  uploadImage(),
  parseRequestBody,
  parseHTML,
  // parseTags,
  // parseCategories,
  async (req, res) => {
    const {
      title,
      content,
      htmlContent,
      headTitle,
      headKeyword,
      headDescription,
      manualUrl,
      altText,
      hidden,
    } = res;
    //req.body.tags:[{ value: '64c37d9d286fc35bc1479603', label: 'tesast' },{ value: '646b3d482882d5ee14d82be9', label: '宣傳' },{ value: '646b3cdf2882d5ee14d82bb7', label: '口碑行銷' },{ value: '646b2faa0345bd9dae0f3ac5', label: '數位' }]
    const tagsArray = req.body.tags ? JSON.parse(req.body.tags) : undefined;
    const tags = Array.isArray(tagsArray)
      ? tagsArray.map((tag) => ({ name: tag.name }))
      : undefined;
    const categoriesArray = req.body.categories
      ? JSON.parse(req.body.categories)
      : undefined;
    const categories = Array.isArray(categoriesArray)
      ? categoriesArray.map((category) => ({ name: category.name }))
      : undefined;

    const contentImagePath =
      req.files.contentImagePath && req.files.contentImagePath[0];
    const homeImagePath = req.files.homeImagePath && req.files.homeImagePath[0];
    try {
      const editorData = {
        title,
        content,
        htmlContent,
        tags,
        categories,
        headTitle,
        headKeyword,
        headDescription,
        manualUrl,
        altText,
        hidden,
      };

      if (contentImagePath === undefined && homeImagePath === undefined) {
        editorData.contentImagePath = null;
        editorData.homeImagePath = null;
      } else {
        const contentFilename = contentImagePath
          ? await processImage(contentImagePath, contentImagePath.originalname)
          : null;

        const homeFilename = homeImagePath
          ? await processImage(homeImagePath, homeImagePath.originalname)
          : null;
        if (homeImagePath && homeFilename.startsWith("http")) {
          editorData.homeImagePath = homeFilename;
          const regex = /src="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"/;
          const match = contentFilename.match(regex);

          if (match && match[1]) {
            const youtubeUrl = match[1];
            editorData.contentImagePath = youtubeUrl;
          }
        } else {
          // const newHomeUrl = copyFileAndGenerateNewUrl(homeFilename);
          // const newContentUrl = copyFileAndGenerateNewUrl(contentFilename);
          editorData.contentImagePath = `${LOCAL_DOMAIN}home/saved_image/content/${contentFilename}`;
          // editorData.homeImagePath = newHomeUrl;
          // editorData.contentImagePath = newContentUrl;
        }
      }

      const newTempEditor = new tempEditor(editorData);
      await newTempEditor.save();

      await newTempEditor.updateOne(
        { _id: newTempEditor._id },
        {
          $set: {
            originalUrl: `${domain}preview_${newTempEditor._id}`,
          },
        }
      );

      res.status(201).send({
        data: {
          id: newTempEditor._id,
          originalUrl: newTempEditor.originalUrl,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

editorRouter.delete(
  "/editor/bunchDeleteByIds",
  verifyUser,
  async (req, res) => {
    try {
      const ids = req.body.ids;
      // console.log(req.body.ids);
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Invalid data." });
      }

      const existingEditors = await Editor.find({ _id: { $in: ids } });

      if (existingEditors.length !== ids.length) {
        return res
          .status(400)
          .json({ message: "Some of the provided Editor IDs do not exist." });
      }
      await logChanges(
        req.method,
        req.path,
        existingEditors,
        Editor,
        "editor",
        req.session.user,
        true
      );

      const deleteSitemap = await Sitemap.deleteMany({
        originalID: { $in: ids },
        type: "editor",
      });
      const deleteEditor = await Editor.deleteMany({ _id: { $in: ids } });
      if (deleteEditor.deletedCount === 0) {
        return res.status(404).json({ message: "No matching editor found" });
      }
      if (deleteEditor.deletedCount !== deleteSitemap.deletedCount) {
        return res.status(404).json({ message: "No matching sitemap found" });
      }
      await scanAndDelete();
      res.status(200).json({ message: "Delete editor successful!" });
    } catch (e) {
      res.status(500).send({ message: e.message });
    }
  }
);

editorRouter.delete("/tempEditor", verifyUser, async (req, res) => {
  try {
    const deleteList = await tempEditor
      .find()
      .select("-_id contentImagePath homeImagePath");

    for (let doc of deleteList) {
      // if (doc.contentImagePath.startsWith("<iframe")) {
      //   //Do nothing
      // } else {
      // Delete contentImagePath
      if (!doc.homeImagePath && doc.contentImagePath) {
        let contentImagePath = url.parse(doc.contentImagePath).path;

        fs.unlink(contentImagePath, (err) => {
          if (err) {
            console.log(
              `Error remove file ${contentImagePath}: ${err.message}`
            );
          } else {
            console.log(`File ${doc.contentImagePath} was deleted`);
          }
        });
      }
    }
    await tempEditor.deleteMany({});
    res.status(200).send("Files were deleted successfully");
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

editorRouter.delete("/editor/cleanupIps", async (req, res) => {
  try {
    // Get the current time minus one hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oldLogs = await Ips.find({ createdAt: { $lt: oneHourAgo } }).select(
      "-_id sourceIp relatedId createdAt"
    );
    if (oldLogs.length === 0) {
      res.json({ message: "No data need to write" });
    } else if (oldLogs.length > 0) {
      // Write logs to a file
      const filePath = path.join(DBLOG_FILE_PATH, "ipLogs_jp.json");
      fs.appendFileSync(filePath, JSON.stringify(oldLogs, null, 2));

      // Find and remove all IPs that were created more than one hour ago
      await Ips.deleteMany({
        createdAt: { $lt: oneHourAgo },
      });

      // Return the result of the operation
      res.status(200).json({
        message: `Deleted ${oldLogs.length} IP(s) that were created more than one hour ago.`,
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = editorRouter;
