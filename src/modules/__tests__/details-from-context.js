/* eslint-env jest */

const detailsFromContext = require("../details-from-context.js");

const inputsArgs = {
  context: {
    repo: { owner: "getsentry", repo: "publish" },
    payload: {
      issue: {
        number: "223",
        title: "publish: getsentry/sentry@21.3.1",
        body: `
Requested by: @BYK

Merge target: custom-branch

Quick links:
- [View changes](https://github.com/getsentry/sentry/compare/21.3.0...refs/heads/releases/21.3.1)
- [View check runs](https://github.com/getsentry/sentry/commit/7e5ca7ed5581552de066e2a8bc295b8306be38ac/checks/)

Assign the **accepted** label to this issue to approve the release.

### Targets\r
 - [x] github\r
 - [ ] pypi\r
 - [ ] docker[release]
 - [x] docker[latest]\r
`,
        labels: ["accepted"],
      },
    },
  },
};

test("parse inputs", async () => {
  const result = await detailsFromContext(inputsArgs);
  expect(result).toEqual({
    dry_run: "",
    merge_target: "custom-branch",
    craft_config_branch: "default",
    path: ".",
    repo: "sentry",
    requester: "BYK",
    targets: ["github", "docker[latest]"],
    version: "21.3.1",
  });
});

test("can parse version containing +", async () => {
  const result = await detailsFromContext({
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "123",
          title: "publish: getsentry/sentry-forked-django-stubs@4.2.6+sentry1",
          body: "Requested by: @example",
          labels: [],
        },
      },
    },
  });
  expect(result.version).toEqual("4.2.6+sentry1");
});

const defaultTargetInputsArgs = {
  context: {
    repo: { owner: "getsentry", repo: "publish" },
    payload: {
      issue: {
        number: "223",
        title: "publish: getsentry/sentry@21.3.1",
        body: `
Requested by: @BYK
Merge target: (default)
Quick links:
- [View changes](https://github.com/getsentry/sentry/compare/21.3.0...refs/heads/releases/21.3.1)
- [View check runs](https://github.com/getsentry/sentry/commit/7e5ca7ed5581552de066e2a8bc295b8306be38ac/checks/)
Assign the **accepted** label to this issue to approve the release.
### Targets\r
 - [x] github\r
 - [ ] pypi\r
 - [ ] docker[release]
 - [x] docker[latest]\r
`,
        labels: ["accepted"],
      },
    },
  },
};

test("Do not extract merge_target value if its a default value", async () => {
  const result = await detailsFromContext(defaultTargetInputsArgs);
  expect(result).toEqual({
    dry_run: "",
    craft_config_branch: "default",
    merge_target: "",
    path: ".",
    repo: "sentry",
    requester: "BYK",
    targets: ["github", "docker[latest]"],
    version: "21.3.1",
  });
});

test("throw error when context is missing the issue payload", async () => {
  const fn = () => detailsFromContext({ context: {} });
  expect(fn).rejects.toThrow("Issue context is not defined");
});

test("Extracts the craft config branch from the issue body", async () => {
  const issueWithCraftConfigBranch = {
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "223",
          title: "publish: getsentry/sentry@21.3.1",
          body: `
Requested by: @Lms24
Merge target: main
Using Craft config from: merge_target
Quick links:
* [View changes](https://github.com/getsentry/sentry-migr8/compare/438d5013dd3fa977a42c313ea12f8e1bc88a23fc...refs/heads/main)
* [View check runs](https://github.com/getsentry/sentry-migr8/commit/18c0fb1bd2afa60408cbf32627a09fd636a9ad42/checks/)
Assign the **accepted** label to this issue to approve the release. Leave a comment containing \`#retract\` under this issue to retract the release (original issuer only).
### Targets\r
 - [x] npm\r
 - [ ] github\r
`,
          labels: ["accepted"],
        },
      },
    },
  };

  const result = await detailsFromContext(issueWithCraftConfigBranch);
  expect(result).toEqual({
    dry_run: "",
    merge_target: "main",
    craft_config_branch: "merge_target",
    path: ".",
    repo: "sentry",
    requester: "Lms24",
    targets: ["npm"],
    version: "21.3.1",
  });
});
