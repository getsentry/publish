async function postWorkflowDetails({context, octokit}) {
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  const workflowInfo = (
    await octokit.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  return octokit.rest.issues.createComment({
    ...publishRepo,
    issue_number,
    body: `Publishing: [run#${run_id}](${workflowInfo.html_url})`,
  });
}

module.exports = postWorkflowDetails;