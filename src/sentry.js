function initSentry({ sentryClient, inputs }) {
  const config = {
    dsn: "https://303a687befb64dc2b40ce4c96de507c5@o1.ingest.sentry.io/6183838",
    release: `${inputs.repo}@${inputs.version}`,
    tracesSampleRate: 1.0,
    autoSessionTracking: false,
  };

  sentryClient.init(config);

  return sentryClient;
}

function captureFailedSession({ sentryClient, context, inputs }) {
  const session = sentryClient
    .getCurrentHub()
    .startSession({ status: "crashed" });
  sentryClient.getCurrentHub().endSession(session);
  sentryClient.setTag("repository", inputs.repo);
  sentryClient.addBreadcrumb({
    message: "Release context",
    category: sentryClient.Severity.Log,
    data: { issue_number: context.payload.issue.number, inputs },
  });
  sentryClient.captureMessage(`Release failed: ${inputs.repo}`);
}

function captureSuccessfulSession({ sentryClient }) {
  const session = sentryClient.getCurrentHub().startSession({ status: "ok" });
  sentryClient.getCurrentHub().endSession(session);
}

module.exports = { initSentry, captureFailedSession, captureSuccessfulSession };
