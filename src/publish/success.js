exports.default = async function success({ context, github, inputs, Sentry }) {
  const { repo, version } = inputs;
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  const workflowInfo = (
    await github.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  await Promise.all([
    github.rest.issues.createComment({
      ...publishRepo,
      issue_number,
      body: `Published successfully: [run#${run_id}](${workflowInfo.html_url})`,
    }),

    github.rest.issues.update({
      ...publishRepo,
      issue_number,
      state: "closed",
    }),
  ]);

  const release = `${repo}@${version}`;
  const client = new Sentry.NodeClient({
    dsn: process.env.SENTRY_DSN,
    release,
  });
  const session = new Sentry.Session({
    release,
    status: "ok",
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
