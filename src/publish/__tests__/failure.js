/* eslint-env jest */

jest.mock("fs");

const fs = require("fs");
const failure = require("../failure.js").default;

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

const failureArgs = deepFreeze({
  inputs: { repo: "sentry", version: "21.3.1" },
  context: {
    runId: "1234",
    repo: { owner: "getsentry", repo: "publish" },
    payload: { issue: { number: "211" } },
  },
  github: {
    rest: {
      actions: {
        getWorkflowRun: async () => ({
          data: {
            html_url: "https://github.com/getsentry/sentry/actions/runs/1234",
          },
        }),
      },
      issues: {
        get: jest.fn(),
        update: jest.fn(),
        createComment: jest.fn(),
        removeLabel: jest.fn(),
      },
    },
  },
  Sentry: {
    Scope: class Scope {
      update() {}
    },
    NodeClient: class NodeClient {
      captureMessage() {}
      captureSession() {}
    },
    Session: class Session {},
  },
});

beforeAll(() => {
  process.env.GITHUB_WORKSPACE = ".";
  fs.promises = {};
  fs.promises.readFile = jest.fn(async () =>
    JSON.stringify({ published: { lol: true, hey: false, github: true } })
  );

  failureArgs.github.rest.issues.get.mockReturnValue({
    data: {
      body: `
Requested by: @BYK

Merge target: (default)

Quick links:
- [View changes](https://github.com/getsentry/sentry/compare/21.3.0...refs/heads/releases/21.3.1)
- [View check runs](https://github.com/getsentry/sentry/commit/7e5ca7ed5581552de066e2a8bc295b8306be38ac/checks/)

Assign the **accepted** label to this issue to approve the release.\r

### Targets\r
- [ ] github
- [ ] pypi\r
- [ ] docker[release]\r
- [ ] docker[latest]  
`,
    },
  });
});

describe("publish failed", () => {
  beforeEach(async () => {
    await failure(failureArgs);
  });

  test("create comment", async () => {
    const createComment = failureArgs.github.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment).toHaveBeenCalledWith({
      owner: "getsentry",
      repo: "publish",
      issue_number: "211",
      body:
        "Failed to publish. ([run logs](https://github.com/getsentry/sentry/actions/runs/1234?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/sentry/branches/all?query=21.3.1) and start over._",
    });
  });
});
