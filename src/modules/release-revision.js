const { parse } = require("./publish-issue-title");

function isRevision(revision) {
  return /^[0-9a-f]{40}$/.test(revision);
}

function getReleaseRevisionDetails({ issueBody, repo }) {
  if (parse(issueBody, { startRule: "CheckRunsLinkCount" }) !== 1) {
    throw new Error(
      `Expected exactly one View check runs link in Quick links for getsentry/${repo}.`
    );
  }

  let details;
  try {
    details = parse(issueBody, { startRule: "ReleaseRevision" });
  } catch {
    throw new Error(
      `Expected a View check runs link for getsentry/${repo} in the publish issue body.`
    );
  }

  if (details.repo !== repo) {
    throw new Error(
      `Expected a View check runs link for getsentry/${repo} in the publish issue body.`
    );
  }

  return details;
}

function getReleaseRevision({ issueBody, repo }) {
  return getReleaseRevisionDetails({ issueBody, repo }).revision.value;
}

function updateReleaseRevision({ issueBody, repo, revision }) {
  if (!isRevision(revision)) {
    throw new Error("Release revision must be a lowercase 40-character SHA.");
  }

  const { revision: currentRevision } = getReleaseRevisionDetails({
    issueBody,
    repo,
  });
  return `${issueBody.slice(
    0,
    currentRevision.start
  )}${revision}${issueBody.slice(currentRevision.end)}`;
}

module.exports = {
  getReleaseRevision,
  getReleaseRevisionDetails,
  isRevision,
  updateReleaseRevision,
};
