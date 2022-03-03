/* eslint-env jest */

const inputs = require("../inputs.js").default;

function deepFreeze(object) {
  // Retrieve the property names defined on object
  const propNames = Object.getOwnPropertyNames(object);

  // Freeze properties before freezing self

  for (const name of propNames) {
    const value = object[name];

    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}

const inputsArgs = deepFreeze({
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
});

test("parse inputs", async () => {
  const result = await inputs(inputsArgs);
  expect(result).toMatchInlineSnapshot(`
    Object {
      "dry_run": "",
      "merge_target": "custom-branch",
      "path": ".",
      "repo": "sentry",
      "requester": "BYK",
      "targets": Array [
        "github",
        "docker[latest]",
      ],
      "version": "21.3.1",
    }
  `);
});

const defaultTargetInputsArgs = deepFreeze({
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
});

test("Do not extract merge_target value if its a default value", async () => {
  const result = await inputs(defaultTargetInputsArgs);
  expect(result).toMatchInlineSnapshot(`
    Object {
      "dry_run": "",
      "merge_target": "",
      "path": ".",
      "repo": "sentry",
      "requester": "BYK",
      "targets": Array [
        "github",
        "docker[latest]",
      ],
      "version": "21.3.1",
    }
  `);
});
