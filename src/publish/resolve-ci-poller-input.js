const { getCiPollerInput } = require("../modules/ci-poller-input");
const { readFileSync } = require("fs");

const issueBody = process.env.PUBLISH_ISSUE_BODY_FILE
  ? readFileSync(process.env.PUBLISH_ISSUE_BODY_FILE, "utf8")
  : process.env.PUBLISH_ISSUE_BODY || "";

process.stdout.write(
  JSON.stringify(
    getCiPollerInput({
      issueBody,
      labels: JSON.parse(process.env.PUBLISH_ISSUE_LABELS || ""),
      title: process.env.PUBLISH_TITLE || "",
      revision: process.env.PUBLISH_REVISION || "",
    })
  )
);
