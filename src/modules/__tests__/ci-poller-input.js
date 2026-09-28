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

test("parses root and full-path publish titles", () => {
  expect(
    getCiPollerInput({
      issueBody,
      title: "publish: getsentry/toolkit/cli@1.2.3",
    })
  ).toEqual({
    path: "./cli",
    repo: "getsentry/toolkit",
    revision: REVISION,
    version: "1.2.3",
  });

  expect(
    getCiPollerInput({
      issueBody,
      title: "publish: toolkit/packages/cli/v2@1.2.3",
    })
  ).toEqual({
    path: "./packages/cli/v2",
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

test.each(["-toolkit", ".", "..", "__proto__"])(
  "rejects unsafe repository identity before CI API calls: %s",
  (repo) => {
    expect(() =>
      getCiPollerInput({
        issueBody,
        title: `publish: getsentry/${repo}@1.2.3`,
      })
    ).toThrow("Invalid publish issue repository");
  }
);

test.each(["--config", "1.2"])(
  "rejects invalid release version before CI API calls: %s",
  (version) => {
    expect(() =>
      getCiPollerInput({
        issueBody,
        title: `publish: getsentry/toolkit@${version}`,
      })
    ).toThrow("Invalid publish issue version");
  }
);

test.each(["publish: getsentry/@1.2.3", "publish: getsentry/toolkit$@1.2.3"])(
  "rejects malformed repository identity before CI API calls: %s",
  (title) => {
    expect(() => getCiPollerInput({ issueBody, title })).toThrow(
      "Invalid publish issue title"
    );
  }
);

test.each([
  "publish: getsentry/toolkit/../other@1.2.3",
  "publish: getsentry/toolkit/./other@1.2.3",
  "publish: getsentry/toolkit/__proto__/other@1.2.3",
  "publish: getsentry/toolkit/--config@1.2.3",
])("rejects unsafe publish path before CI API calls: %s", (title) => {
  expect(() => getCiPollerInput({ issueBody, title })).toThrow(
    "Invalid publish issue path"
  );
});
