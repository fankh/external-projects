const LoggingService = require('../services/loggingService');

function performanceLoggerMiddleware(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationNs = endTime - startTime;
    const durationMs = Number(durationNs) / 1000000;

    const performanceData = {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${durationMs.toFixed(2)}ms`,
      memory: process.memoryUsage(),
    };

    if (durationMs > 1000) {
      LoggingService.warn('Slow request detected', performanceData);
    } else if (process.env.LOG_LEVEL === 'debug') {
      LoggingService.debug('Request completed', performanceData);
    }
  });

  next();
}

module.exports = performanceLoggerMiddleware;
