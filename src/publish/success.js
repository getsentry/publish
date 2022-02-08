exports.default = async function success({ context, github, inputs, Sentry }) {
  const repoInfo = context.repo;
  const workflowInfo = (
    await github.rest.actions.getWorkflowRun({
      ...repoInfo,
      run_id: context.runId,
    })
  ).data;

  await Promise.all([
    github.rest.issues.createComment({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      body: `Published successfully: [run#${context.runId}](${workflowInfo.html_url})`,
    }),

    github.rest.issues.update({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      state: "closed",
    }),
  ]);

  const release = `${inputs.repo}@${inputs.version}`;
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
      repository: inputs.repo,
    },
    contexts: {
      release: {
        issue_number: context.payload.issue.number,
        inputs,
      },
    },
  });

  client.captureMessage(
    `Release succeeded: ${inputs.repo}`,
    "info",
    null,
    scope
  );
  client.captureSession(session);
};
