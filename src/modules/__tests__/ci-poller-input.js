import { readFileSync } from "fs";
import { join } from "path";

import { expect, test } from "vitest";

const { getCiPollerInput } = require("../ci-poller-input.js");

const REVISION = "7e5ca7ed5581552de066e2a8bc295b8306be38ac";
const issueBody = `Requested by: @byk

Merge target: (default)

Quick links:
- [View changes](https://github.com/getsentry/toolkit/compare/1.2.2...release/1.2.3)
- [View check runs](https://github.com/getsentry/toolkit/commit/${REVISION}/checks/)`;

test("parses compact and legacy workspace publish titles", () => {
  expect(
    getCiPollerInput({
      issueBody,
      title: "publish: getsentry/toolkit/cli@1.2.3",
    })
  ).toEqual({
    repo: "getsentry/toolkit",
    revision: REVISION,
    version: "1.2.3",
  });

  expect(
    getCiPollerInput({
      issueBody,
      title: 'publish: toolkit [workspace: "cli/v2"] @1.2.3',
    })
  ).toEqual({
    repo: "getsentry/toolkit",
    revision: REVISION,
    version: "1.2.3",
  });
});

test("uses the shared resolver in the CI poller", () => {
  const workflow = readFileSync(
    join(__dirname, "../../../.github/workflows/ci-poller.yml"),
    "utf8"
  );

  expect(workflow).toContain("name: Check out publish controller");
  expect(workflow).toContain("path: .__publish__");
  expect(workflow).toContain(
    "node .__publish__/src/publish/resolve-ci-poller-input.js"
  );
  expect(workflow).not.toContain("grep -oP '(?<=commit/");
});
