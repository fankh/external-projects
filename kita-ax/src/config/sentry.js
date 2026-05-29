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
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express(),
      new Sentry.Integrations.Postgres(),
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
  getSentryMiddleware: () => [
    Sentry.Handlers.requestHandler(),
    Sentry.Handlers.tracingHandler(),
  ],
  getSentryErrorHandler: () => Sentry.Handlers.errorHandler(),
};
