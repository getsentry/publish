import { vi, describe, test, expect } from "vitest";

vi.mock("fs");

const postWorkflowDetails = require("../post-workflow-details.js");

describe("postWorkflowDetails", () => {
  test("create comment with workflow details", async () => {
    const args = {
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
              },
            }),
          },
          issues: {
            createComment: vi.fn(),
          },
        },
      },
    };

    await postWorkflowDetails(args);

    const createComment = args.octokit.rest.issues.createComment;
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(createComment.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "body": "Publishing: [run#1234](https://github.com/getsentry/sentry/actions/runs/1234)",
        "issue_number": "211",
        "owner": "getsentry",
        "repo": "publish",
      }
    `);
  });
});
