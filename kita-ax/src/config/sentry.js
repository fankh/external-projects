const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

function initializeSentry() {
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  SENTRY_DSN not configured. Error tracking disabled.');
    return null;
  }

  if (!sentryDsn) {
    return null;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    // @sentry/node v8+ uses functional integrations; HTTP/Express/Postgres
    // request & tracing instrumentation is applied automatically at init.
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      Sentry.postgresIntegration(),
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE || (process.env.NODE_ENV === 'production' ? 0.1 : 1.0),
    profilesSampleRate: process.env.SENTRY_PROFILES_SAMPLE_RATE || 0.1,
    maxBreadcrumbs: 100,
    attachStacktrace: true,
    serverName: process.env.HOSTNAME || 'kyra-admin-console',
    release: process.env.APP_VERSION || 'unknown',
    beforeSend(event, hint) {
      if (event.level === 'fatal') {
        return event;
      }

      if (event.exception) {
        const error = hint.originalException;
        if (error instanceof SyntaxError || error instanceof ReferenceError) {
          return event;
        }
      }

      return event;
    },
  });

  return Sentry;
}

const sentry = initializeSentry();

module.exports = {
  Sentry,
  sentry,
  // v8+ auto-instruments requests/tracing at init, so no request/tracing
  // middleware is added manually. Returns an empty list for compatibility
  // with the existing server wiring.
  getSentryMiddleware: () => [],
  // Express error-capturing middleware. Captures the exception when Sentry is
  // active, then re-throws so the app's own error handler still runs.
  getSentryErrorHandler: () => (err, req, res, next) => {
    if (sentry) {
      Sentry.captureException(err);
    }
    next(err);
  },
};
