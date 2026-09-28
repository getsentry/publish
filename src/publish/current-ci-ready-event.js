const { currentCiReadyEvent } = require("../modules/approval-attestation.js");
const { getAllPages } = require("./validate-approval-attestation.js");

async function getCurrentCiReadyEvent({
  getIssueEvents,
  issueNumber,
  repository,
}) {
  const event = currentCiReadyEvent(
    await getIssueEvents({ repository, issueNumber })
  );
  if (!event) {
    throw new Error("No current ci-ready event found");
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

  const event = await getCurrentCiReadyEvent({
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

module.exports = { getCurrentCiReadyEvent, main };
