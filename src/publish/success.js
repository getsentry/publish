const Sentry = require('@sentry/node');
const SentryHub = require('@sentry/hub');
const github = require('@actions/github');

async function success() {
  const context = github.context;
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
  const inputs = JSON.parse(process.env.PUBLISH_ARGS);

  const { repo, version } = inputs;
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  const workflowInfo = (
    await octokit.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  await Promise.all([
    octokit.rest.issues.createComment({
      ...publishRepo,
      issue_number,
      body: `Published successfully: [run#${run_id}](${workflowInfo.html_url})`,
    }),

    octokit.rest.issues.update({
      ...publishRepo,
      issue_number,
      state: "closed",
    }),
  ]);

  const release = `${repo}@${version}`;
  const client = new Sentry.NodeClient({
    dsn: process.env.SENTRY_DSN,
    transport: Sentry.makeNodeTransport,
    release,
  });
  const session = SentryHub.makeSession({
    release,
  });

  const scope = new Sentry.Scope().update({
    tags: {
      repository: repo,
    },
    contexts: {
      release: {
        issue_number,
        inputs,
      },
    },
  });

  client.captureMessage(`Release succeeded: ${repo}`, "info", null, scope);
  client.captureSession(session);
};
success();
