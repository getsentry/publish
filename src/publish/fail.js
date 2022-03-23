exports.default = async function fail({ context, github, inputs, Sentry }) {
  const { repo, version } = inputs;

  const repoInfo = context.repo;
  const workflowInfo = (
    await github.rest.actions.getWorkflowRun({
      ...repoInfo,
      run_id: context.runId,
    })
  ).data;
  const issue_number = context.payload.issue.number;

  await Promise.all([
    github.rest.issues.createComment({
      ...repoInfo,
      issue_number,
      body: `Failed to publish. ([error logs](${
        workflowInfo.html_url
      }?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}) and start over._`,
    }),
    github.rest.issues.removeLabel({
      ...repoInfo,
      issue_number,
      name: "accepted",
    }),
  ]);

  const release = `${inputs.repo}@${inputs.version}`;
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
      repository: inputs.repo,
    },
    contexts: {
      release: {
        issue_number: context.payload.issue.number,
        inputs,
      },
    },
  });

  client.captureMessage(`Release failed: ${inputs.repo}`, "error", null, scope);
  client.captureSession(session);
};
