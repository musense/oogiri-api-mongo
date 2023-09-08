// redisCache.js
const redis = require("redis");
const client = redis.createClient({ host: "127.0.0.1", port: 6379 });

client.on("error", (error) => {
  console.error(error);
});

async function connect() {
  if (client.status !== "connecting" && client.status !== "ready") {
    await client.connect();
  }
}
connect();

const setCache = async (key, value, expired) => {
  await client.set(key, JSON.stringify(value), { EX: expired });
};

const getCache = async (key) => {
  const result = await client.get(key);
  return result ? JSON.parse(result) : null;
};

const clearCache = async (key) => {
  await client.del(key);
};

const updateCache = async (key, value) => {
  await client.set(key, JSON.stringify(value), { EX: 1800 }); // Update value with 30 minutes expiration
};

module.exports = {
  setCache,
  getCache,
  clearCache,
  updateCache,
};
