const core = require("@actions/core");
const { getReleaseRevision } = require("../modules/release-revision");

function resolveReleaseRevision() {
  const { repo } = JSON.parse(process.env.PUBLISH_ARGS || "{}");
  if (!repo) {
    throw new Error("Publish input must define a repository.");
  }

  core.setOutput(
    "revision",
    getReleaseRevision({
      issueBody: process.env.PUBLISH_ISSUE_BODY || "",
      repo,
    })
  );
}

resolveReleaseRevision();
