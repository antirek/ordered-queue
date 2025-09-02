const Redis = require('ioredis');
require('dotenv').config();

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
};

const connection = new Redis(redisConfig);

connection.on('error', (err) => {
  console.error('Redis connection error:', err);
});

connection.on('connect', () => {
  console.log('Connected to Redis');
});

module.exports = connection;
