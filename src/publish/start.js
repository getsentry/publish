const github = require('@actions/github');

async function start() {
  const context = github.context;
  if (!context || !context.payload || !context.payload.issue || !context.payload.issue.body) {
    throw new Error('GitHub Actions context is undefined.');
  }

  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

  const workflowInfo = (
    await octokit.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  await octokit.rest.issues.createComment({
    ...publishRepo,
    issue_number,
    body: `Publishing: [run#${run_id}](${workflowInfo.html_url})`,
  });
}

start();