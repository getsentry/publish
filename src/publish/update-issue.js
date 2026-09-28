const { updateIssue } = require("../modules/update-issue.js");
const { getGitHubToken } = require("../libs/github");
const github = require("@actions/github");

async function main() {
  const context = github.context;
  const octokit = github.getOctokit(getGitHubToken());
  let inputs;

  if (process.env.PUBLISH_ARGS) {
    try {
      inputs = JSON.parse(process.env.PUBLISH_ARGS);
    } catch {
      console.warn("Could not parse publish inputs; skipping target update");
    }
  }

  await updateIssue({ context, octokit, inputs });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
