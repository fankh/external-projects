/**
 * UUID mock for Jest (replaces ESM uuid v14)
 * Uses Node.js built-in crypto.randomUUID for v4 generation
 */

const { randomUUID } = require('crypto');

module.exports = {
  v4: randomUUID
};
