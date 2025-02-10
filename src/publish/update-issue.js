const { updateIssue } = require("../modules/update-issue.js");
const { getGitHubToken } = require("../libs/github");
const github = require("@actions/github");

const context = github.context;
const octokit = github.getOctokit(getGitHubToken());
const inputs = JSON.parse(process.env.PUBLISH_ARGS);

updateIssue({ context, octokit, inputs });
