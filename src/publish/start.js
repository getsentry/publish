exports.default = async function start({ context, github }) {
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  const workflowInfo = (
    await github.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  return github.rest.issues.createComment({
    ...publishRepo,
    issue_number,
    body: `Publishing: [run#${run_id}](${workflowInfo.html_url})`,
  });
};
