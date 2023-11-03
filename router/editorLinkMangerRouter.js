const express = require("express");
const EditorLink = require("../model/editorLink");
const Editor = require("../model/editor");
const logChanges = require("../logChanges.js");
const verifyUser = require("../verifyUser");
const axios = require("axios");
const ping = require("ping");

const editorLinkMangerRouter = new express.Router();

function extractHrefFromContent(content) {
  const hrefs = [];
  content.forEach((item) => {
    if (item.children) {
      item.children.forEach((child) => {
        if (child.type === "link" && child.url) {
          hrefs.push(child.url);
        }
      });
    }
    if (item.href) {
      hrefs.push(item.href);
    }
  });
  return hrefs;
}

function extractHrefFromHtml(htmlContent) {
  const regex = /href=["']([^"']*)["']/g;
  const hrefs = [];
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

editorLinkMangerRouter.get("/editorLink", verifyUser, async (req, res) => {
  try {
    const editorLinkList = await EditorLink.find({}).select("-__v");
    res.status(200).json({ data: editorLinkList });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

editorLinkMangerRouter.get("/editorLink/getUrlEditor/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const targetUrl = await EditorLink.findOne({ _id: id });
    const findEditor = await Editor.find({
      $or: [
        { "content.children.url": targetUrl.url },
        { "content.href": targetUrl.url },
        {
          htmlContent: new RegExp(`href=["']${targetUrl.url}["']`, "g"),
        },
      ],
    }).select("_id title");
    res.status(200).json({ data: findEditor });
  } catch (error) {
    console.log(error.message);
  }
});

editorLinkMangerRouter.post(
  "/editorLink/getAndPost",
  verifyUser,
  async (req, res) => {
    try {
      const currentLinkList = await EditorLink.find({}, "url");
      const currentLinkSet = new Set(currentLinkList.map((link) => link.url));

      const editorDataList = await Editor.find({}, "content htmlContent");
      const allUrlsSet = new Set();
      editorDataList.forEach((editorData) => {
        const hrefsFromContent = extractHrefFromContent(editorData.content);
        const hrefsFromHtml = extractHrefFromHtml(editorData.htmlContent);
        hrefsFromContent.forEach((url) => allUrlsSet.add(url));
        hrefsFromHtml.forEach((url) => allUrlsSet.add(url));
      });
      const newUrls = Array.from(allUrlsSet).filter(
        (url) => !currentLinkSet.has(url)
      );
      await EditorLink.insertMany(newUrls.map((url) => ({ url })));

      const newLinkList = await EditorLink.find().select("-__v");
      res.status(200).json({ data: newLinkList });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);

editorLinkMangerRouter.post(
  "/editorLink/checkLink",
  verifyUser,
  async (req, res) => {
    const ids = req.body.ids;

    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: "Invalid input" });
    }
    const urls = await EditorLink.find({ _id: { $in: ids } }).select("_id url");
    const urlPromises = urls.map(async (urlObj) => {
      try {
        const response = await axios.head(urlObj.url, { timeout: 5000 });
        const hostname = new URL(urlObj.url).hostname;
        const alive = await ping.promise.probe(hostname);
        let updateObj;
        if (response.status >= 200 && response.status < 300) {
          updateObj = {
            pingStatus: alive.alive ? "isAlive" : "isDead",
            checkStatusUpdatedAt: new Date(),
            axiosStatusCode: response.status,
            axiosMessage: response.statusText,
          };
        } else {
          updateObj = {
            pingStatus: alive.alive ? "isAlive" : "isDead",
            checkStatusUpdatedAt: new Date(),
            axiosStatusCode: response.status,
            axiosMessage: response.statusText,
          };
        }

        const statusResult = await EditorLink.findByIdAndUpdate(
          urlObj._id,
          updateObj,
          {
            new: true,
          }
        );
        return statusResult;
      } catch (error) {
        const hostname = new URL(urlObj.url).hostname;
        const alive = await ping.promise.probe(hostname);
        const statusResult = await EditorLink.findByIdAndUpdate(
          urlObj._id,
          {
            pingStatus: alive.alive ? "isAlive" : "isDead",
            checkStatusUpdatedAt: new Date(),
            axiosStatusCode:
              error && error.response ? error.response.status : null,
            axiosMessage: error.message,
          },
          { new: true }
        );
        return statusResult;
      }
    });
    try {
      const results = await Promise.all(urlPromises);
      results.forEach((result) => {
        delete result._doc.__v;
      });
      await logChanges(
        req.method,
        req.path,
        results,
        EditorLink,
        "editorLink",
        req.session.user
      );

      res.status(200).json({ results });
    } catch (error) {
      res.status(500).json({
        // error: "An error occurred while return URLs.",
        message: error.message,
      });
    }
  }
);

editorLinkMangerRouter.patch(
  "/editorLink/updateLink/:id",
  verifyUser,
  async (req, res) => {
    const id = req.params.id;
    const newUrl = req.body.newUrl;
    if (!newUrl) {
      return res.status(404).json({ error: "Need newUrl" });
    }
    try {
      const originalTargetLink = await EditorLink.findOne({ _id: id });

      if (!originalTargetLink) {
        return res.status(404).json({ error: "Link not found" });
      }
      if (newUrl === originalTargetLink.url) {
        return res.status(404).json({
          error:
            "Link name is the same as the original name with no modifications.",
        });
      }
      const editorsToUpdate = await Editor.find({
        $or: [
          { "content.children.url": originalTargetLink.url },
          { "content.href": originalTargetLink.url },
          {
            htmlContent: new RegExp(
              `href=["']${originalTargetLink.url}["']`,
              "g"
            ),
          },
        ],
      });

      for (let editor of editorsToUpdate) {
        // Update in 'content'
        editor.content.forEach((item) => {
          if (item.children) {
            item.children.forEach((child) => {
              if (
                child.type === "link" &&
                child.url === originalTargetLink.url
              ) {
                child.url = newUrl;
              }
            });
          }
          if (item.href === originalTargetLink.url) {
            item.href = newUrl;
          }
        });
        // Update in 'htmlContent'
        editor.htmlContent = editor.htmlContent.replace(
          new RegExp(`href=["']${originalTargetLink.url}["']`, "g"),
          `href="${newUrl}"`
        );

        // Save the updated Editor document
        editor.markModified("content");
        await editor.save();
      }
      const newData = await EditorLink.insertMany([{ url: newUrl }]);
      await EditorLink.deleteOne({ _id: id });
      await logChanges(
        req.method,
        req.path,
        newData,
        EditorLink,
        "editorLink",
        req.session.user,
        true
      );

      res.status(201).json({
        data: newData,
        message: "URL updated successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);

module.exports = editorLinkMangerRouter;
