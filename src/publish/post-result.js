const processEndState = require("../modules/process-end-state.js");
const { getGitHubToken } = require("../libs/github.js");
const github = require("@actions/github");

async function main({
  context = github.context,
  octokit = github.getOctokit(getGitHubToken()),
  report = processEndState,
  status = process.argv.slice(2)[0],
} = {}) {
  let inputs = {};

  if (process.env.PUBLISH_ARGS) {
    try {
      inputs = JSON.parse(process.env.PUBLISH_ARGS);
    } catch {
      console.warn("Could not parse publish inputs; reporting without them");
    }
  }

  await report({ context, octokit, inputs, status });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
