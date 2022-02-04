exports.default = async function success({
  context,
  github,
  sentryClient,
  sentryHelpers,
}) {
  const Sentry = sentryHelpers.initSentry({ sentryClient, inputs });

  const repoInfo = context.repo;
  const workflowInfo = (
    await github.actions.getWorkflowRun({
      ...repoInfo,
      run_id: context.runId,
    })
  ).data;

  await Promise.all([
    github.issues.createComment({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      body: `Published successfully: [run#${context.runId}](${workflowInfo.html_url})`,
    }),

    github.issues.update({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      state: "closed",
    }),
  ]);

  sentryHelpers.captureSuccessfulSession({ sentryClient: Sentry });
};
