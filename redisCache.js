// redisCache.js
const redis = require("redis");
// const client = redis.createClient({ host: "127.0.0.1", port: 6379 });
const client = redis.createClient({ host: "redis", port: 6379 });

client.on("error", (error) => {
  console.error(error);
});

async function connect() {
  await client.connect();
}
connect();

const setCache = async (key, value, expired) => {
  await client.set(key, JSON.stringify(value), { EX: expired, NX: true });
};

const getCache = async (key) => {
  const result = await client.get(key);
  return result ? JSON.parse(result) : null;
};

const hSetCache = async (key, value, expired) => {
  await client.HSET(key, JSON.stringify(value));
};

const scanAndDelete = async () => {
  let cursor = "0";
  try {
    const scanReply = await client.sendCommand([
      "SCAN",
      cursor,
      "MATCH",
      "editorList:limit:10000*",
      "COUNT",
      "100",
    ]);
    cursor = scanReply[0];
    const keys = scanReply[1];

    if (keys.length > 0) {
      const delReply = await client.sendCommand(["DEL", ...keys]);
      console.log(`Deleted ${delReply} keys.`);
    }

    if (cursor !== "0") {
      scanAndDelete();
    }
  } catch (err) {
    console.log(err);
  }
};

module.exports = {
  setCache,
  getCache,
  scanAndDelete,
};
