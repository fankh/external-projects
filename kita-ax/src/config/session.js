const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Session configuration base
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'kyra_dev_secret_staging_key_change_in_production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600000, // 1 hour
    domain: process.env.COOKIE_DOMAIN || undefined
  },
  name: 'sessionId'
};

// Setup Redis if available (non-blocking initialization)
if (process.env.NODE_ENV === 'production' || (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost')) {
  (async () => {
    try {
      const redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          reconnectStrategy: (retries) => Math.min(retries * 50, 500)
        },
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        legacyMode: false
      });

      redisClient.on('error', (err) => {
        console.warn('⚠️ Redis runtime error:', err.message);
      });

      await redisClient.connect();
      console.log('✅ Redis connected for session store');
      sessionConfig.store = new RedisStore({ client: redisClient });
    } catch (err) {
      console.warn('⚠️ Redis store initialization failed, using memory store:', err.message);
    }
  })();
}

// Create and export the session middleware with configured store
module.exports = session(sessionConfig);
