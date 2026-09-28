const fs = require("fs");
const path = require("path");
const {
  createApprovalAttestation,
  currentAcceptedEvent,
  hasIssueStateChangeAfter,
  hasAutoApprovalAttestation,
  requestDigest,
} = require("../modules/approval-attestation.js");
const {
  AUTO_APPROVAL_LABELER,
  AUTO_APPROVERS,
  authorizeApproval,
  isAutoApprovedRepository,
} = require("../modules/approval-authorizer.js");

function getAutoApprovedRepositories() {
  return new Set(
    fs
      .readFileSync(
        path.join(__dirname, "../../auto-approve-repos.txt"),
        "utf8"
      )
      .split(/\r?\n/)
      .filter(Boolean)
  );
}

async function getPermission({ owner, repository, username }) {
  if (!process.env.TARGET_REPOSITORY_TOKEN) {
    throw new Error('No "TARGET_REPOSITORY_TOKEN" environment variable found');
  }

  const response = await getGitHubResponse(
    `repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repository
    )}/collaborators/${encodeURIComponent(username)}/permission`,
    process.env.TARGET_REPOSITORY_TOKEN
  );

  if (!response.ok) {
    throw new Error(
      `Could not retrieve ${username}'s permission for ${owner}/${repository}: GitHub returned ${response.status}`
    );
  }

  return response.json();
}

async function getGitHubResponse(path, token = process.env.APPROVAL_TOKEN) {
  return fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
}

async function getIssue({ repository, issueNumber }) {
  const response = await getGitHubResponse(
    `repos/${repository}/issues/${issueNumber}`
  );

  if (!response.ok) {
    throw new Error(
      `Could not retrieve issue #${issueNumber}: GitHub returned ${response.status}`
    );
  }

  return response.json();
}

async function getIssueEvents({ repository, issueNumber }) {
  const events = [];

  for (let page = 1; ; page += 1) {
    const response = await getGitHubResponse(
      `repos/${repository}/issues/${issueNumber}/events?per_page=100&page=${page}`
    );

    if (!response.ok) {
      throw new Error(
        `Could not retrieve events for issue #${issueNumber}: GitHub returned ${response.status}`
      );
    }

    const pageEvents = await response.json();
    events.push(...pageEvents);

    if (pageEvents.length < 100) {
      return events;
    }
  }
}

async function getIssueComments({ repository, issueNumber }) {
  const comments = [];

  for (let page = 1; ; page += 1) {
    const response = await getGitHubResponse(
      `repos/${repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`
    );

    if (!response.ok) {
      throw new Error(
        `Could not retrieve comments for issue #${issueNumber}: GitHub returned ${response.status}`
      );
    }

    const pageComments = await response.json();
    comments.push(...pageComments);

    if (pageComments.length < 100) {
      return comments;
    }
  }
}

async function main() {
  if (!process.env.GITHUB_OUTPUT) {
    throw new Error('No "GITHUB_OUTPUT" environment variable found');
  }

  if (!process.env.APPROVAL_TOKEN) {
    throw new Error('No "APPROVAL_TOKEN" environment variable found');
  }

  if (!process.env.TARGET_REPOSITORY_TOKEN) {
    throw new Error('No "TARGET_REPOSITORY_TOKEN" environment variable found');
  }

  if (!process.env.APPROVAL_ISSUE_NUMBER) {
    throw new Error('No "APPROVAL_ISSUE_NUMBER" environment variable found');
  }

  if (!process.env.APPROVAL_ISSUE_REPOSITORY) {
    throw new Error(
      'No "APPROVAL_ISSUE_REPOSITORY" environment variable found'
    );
  }

  if (!process.env.EXPECTED_REQUEST_DIGEST) {
    throw new Error('No "EXPECTED_REQUEST_DIGEST" environment variable found');
  }

  if (!process.env.PUBLISH_ATTESTATION_SECRET) {
    throw new Error(
      'No "PUBLISH_ATTESTATION_SECRET" environment variable found'
    );
  }

  const actor = process.env.APPROVAL_ACTOR;
  const issueTitle = process.env.APPROVAL_ISSUE_TITLE;
  const expectedRequestDigest = process.env.EXPECTED_REQUEST_DIGEST;
  const autoApprovedRepositories = getAutoApprovedRepositories();
  let authorized;
  let issue;
  let event;
  let events;

  if (actor === AUTO_APPROVAL_LABELER) {
    const [liveIssue, liveEvents, comments] = await Promise.all([
      getIssue({
        repository: process.env.APPROVAL_ISSUE_REPOSITORY,
        issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
      }),
      getIssueEvents({
        repository: process.env.APPROVAL_ISSUE_REPOSITORY,
        issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
      }),
      getIssueComments({
        repository: process.env.APPROVAL_ISSUE_REPOSITORY,
        issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
      }),
    ]);
    const requester = liveIssue.user?.login;
    const acceptedEvent = currentAcceptedEvent(liveEvents);

    authorized =
      liveIssue.state === "open" &&
      liveIssue.title === issueTitle &&
      requestDigest(liveIssue) === expectedRequestDigest &&
      typeof requester === "string" &&
      AUTO_APPROVERS.has(requester) &&
      isAutoApprovedRepository({
        actor: requester,
        autoApprovedRepositories,
        issueTitle,
      }) &&
      acceptedEvent?.actor === actor &&
      acceptedEvent &&
      !hasIssueStateChangeAfter(liveEvents, acceptedEvent) &&
      hasAutoApprovalAttestation({
        acceptedEvent,
        autoApprover: requester,
        attestationSecret: process.env.PUBLISH_ATTESTATION_SECRET,
        attestationAuthor: "github-actions[bot]",
        comments,
        issue: liveIssue,
      });
    issue = liveIssue;
    event = acceptedEvent;
    events = liveEvents;
  } else {
    ({ authorized } = await authorizeApproval({
      actor,
      issueTitle,
      getPermission,
    }));
  }

  if (!authorized) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "authorized=false\n");
    return;
  }

  if (!issue) {
    const [liveIssue, liveEvents] = await Promise.all([
      getIssue({
        repository: process.env.APPROVAL_ISSUE_REPOSITORY,
        issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
      }),
      getIssueEvents({
        repository: process.env.APPROVAL_ISSUE_REPOSITORY,
        issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
      }),
    ]);
    issue = liveIssue;
    event = currentAcceptedEvent(liveEvents);
    events = liveEvents;
  }
  const requester = issue.user?.login;

  if (
    issue.state !== "open" ||
    issue.title !== process.env.APPROVAL_ISSUE_TITLE ||
    requestDigest(issue) !== expectedRequestDigest ||
    typeof requester !== "string" ||
    (actor !== AUTO_APPROVAL_LABELER &&
      requester.toLowerCase() === actor?.toLowerCase()) ||
    !event ||
    event.actor !== actor ||
    hasIssueStateChangeAfter(events, event)
  ) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "authorized=false\n");
    return;
  }

  const attestation = createApprovalAttestation({
    actor: event.actor,
    eventId: event.eventId,
    issue,
  });
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `authorized=true\napproval_attestation=${attestation}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  getAutoApprovedRepositories,
  getGitHubResponse,
  getIssue,
  getIssueComments,
  getIssueEvents,
  getPermission,
  main,
};
