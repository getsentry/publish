const Sentry = require("@sentry/node");

function initSentry({ inputs }) {
  const config = {
    dsn: "https://303a687befb64dc2b40ce4c96de507c5@o1.ingest.sentry.io/6183838",
    release: `${inputs.repo}@${inputs.version}`,
    tracesSampleRate: 1.0,
    autoSessionTracking: false,
  };

  Sentry.init(config);
}

function captureFailedSession({ context, inputs }) {
  const session = Sentry.getCurrentHub().startSession({ status: "crashed" });
  Sentry.getCurrentHub().endSession(session);
  Sentry.setTag("repository", inputs.repo);
  Sentry.addBreadcrumb({
    message: "Release context",
    category: Sentry.Severity.Log,
    data: { issue_number: context.payload.issue.number, inputs },
  });
  Sentry.captureMessage(`Release failed: ${inputs.repo}`);
}

function captureSuccessfulSession() {
  const session = Sentry.getCurrentHub().startSession({ status: "ok" });
  Sentry.getCurrentHub().endSession(session);
}

module.exports = { initSentry, captureFailedSession, captureSuccessfulSession };
