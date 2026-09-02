const CHECK_RUNS_LINK =
  /^Requested by: @[^\r\n]+\r?\n(?:[ \t]*\r?\n)?[ \t]*Merge target: [^\r\n]+\r?\n(?:[ \t]*\r?\n)?[ \t]*Quick links:\r?\n(?:[ \t]*\r?\n)?[ \t]*- \[View changes\]\([^\r\n]+\)\r?\n[ \t]*- \[View check runs\]\(https:\/\/github\.com\/getsentry\/(?<repo>[A-Za-z0-9_.-]+)\/commit\/(?<revision>[0-9a-f]{40})\/checks\/?\)(?=\r?\n|$)/;
const CHECK_RUNS_LINK_COUNT = /^[ \t]*- \[View check runs\]\(/gm;

function getReleaseRevision({ issueBody, repo }) {
  if ((issueBody.match(CHECK_RUNS_LINK_COUNT) || []).length !== 1) {
    throw new Error(
      `Expected exactly one View check runs link in Quick links for getsentry/${repo}.`
    );
  }

  const match = issueBody.match(CHECK_RUNS_LINK);
  if (!match?.groups || match.groups.repo !== repo) {
    throw new Error(
      `Expected a View check runs link for getsentry/${repo} in the publish issue body.`
    );
  }

  return match.groups.revision;
}

function updateReleaseRevision({ issueBody, repo, revision }) {
  const currentRevision = getReleaseRevision({ issueBody, repo });
  return issueBody.replace(CHECK_RUNS_LINK, (link) =>
    link.replace(currentRevision, revision)
  );
}

module.exports = { getReleaseRevision, updateReleaseRevision };
