const processEndState = require('../modules/process-end-state');
const github = require('@actions/github');

const context = github.context;
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const inputs = JSON.parse(process.env.PUBLISH_ARGS);
const args = process.argv.slice(2);
const status = args[0];

processEndState({context, octokit, inputs, status});