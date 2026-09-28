const fs = require("fs");
const {
  createCiReadyAttestation,
  compareEventIds,
  currentAcceptedEvent,
  currentCiReadyEvent,
  hasIssueStateChangeAfter,
  requestDigest,
} = require("../modules/approval-attestation.js");
const {
  getAllPages,
  getGitHubResponse,
  getIssue,
} = require("./validate-approval-attestation.js");

async function getAuthenticatedLogin() {
  const response = await getGitHubResponse("user");

  if (!response.ok) {
    throw new Error(
      `Could not retrieve the authenticated user: GitHub returned ${response.status}`
    );
  }

  const { login } = await response.json();

  if (typeof login !== "string") {
    throw new Error("GitHub returned no authenticated user login");
  }

  return login;
}

async function recordCiReadyAttestation({
  expectedAcceptedEvent,
  expectedPreviousCiReadyEventId,
  expectedRequestDigest,
  getAuthenticatedLogin,
  getIssue,
  getIssueEvents,
  issueNumber,
  issueTitle,
  repository,
}) {
  const [issue, events, ciReadyActor] = await Promise.all([
    getIssue({ repository, issueNumber }),
    getIssueEvents({ repository, issueNumber }),
    getAuthenticatedLogin(),
  ]);
  const acceptedEvent = currentAcceptedEvent(events);
  const ciReadyEvent = currentCiReadyEvent(events);

  if (
    issue.state !== "open" ||
    issue.title !== issueTitle ||
    requestDigest(issue) !== expectedRequestDigest ||
    !issue.labels.some((label) => label.name === "accepted") ||
    !issue.labels.some((label) => label.name === "ci-ready") ||
    !acceptedEvent ||
    !ciReadyEvent ||
    hasIssueStateChangeAfter(events, acceptedEvent) ||
    ciReadyEvent.actor !== ciReadyActor ||
    (expectedPreviousCiReadyEventId &&
      compareEventIds(ciReadyEvent.eventId, expectedPreviousCiReadyEventId) <=
        0) ||
    (expectedAcceptedEvent &&
      (acceptedEvent.actor !== expectedAcceptedEvent.actor ||
        acceptedEvent.eventId !== expectedAcceptedEvent.eventId))
  ) {
    throw new Error("The approval changed before CI could be marked ready");
  }

  return createCiReadyAttestation({ acceptedEvent, ciReadyEvent, issue });
}

async function main() {
  for (const name of [
    "GITHUB_OUTPUT",
    "APPROVAL_TOKEN",
    "APPROVAL_ISSUE_NUMBER",
    "APPROVAL_ISSUE_REPOSITORY",
    "APPROVAL_ISSUE_TITLE",
    "EXPECTED_REQUEST_DIGEST",
    "PUBLISH_ATTESTATION_SECRET",
  ]) {
    if (!process.env[name]) {
      throw new Error(`No "${name}" environment variable found`);
    }
  }

  const attestation = await recordCiReadyAttestation({
    expectedAcceptedEvent:
      process.env.EXPECTED_ACCEPTED_ACTOR &&
      process.env.EXPECTED_ACCEPTED_EVENT_ID
        ? {
            actor: process.env.EXPECTED_ACCEPTED_ACTOR,
            eventId: process.env.EXPECTED_ACCEPTED_EVENT_ID,
          }
        : undefined,
    expectedPreviousCiReadyEventId:
      process.env.EXPECTED_PREVIOUS_CI_READY_EVENT_ID || undefined,
    expectedRequestDigest: process.env.EXPECTED_REQUEST_DIGEST,
    getAuthenticatedLogin,
    getIssue,
    getIssueEvents: ({ repository, issueNumber }) =>
      getAllPages({ repository, issueNumber, resource: "events" }),
    issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
    issueTitle: process.env.APPROVAL_ISSUE_TITLE,
    repository: process.env.APPROVAL_ISSUE_REPOSITORY,
  });

  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `ci_ready_attestation=${attestation}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  getAuthenticatedLogin,
  main,
  recordCiReadyAttestation,
};
