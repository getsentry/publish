const sentry = require("../sentry");

exports.default = async function success({ context, github }) {
  sentry.initSentry({ inputs });

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

  sentry.captureSuccessfulSession();
};
