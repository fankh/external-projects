const { Sentry, sentry } = require('../config/sentry');
const LoggingService = require('./loggingService');

class ErrorTrackingService {
  static captureException(error, context = {}) {
    if (!sentry) {
      LoggingService.error('Error occurred', error, context);
      return null;
    }

    Sentry.captureException(error, {
      contexts: {
        custom: context,
      },
      tags: {
        handled: 'true',
      },
    });

    LoggingService.error('Error captured by Sentry', error, context);
  }

  static captureMessage(message, level = 'info', context = {}) {
    if (!sentry) {
      LoggingService[level](message, context);
      return null;
    }

    Sentry.captureMessage(message, level);
    LoggingService[level](message, context);
  }

  static setUser(userId, userData = {}) {
    if (!sentry) return;

    Sentry.setUser({
      id: userId,
      ...userData,
    });
  }

  static clearUser() {
    if (!sentry) return;
    Sentry.setUser(null);
  }

  static setContext(name, context) {
    if (!sentry) return;
    Sentry.setContext(name, context);
  }

  static clearContext(name) {
    if (!sentry) return;
    Sentry.setContext(name, undefined);
  }

  static addBreadcrumb(message, category, level = 'info', data = {}) {
    if (!sentry) return;

    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data,
      timestamp: Date.now() / 1000,
    });
  }

  static startTransaction(name, op = 'http.request') {
    if (!sentry) return null;

    return Sentry.startTransaction({
      name,
      op,
    });
  }

  static capturePerformance(operationName, duration, metadata = {}) {
    if (!sentry) return;

    const transaction = Sentry.getCurrentScope().getTransaction();
    if (transaction) {
      const span = transaction.startChild({
        op: 'operation',
        description: operationName,
        data: metadata,
      });
      span.end();
    }

    if (duration > 5000) {
      this.addBreadcrumb(
        `Slow operation: ${operationName}`,
        'performance',
        'warning',
        { duration, ...metadata }
      );
    }
  }

  static captureApiRequest(req, res) {
    if (!sentry) return;

    Sentry.addBreadcrumb({
      category: 'http',
      message: `${req.method} ${req.path}`,
      level: res.statusCode >= 400 ? 'warning' : 'info',
      data: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        url: req.originalUrl,
        correlationId: req.correlationId,
      },
    });
  }

  static captureAuthEvent(eventType, userId, details = {}) {
    if (!sentry) return;

    this.setUser(userId);
    this.addBreadcrumb(
      `Authentication event: ${eventType}`,
      'auth',
      'info',
      { userId, ...details }
    );
  }

  static captureSecurityEvent(eventType, details = {}) {
    if (!sentry) return;

    this.addBreadcrumb(
      `Security event: ${eventType}`,
      'security',
      'warning',
      details
    );
  }

  static captureValidationError(fieldName, error, context = {}) {
    if (!sentry) return;

    this.addBreadcrumb(
      `Validation error: ${fieldName}`,
      'validation',
      'warning',
      { fieldName, error, ...context }
    );
  }

  static captureDataIntegrity(issue, context = {}) {
    if (!sentry) return;

    this.addBreadcrumb(
      `Data integrity issue: ${issue}`,
      'data',
      'error',
      context
    );

    this.captureMessage(
      `Data integrity issue detected: ${issue}`,
      'error',
      context
    );
  }

  static release(version) {
    if (!sentry) return;
    Sentry.setRelease(version);
  }

  static flush(timeout = 2000) {
    if (!sentry) return Promise.resolve();
    return Sentry.close(timeout);
  }

  static isEnabled() {
    return !!sentry;
  }
}

module.exports = ErrorTrackingService;
