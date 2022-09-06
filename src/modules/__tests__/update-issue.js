/* eslint-env jest */

jest.mock("fs");

const fs = require("fs");
const updateIssue = require("../update-issue.js");

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
        get: jest.fn(),
        update: jest.fn(),
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
};

beforeAll(() => {
  process.env.GITHUB_WORKSPACE = ".";
  fs.promises = {};
  fs.promises.readFile = jest.fn(async () =>
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
    fs.existsSync = jest.fn(() => stateFileExists);
    await updateIssue(updateTargetsArgs);
    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    // This is process.env.GITHUB_WORKSPACE + / filename
    expect(fs.existsSync).toHaveBeenCalledWith(
      "./__repo__/.craft-publish-21.3.1.json"
    );
  });

  if (stateFileExists) {
    test("restore publish state", async () => {
      expect(updateTargetsArgs.octokit.rest.issues.get).toHaveBeenCalledTimes(1);
      expect(updateTargetsArgs.octokit.rest.issues.get.mock.calls[0])
        .toMatchInlineSnapshot(`
        Array [
          Object {
            "issue_number": "211",
            "owner": "getsentry",
            "repo": "publish",
          },
        ]
      `);

      expect(updateTargetsArgs.octokit.rest.issues.update).toHaveBeenCalledTimes(
        1
      );
      expect(updateTargetsArgs.octokit.rest.issues.update.mock.calls[0])
        .toMatchInlineSnapshot(`
        Array [
          Object {
            "body": "
        Requested by: @BYK

        Merge target: (default)

        Quick links:
        - [View changes](https://github.com/getsentry/sentry/compare/21.3.0...refs/heads/releases/21.3.1)
        - [View check runs](https://github.com/getsentry/sentry/commit/7e5ca7ed5581552de066e2a8bc295b8306be38ac/checks/)

        Assign the **accepted** label to this issue to approve the release.

        ### Targets
        - [x] github
        - [ ] pypi
        - [ ] docker[release]
        - [ ] docker[latest]
        - [x] lol
        - [ ] hey
        ",
            "issue_number": "211",
            "owner": "getsentry",
            "repo": "publish",
          },
        ]
      `);
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
