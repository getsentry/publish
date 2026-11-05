import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("fs");

const core = require("@actions/core");
const processEndState = require("../process-end-state.js");

function statusResponse(incidents) {
  return { ok: true, status: 200, json: async () => ({ incidents }) };
}

beforeEach(() => {
  vi.spyOn(core, "warning").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => statusResponse([]))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
          createComment: vi.fn(),
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
      {
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
          createComment: vi.fn(),
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
      {
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
          createComment: vi.fn(),
          update: vi.fn(),
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
      {
        "body": "Published successfully: [run#1234](https://github.com/getsentry/sentry/actions/runs/1234)",
        "issue_number": "211",
        "owner": "getsentry",
        "repo": "publish",
      }
    `);

    const updateIssue = successArgs.octokit.rest.issues.update;
    expect(updateIssue).toHaveBeenCalledTimes(1);
    expect(updateIssue.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
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
          createComment: vi.fn(),
          update: vi.fn(),
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
    await expect(async () => {
      await processEndState(nostatusArgs);
    }).rejects.toThrow("Unknown status: 'undefined'");

    const createComment = nostatusArgs.octokit.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(0);

    const updateIssue = nostatusArgs.octokit.rest.issues.update;
    expect(updateIssue).toHaveBeenCalledTimes(0);
  });
});

describe("GitHub incidents in the result comment", () => {
  const runStartedAt = "2026-11-05T14:00:00Z";

  function argsFor(status) {
    return {
      status,
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
                html_url:
                  "https://github.com/getsentry/sentry/actions/runs/1234",
                run_started_at: runStartedAt,
              },
            }),
          },
          issues: {
            createComment: vi.fn(),
            update: vi.fn(),
          },
        },
      },
    };
  }

  const incidents = [
    {
      name: "Incident with Actions\nand Pages",
      status: "investigating",
      components: [{ name: "Actions" }, { name: "Pages" }],
      shortlink: "https://stspg.io/open",
      started_at: "2026-11-05T14:30:00Z",
      created_at: "2026-11-05T14:31:00Z",
      resolved_at: null,
    },
    {
      name: "Disruption with Git Operations",
      status: "resolved",
      components: [],
      shortlink: "https://stspg.io/during",
      created_at: "2026-11-05T13:00:00Z",
      resolved_at: "2026-11-05T14:10:00Z",
    },
    {
      name: "Old incident",
      status: "resolved",
      components: [{ name: "Issues" }],
      shortlink: "https://stspg.io/old",
      started_at: "2026-11-04T09:00:00Z",
      resolved_at: "2026-11-04T10:00:00Z",
    },
  ];

  function commentBody(args) {
    const createComment = args.octokit.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(1);
    return createComment.mock.calls[0][0].body;
  }

  test("lists incidents that overlap the run on failure", async () => {
    fetch.mockResolvedValue(statusResponse(incidents));
    const args = argsFor("failure");

    await processEndState(args);

    expect(fetch).toHaveBeenCalledWith(
      "https://www.githubstatus.com/api/v2/incidents.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(commentBody(args)).toMatchInlineSnapshot(`
      "Failed to publish. ([run logs](https://github.com/getsentry/sentry/actions/runs/1234?check_suite_focus=true#step:8))

      _Bad branch? You can [delete with ease](https://github.com/getsentry/sentry/branches/all?query=21.3.1) and start over._

      **GitHub incidents during this run** ([githubstatus.com](https://www.githubstatus.com)):
      - [Incident with Actions and Pages](https://stspg.io/open) (investigating; Actions, Pages; started 2026-11-05T14:30:00Z)
      - [Disruption with Git Operations](https://stspg.io/during) (resolved; no components; started 2026-11-05T13:00:00Z, resolved 2026-11-05T14:10:00Z)"
    `);
  });

  test("lists incidents on cancellation", async () => {
    fetch.mockResolvedValue(statusResponse(incidents));
    const args = argsFor("cancelled");

    await processEndState(args);

    expect(commentBody(args)).toContain("**GitHub incidents during this run**");
  });

  test("adds no section when there are no incidents", async () => {
    fetch.mockResolvedValue(statusResponse([incidents[2]]));
    const args = argsFor("failure");

    await processEndState(args);

    expect(commentBody(args)).not.toContain("GitHub incidents");
  });

  test("posts the comment without the section when githubstatus.com fails", async () => {
    fetch.mockRejectedValue(
      new Error("The operation was aborted due to timeout")
    );
    const args = argsFor("failure");

    await processEndState(args);

    expect(commentBody(args)).not.toContain("GitHub incidents");
    expect(core.warning).toHaveBeenCalledWith(
      "Could not read GitHub status incidents: The operation was aborted due to timeout"
    );
  });

  test("posts the comment without the section on an HTTP error", async () => {
    fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const args = argsFor("failure");

    await processEndState(args);

    expect(commentBody(args)).not.toContain("GitHub incidents");
    expect(core.warning).toHaveBeenCalledWith(
      "Could not read GitHub status incidents: githubstatus.com returned HTTP 503"
    );
  });

  test("does not read githubstatus.com on success", async () => {
    const args = argsFor("success");

    await processEndState(args);

    expect(fetch).not.toHaveBeenCalled();
    expect(commentBody(args)).not.toContain("GitHub incidents");
  });
});
