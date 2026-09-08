const { parse: parsePublishIssueTitle } = require("./publish-issue-title");
const {
  getReleaseRevision,
  updateReleaseRevision,
} = require("./release-revision");
const {
  isPublishRepository,
  isReleaseVersion,
} = require("./publish-issue-validation");
const { isPublishPath } = require("./publish-location");

function getCiPollerInput({ title, issueBody, revision }) {
  let parsedTitle;
  try {
    parsedTitle = parsePublishIssueTitle(title);
  } catch {
    throw new Error(`Invalid publish issue title: '${title}'`);
  }
  const { repo, version } = parsedTitle;
  if (!isPublishRepository(repo)) {
    throw new Error(`Invalid publish issue repository: '${repo}'`);
  }
  if (!isReleaseVersion(version)) {
    throw new Error(`Invalid publish issue version: '${version}'`);
  }
  const path = `.${parsedTitle.path}`;
  if (!isPublishPath(path)) {
    throw new Error(`Invalid publish issue path: '${path}'`);
  }
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
