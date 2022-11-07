/* eslint-env jest */

jest.mock("fs");

const {getGitHubToken} = require("../github.js");

describe("getGitHubToken", () => {
  test("throw if no token is defined", async () => {
    delete process.env.GITHUB_TOKEN
    expect(() => getGitHubToken()).toThrow('No "GITHUB_TOKEN" environment variable found.')
  });

  test("return token if defined", async () => {
    process.env.GITHUB_TOKEN = "Example Token"
    expect(getGitHubToken()).toEqual("Example Token")
  });
});
