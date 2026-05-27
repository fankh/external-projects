const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'dev-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
    domain: process.env.COOKIE_DOMAIN || 'localhost'
  },
  name: 'sessionId'
};

// Create Redis client and store if configured
if (process.env.NODE_ENV === 'production' || (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost')) {
  const redisClient = createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
    legacyMode: false,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500)
    }
  });

  redisClient.connect().catch(err => {
    console.warn('Redis connection failed, using memory store:', err.message);
  });

  sessionConfig.store = new RedisStore({ client: redisClient });
}

module.exports = session(sessionConfig);
