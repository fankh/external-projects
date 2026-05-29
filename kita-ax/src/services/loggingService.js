const logger = require('../config/logger');

class LoggingService {
  static createContextLog(correlationId, userId = null, tenantId = null) {
    return {
      correlationId,
      userId,
      tenantId,
      timestamp: new Date().toISOString(),
    };
  }

  static info(message, context = {}) {
    logger.info(message, { ...context, timestamp: new Date().toISOString() });
  }

  static warn(message, context = {}) {
    logger.warn(message, { ...context, timestamp: new Date().toISOString() });
  }

  static error(message, error = null, context = {}) {
    const errorContext = {
      ...context,
      timestamp: new Date().toISOString(),
    };

    if (error instanceof Error) {
      errorContext.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    } else if (error) {
      errorContext.error = error;
    }

    logger.error(message, errorContext);
  }

  static debug(message, context = {}) {
    logger.debug(message, { ...context, timestamp: new Date().toISOString() });
  }

  static http(message, context = {}) {
    logger.log('http', message, { ...context, timestamp: new Date().toISOString() });
  }

  static logApiRequest(req, context = {}) {
    const logData = {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || null,
      ...context,
    };

    this.http(`${req.method} ${req.path}`, logData);
  }

  static logApiResponse(req, res, duration, context = {}) {
    const logData = {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || null,
      ...context,
    };

    const level = res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(level, `${req.method} ${req.path} ${res.statusCode}`, logData);
  }

  static logDatabaseQuery(query, duration, context = {}) {
    const logData = {
      duration: `${duration}ms`,
      ...context,
    };

    if (process.env.LOG_LEVEL === 'debug') {
      this.debug(`Database query executed`, { query: query.substring(0, 200), ...logData });
    }
  }

  static logServiceCall(serviceName, methodName, duration, context = {}) {
    const logData = {
      service: serviceName,
      method: methodName,
      duration: `${duration}ms`,
      ...context,
    };

    if (process.env.LOG_LEVEL === 'debug') {
      this.debug(`Service call completed`, logData);
    }
  }

  static logSecurityEvent(eventType, context = {}) {
    const logData = {
      eventType,
      timestamp: new Date().toISOString(),
      ...context,
    };

    this.warn(`Security event: ${eventType}`, logData);
  }

  static logAuthEvent(eventType, userId, context = {}) {
    const logData = {
      eventType,
      userId,
      timestamp: new Date().toISOString(),
      ...context,
    };

    this.info(`Authentication event: ${eventType}`, logData);
  }
}

module.exports = LoggingService;
