exports.default = async function fail({context, github, inputs}) {
  const {repo, version} = inputs;

  const repoInfo = context.repo;
  const workflowInfo = (
    await github.actions.getWorkflowRun({
      ...repoInfo,
      run_id: context.runId,
    })
  ).data;
  const issue_number = context.payload.issue.number;
  await Promise.all([
    github.issues.createComment({
      ...repoInfo,
      issue_number,
      body: `Failed to publish: [run#${context.runId}](${
        workflowInfo.html_url
      })\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version,
      )}) and start over._`,
    }),
    github.issues.removeLabel({
      ...repoInfo,
      issue_number,
      name: "accepted",
    }),
  ]);
};
