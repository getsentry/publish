const { parse: parsePublishIssueTitle } = require("./publish-issue-title");
const {
  getReleaseRevision,
  updateReleaseRevision,
} = require("./release-revision");

function getCiPollerInput({ title, issueBody, revision }) {
  let parsedTitle;
  try {
    parsedTitle = parsePublishIssueTitle(title);
  } catch {
    throw new Error(`Invalid publish issue title: '${title}'`);
  }
  const { repo, version } = parsedTitle;
  const currentRevision = getReleaseRevision({ issueBody, repo });

  return {
    ...(revision
      ? { issueBody: updateReleaseRevision({ issueBody, repo, revision }) }
      : {}),
    repo: `getsentry/${repo}`,
    revision: currentRevision,
    version,
  };
}

module.exports = { getCiPollerInput };
