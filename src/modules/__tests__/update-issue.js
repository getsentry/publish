import { vi, describe, test, expect, beforeAll, beforeEach, it } from "vitest";
import fs from "fs";

const { updateIssue, transformIssueBody } = require("../update-issue.js");

let mockExistsSync;

const updateTargetsArgs = {
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
        get: vi.fn(),
        update: vi.fn(),
        removeLabel: vi.fn(),
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

beforeAll(() => {
  process.env.GITHUB_WORKSPACE = ".";
  mockExistsSync = vi.spyOn(fs, "existsSync");
  vi.spyOn(fs.promises, "readFile").mockResolvedValue(
    JSON.stringify({ published: { lol: true, hey: false, github: true } })
  );

  updateTargetsArgs.octokit.rest.issues.get.mockReturnValue({
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

describe.each([false, true])("state file exists: %s", (stateFileExists) => {
  beforeEach(async () => {
    mockExistsSync.mockReturnValue(stateFileExists);
    await updateIssue(updateTargetsArgs);
    expect(mockExistsSync).toHaveBeenCalledTimes(1);
    // This is process.env.GITHUB_WORKSPACE + / filename
    expect(mockExistsSync).toHaveBeenCalledWith(
      "./__repo__/.craft-publish-21.3.1.json"
    );
  });

  if (stateFileExists) {
    test("restore publish state", async () => {
      expect(updateTargetsArgs.octokit.rest.issues.get).toHaveBeenCalledTimes(
        1
      );
      expect(updateTargetsArgs.octokit.rest.issues.get.mock.calls[0]).toEqual([
        {
          issue_number: "211",
          owner: "getsentry",
          repo: "publish",
        },
      ]);

      expect(
        updateTargetsArgs.octokit.rest.issues.update
      ).toHaveBeenCalledTimes(1);

      const updateCall =
        updateTargetsArgs.octokit.rest.issues.update.mock.calls[0][0];
      expect(updateCall.issue_number).toBe("211");
      expect(updateCall.owner).toBe("getsentry");
      expect(updateCall.repo).toBe("publish");
      // Verify the body contains the expected target states
      expect(updateCall.body).toContain("- [x] github");
      expect(updateCall.body).toContain("- [ ] pypi");
      expect(updateCall.body).toContain("- [x] lol");
      expect(updateCall.body).toContain("- [ ] hey");
    });
  } else {
    test("don't modify issue body", () => {
      expect(
        updateTargetsArgs.octokit.rest.issues.update
      ).not.toHaveBeenCalled();
    });
  }

  test("remove label", async () => {
    const removeLabel = updateTargetsArgs.octokit.rest.issues.removeLabel;
    expect(removeLabel).toHaveBeenCalledTimes(1);
    expect(removeLabel).toHaveBeenCalledWith({
      owner: "getsentry",
      repo: "publish",
      issue_number: "211",
      name: "accepted",
    });
  });
});

describe("transformIssueBody", () => {
  it("should correctly transform an issue body", () => {
    const result = transformIssueBody(
      {
        published: {
          "npm[@sentry/node]": true,
          "aws-lambda": true,
          github: false,
          foo: true,
        },
      },
      `Requested by: @lforst

Merge target: (default)

Quick links:
- [View changes](https://github.com/getsentry/sentry-elixir/compare/2f5876adf89822cc75199576966df4fd587f68e9...refs/heads/release/10.7.2)
- [View check runs](https://github.com/getsentry/sentry-elixir/commit/fcbc69b88481a95532d10a6162a243107fabb96a/checks/)
Assign the **accepted** label to this issue to approve the release.
To retract the release, the person requesting it must leave a comment containing \`#retract\` on a line by itself under this issue.

### Targets

 - [ ] npm[@sentry/node]
 - [x] aws-lambda
 - [x] github


Targets marked with a checkbox have already been executed.  Administrators can manually tick a checkbox to force craft to skip it.\n`
    );

    expect(result).toBe(`Requested by: @lforst

Merge target: (default)

Quick links:
- [View changes](https://github.com/getsentry/sentry-elixir/compare/2f5876adf89822cc75199576966df4fd587f68e9...refs/heads/release/10.7.2)
- [View check runs](https://github.com/getsentry/sentry-elixir/commit/fcbc69b88481a95532d10a6162a243107fabb96a/checks/)
Assign the **accepted** label to this issue to approve the release.
To retract the release, the person requesting it must leave a comment containing \`#retract\` on a line by itself under this issue.

### Targets

- [x] npm[@sentry/node]
- [x] aws-lambda
- [ ] github
- [x] foo

Targets marked with a checkbox have already been executed.  Administrators can manually tick a checkbox to force craft to skip it.\n`);
  });
});
