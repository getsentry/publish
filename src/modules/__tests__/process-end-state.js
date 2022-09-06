/* eslint-env jest */

jest.mock("fs");

const processEndState = require("../process-end-state.js");

describe("publish failed", () => {
  const failureArgs = {
    status: "failure",
    inputs: { repo: "sentry", version: "21.3.1" },
    context: {
      runId: "1234",
      repo: { owner: "getsentry", repo: "publish" },
      payload: { issue: { number: "211" } },
    },
    octokit: {
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

  test("create comment", async () => {
    await processEndState(failureArgs);

    const createComment = failureArgs.octokit.rest.issues.createComment;
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

describe("publish cancelleded", () => {
  const cancelledArgs = {
    status: "cancelled",
    inputs: { repo: "sentry", version: "21.3.1" },
    context: {
      runId: "1234",
      repo: { owner: "getsentry", repo: "publish" },
      payload: { issue: { number: "211" } },
    },
    octokit: {
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

  test("create comment", async () => {
    await processEndState(cancelledArgs);

    const createComment = cancelledArgs.octokit.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "body": "Publish workflow cancelled. ([run logs](https://github.com/getsentry/sentry/actions/runs/1234?check_suite_focus=true#step:8))

      _Bad branch? You can [delete with ease](https://github.com/getsentry/sentry/branches/all?query=21.3.1) and start over._",
        "issue_number": "211",
        "owner": "getsentry",
        "repo": "publish",
      }
    `);
  });
});

describe("publish success", () => {
  const successArgs = {
    status: "success",
    inputs: { repo: "sentry", version: "21.3.1" },
    context: {
      runId: "1234",
      repo: { owner: "getsentry", repo: "publish" },
      payload: { issue: { number: "211" } },
    },
    octokit: {
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
          update: jest.fn(),
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

  test("create comment", async () => {
    await processEndState(successArgs);

    const createComment = successArgs.octokit.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "body": "Published successfully: [run#1234](https://github.com/getsentry/sentry/actions/runs/1234)",
        "issue_number": "211",
        "owner": "getsentry",
        "repo": "publish",
      }
    `);

    const updateIssue = successArgs.octokit.rest.issues.update;
    expect(updateIssue).toHaveBeenCalledTimes(1);
    expect(updateIssue.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "issue_number": "211",
        "owner": "getsentry",
        "repo": "publish",
        "state": "closed",
      }
    `);
  });
});

describe("publish unknown status", () => {
  const nostatusArgs = {
    inputs: { repo: "sentry", version: "21.3.1" },
    context: {
      runId: "1234",
      repo: { owner: "getsentry", repo: "publish" },
      payload: { issue: { number: "211" } },
    },
    octokit: {
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
          update: jest.fn(),
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

  test("throw error for undefined status", async () => {
    expect(async () => {
      await processEndState(nostatusArgs);
    }).rejects.toThrow("Unknown status: 'undefined'");

    const createComment = nostatusArgs.octokit.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(0);

    const updateIssue = nostatusArgs.octokit.rest.issues.update;
    expect(updateIssue).toHaveBeenCalledTimes(0);
  });
});