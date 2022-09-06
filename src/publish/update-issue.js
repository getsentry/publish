const updateIssue = require('../modules/update-issue.js');
const github = require('@actions/github');

const context = github.context;
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const inputs = JSON.parse(process.env.PUBLISH_ARGS);

updateIssue({ context, octokit, inputs });
