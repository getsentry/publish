const processEndState = require('../modules/process-end-state');
const {getGitHubToken} = require('../libs/github');
const github = require('@actions/github');

const context = github.context;
const octokit = github.getOctokit(getGitHubToken());
const inputs = JSON.parse(process.env.PUBLISH_ARGS);
const args = process.argv.slice(2);
const status = args[0];

processEndState({context, octokit, inputs, status});
