exports.default = async function failure({ context, github, inputs, Sentry }) {
  const { repo, version } = inputs;
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  const workflowInfo = (
    await github.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  await github.rest.issues.createComment({
    ...publishRepo,
    issue_number,
    body: `Failed to publish. ([run logs](${
      workflowInfo.html_url
    }?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
      version
    )}) and start over._`,
  });

  const release = `${repo}@${version}`;
  const client = new Sentry.NodeClient({
    dsn: process.env.SENTRY_DSN,
    release,
  });
  const session = new Sentry.Session({
    release,
    status: "crashed",
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

  client.captureMessage(`Release failed: ${repo}`, "error", null, scope);
  client.captureSession(session);
};
