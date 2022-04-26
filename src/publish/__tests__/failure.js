/* eslint-env jest */

jest.mock("fs");

const failure = require("../failure.js").default;

const failureArgs = {
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
        createComment: jest.fn(),
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
};

describe("publish failed", () => {
  beforeEach(async () => {
    await failure(failureArgs);
  });

  test("create comment", async () => {
    const createComment = failureArgs.github.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "body": "Failed to publish. ([run logs](https://github.com/getsentry/sentry/actions/runs/1234?check_suite_focus=true#step:8))

      _Bad branch? You can [delete with ease](https://github.com/getsentry/sentry/branches/all?query=21.3.1) and start over._",
        "issue_number": "211",
        "owner": "getsentry",
        "repo": "publish",
      }
    `);
  });
});
