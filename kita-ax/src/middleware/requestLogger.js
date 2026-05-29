const LoggingService = require('../services/loggingService');

function requestLoggerMiddleware(req, res, next) {
  const startTime = Date.now();

  LoggingService.logApiRequest(req);

  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function (data) {
    const duration = Date.now() - startTime;
    LoggingService.logApiResponse(req, res, duration, { bodySize: JSON.stringify(data).length });
    return originalJson.call(this, data);
  };

  res.send = function (data) {
    const duration = Date.now() - startTime;
    const bodySize = typeof data === 'string' ? data.length : 0;
    LoggingService.logApiResponse(req, res, duration, { bodySize });
    return originalSend.call(this, data);
  };

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (!res.headersSent) {
      LoggingService.logApiResponse(req, res, duration);
    }
  });

  next();
}

module.exports = requestLoggerMiddleware;
