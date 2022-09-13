/* eslint-env jest */

jest.mock("fs");

const retractRelease = require("../retract-release.js");

describe("retract release", () => {
  test("comment and close issue", async () => {
    const retractArgs = {
      inputs: { repo: "sentry", version: "21.3.1" },
      context: {
        repo: { owner: "getsentry", repo: "publish" },
        payload: {
          sender: { login: "example-user" },
          issue: { number: "211" },
        },
      },
      octokit: {
        rest: {
          issues: {
            createComment: jest.fn(),
            update: jest.fn(),
          },
        },
      },
    };

    await retractRelease(retractArgs);

    const commentMock = retractArgs.octokit.rest.issues.createComment;
    expect(commentMock).toHaveBeenCalledTimes(1);
    expect(commentMock.mock.calls[0][0]).toEqual({
      body: `Release request retracted by @example-user.
You may also want to remove your [release branch](https://github.com/getsentry/sentry/branches/all?query=21.3.1).`,
      issue_number: "211",
      owner: "getsentry",
      repo: "publish",
    });

    const updateMock = retractArgs.octokit.rest.issues.update;
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toEqual({
      issue_number: "211",
      state: "closed",
      owner: "getsentry",
      repo: "publish",
    });
  });
});