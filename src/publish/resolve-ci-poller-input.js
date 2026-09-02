const { getCiPollerInput } = require("../modules/ci-poller-input");

process.stdout.write(
  JSON.stringify(
    getCiPollerInput({
      issueBody: process.env.PUBLISH_ISSUE_BODY || "",
      title: process.env.PUBLISH_TITLE || "",
      revision: process.env.PUBLISH_REVISION || "",
    })
  )
);
