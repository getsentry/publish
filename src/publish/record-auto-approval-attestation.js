const fs = require("fs");
const {
  createAutoApprovalAttestation,
  currentAcceptedEvent,
  hasIssueStateChangeAfter,
  requestDigest,
} = require("../modules/approval-attestation.js");
const { getIssueEvents: fetchIssueEvents } = require("./authorize-approval.js");
const { getIssue } = require("./validate-approval-attestation.js");

async function recordAutoApprovalAttestation({
  autoApprover,
  expectedRequestDigest,
  getIssue,
  getIssueEvents = fetchIssueEvents,
  issueNumber,
  issueTitle,
  repository,
}) {
  const issue = await getIssue({ repository, issueNumber });

  if (
    issue.state !== "open" ||
    issue.title !== issueTitle ||
    requestDigest(issue) !== expectedRequestDigest ||
    issue.user?.login?.toLowerCase() !== autoApprover.toLowerCase()
  ) {
    throw new Error("The automated approval request changed before approval");
  }

  const events = await getIssueEvents({ repository, issueNumber });
  const acceptedEvent = currentAcceptedEvent(events);

  if (
    !acceptedEvent ||
    acceptedEvent.actor !== "sentry-internal-app[bot]" ||
    hasIssueStateChangeAfter(events, acceptedEvent)
  ) {
    throw new Error("The automated approval label event could not be verified");
  }

  return createAutoApprovalAttestation({
    acceptedEvent,
    autoApprover,
    issue,
  });
}

async function main() {
  for (const name of [
    "GITHUB_OUTPUT",
    "APPROVAL_TOKEN",
    "APPROVAL_ISSUE_NUMBER",
    "APPROVAL_ISSUE_REPOSITORY",
    "APPROVAL_ISSUE_TITLE",
    "AUTO_APPROVER",
    "EXPECTED_REQUEST_DIGEST",
    "PUBLISH_ATTESTATION_SECRET",
  ]) {
    if (!process.env[name]) {
      throw new Error(`No "${name}" environment variable found`);
    }
  }

  const attestation = await recordAutoApprovalAttestation({
    autoApprover: process.env.AUTO_APPROVER,
    expectedRequestDigest: process.env.EXPECTED_REQUEST_DIGEST,
    getIssue,
    getIssueEvents: fetchIssueEvents,
    issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
    issueTitle: process.env.APPROVAL_ISSUE_TITLE,
    repository: process.env.APPROVAL_ISSUE_REPOSITORY,
  });
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `auto_approval_attestation=${attestation}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, recordAutoApprovalAttestation };
