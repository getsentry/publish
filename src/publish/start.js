exports.default = async function start({
  context,
  github,
  inputs,
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

  return github.issues.createComment({
    ...repoInfo,
    issue_number: context.payload.issue.number,
    body: `Publishing: [run#${context.runId}](${workflowInfo.html_url})`,
  });
};
