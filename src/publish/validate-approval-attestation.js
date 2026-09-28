const {
  hasAutoApprovalAttestation,
  currentAcceptedEvent,
  currentCiReadyEvent,
  hasIssueStateChangeAfter,
  hasApprovalAttestation,
  hasCiReadyAttestation,
  requestDigest,
} = require("../modules/approval-attestation.js");
const {
  AUTO_APPROVAL_LABELER,
  AUTO_APPROVERS,
  isAutoApprovedRepository,
} = require("../modules/approval-authorizer.js");
const { getAutoApprovedRepositories } = require("./authorize-approval.js");

async function getGitHubResponse(path, token = process.env.APPROVAL_TOKEN) {
  return fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
}

async function getIssue({ repository, issueNumber, token }) {
  const response = await getGitHubResponse(
    `repos/${repository}/issues/${issueNumber}`,
    token
  );

  if (!response.ok) {
    throw new Error(
      `Could not retrieve issue #${issueNumber}: GitHub returned ${response.status}`
    );
  }

  return response.json();
}

async function getAllPages({ repository, issueNumber, resource, token }) {
  const records = [];

  for (let page = 1; ; page += 1) {
    const response = await getGitHubResponse(
      `repos/${repository}/issues/${issueNumber}/${resource}?per_page=100&page=${page}`,
      token
    );

    if (!response.ok) {
      throw new Error(
        `Could not retrieve ${resource} for issue #${issueNumber}: GitHub returned ${response.status}`
      );
    }

    const pageRecords = await response.json();
    records.push(...pageRecords);

    if (pageRecords.length < 100) {
      return records;
    }
  }
}

async function validateApprovalAttestation({
  attestationAuthor,
  expectedAcceptedEvent,
  expectedRequestDigest,
  issueNumber,
  issueTitle,
  repository,
  requireCiPendingAbsent = false,
  requireCiReadyAttestation = false,
  approvalToken = process.env.APPROVAL_TOKEN,
  attestationSecret = process.env.PUBLISH_ATTESTATION_SECRET,
  autoApprovedRepositories = getAutoApprovedRepositories(),
}) {
  const [issue, events, comments] = await Promise.all([
    getIssue({ repository, issueNumber, token: approvalToken }),
    getAllPages({
      repository,
      issueNumber,
      resource: "events",
      token: approvalToken,
    }),
    getAllPages({
      repository,
      issueNumber,
      resource: "comments",
      token: approvalToken,
    }),
  ]);
  const event = currentAcceptedEvent(events);
  const ciReadyEvent = currentCiReadyEvent(events);

  const hasAutomatedApproval =
    event?.actor === AUTO_APPROVAL_LABELER &&
    AUTO_APPROVERS.has(issue.user?.login) &&
    isAutoApprovedRepository({
      actor: issue.user.login,
      autoApprovedRepositories,
      issueTitle,
    }) &&
    hasAutoApprovalAttestation({
      acceptedEvent: event,
      attestationAuthor,
      attestationSecret,
      autoApprover: issue.user.login,
      comments,
      issue,
    });
  const approved =
    issue.state === "open" &&
    issue.title === issueTitle &&
    requestDigest(issue) === expectedRequestDigest &&
    issue.labels.some((label) => label.name === "accepted") &&
    (!requireCiPendingAbsent ||
      !issue.labels.some((label) => label.name === "ci-pending")) &&
    event !== null &&
    !hasIssueStateChangeAfter(events, event) &&
    (!expectedAcceptedEvent ||
      (event.actor === expectedAcceptedEvent.actor &&
        event.eventId === expectedAcceptedEvent.eventId)) &&
    (hasApprovalAttestation({
      attestationAuthor,
      attestationSecret,
      comments,
      event,
      issue,
    }) ||
      hasAutomatedApproval);

  if (!approved || !requireCiReadyAttestation) {
    return approved;
  }

  return (
    ciReadyEvent !== null &&
    issue.labels.some((label) => label.name === "ci-ready") &&
    hasCiReadyAttestation({
      acceptedEvent: event,
      attestationAuthor,
      attestationSecret,
      comments,
      ciReadyEvent,
      issue,
    })
  );
}

async function main() {
  for (const name of [
    "APPROVAL_TOKEN",
    "APPROVAL_ISSUE_NUMBER",
    "APPROVAL_ISSUE_REPOSITORY",
    "APPROVAL_ISSUE_TITLE",
    "APPROVAL_ATTESTATION_AUTHOR",
    "EXPECTED_REQUEST_DIGEST",
    "PUBLISH_ATTESTATION_SECRET",
  ]) {
    if (!process.env[name]) {
      throw new Error(`No "${name}" environment variable found`);
    }
  }

  const valid = await validateApprovalAttestation({
    attestationAuthor: process.env.APPROVAL_ATTESTATION_AUTHOR,
    attestationSecret: process.env.PUBLISH_ATTESTATION_SECRET,
    expectedAcceptedEvent:
      process.env.EXPECTED_ACCEPTED_ACTOR &&
      process.env.EXPECTED_ACCEPTED_EVENT_ID
        ? {
            actor: process.env.EXPECTED_ACCEPTED_ACTOR,
            eventId: process.env.EXPECTED_ACCEPTED_EVENT_ID,
          }
        : undefined,
    expectedRequestDigest: process.env.EXPECTED_REQUEST_DIGEST,
    issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
    issueTitle: process.env.APPROVAL_ISSUE_TITLE,
    repository: process.env.APPROVAL_ISSUE_REPOSITORY,
    requireCiPendingAbsent: process.env.REQUIRE_CI_PENDING_ABSENT === "true",
    requireCiReadyAttestation:
      process.env.REQUIRE_CI_READY_ATTESTATION === "true",
  });

  if (!valid) {
    throw new Error(
      "The current accepted label has no matching approval attestation"
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  getAllPages,
  getGitHubResponse,
  getIssue,
  main,
  validateApprovalAttestation,
};
