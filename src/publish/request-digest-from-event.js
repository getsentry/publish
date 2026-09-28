const fs = require("fs");
const { requestDigest } = require("../modules/approval-attestation.js");

function requestDigestFromEvent(event) {
  if (!event || typeof event.issue !== "object" || event.issue === null) {
    throw new Error("The GitHub event has no issue snapshot");
  }

  return requestDigest(event.issue);
}

function main() {
  if (!process.env.GITHUB_EVENT_PATH) {
    throw new Error('No "GITHUB_EVENT_PATH" environment variable found');
  }

  if (!process.env.GITHUB_OUTPUT) {
    throw new Error('No "GITHUB_OUTPUT" environment variable found');
  }

  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")
  );
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `request_digest=${requestDigestFromEvent(event)}\n`
  );
}

if (require.main === module) {
  main();
}

module.exports = { main, requestDigestFromEvent };
