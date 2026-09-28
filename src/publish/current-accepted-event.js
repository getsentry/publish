const { currentAcceptedEvent } = require("../modules/approval-attestation.js");
const { getAllPages } = require("./validate-approval-attestation.js");

async function getCurrentAcceptedEvent({
  getIssueEvents,
  issueNumber,
  repository,
}) {
  const event = currentAcceptedEvent(
    await getIssueEvents({ repository, issueNumber })
  );

  if (!event) {
    throw new Error("The issue has no current accepted label event");
  }

  return event;
}

async function main() {
  for (const name of [
    "APPROVAL_TOKEN",
    "APPROVAL_ISSUE_NUMBER",
    "APPROVAL_ISSUE_REPOSITORY",
  ]) {
    if (!process.env[name]) {
      throw new Error(`No "${name}" environment variable found`);
    }
  }

  const event = await getCurrentAcceptedEvent({
    getIssueEvents: ({ repository, issueNumber }) =>
      getAllPages({ repository, issueNumber, resource: "events" }),
    issueNumber: process.env.APPROVAL_ISSUE_NUMBER,
    repository: process.env.APPROVAL_ISSUE_REPOSITORY,
  });

  process.stdout.write(JSON.stringify(event));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { getCurrentAcceptedEvent, main };
