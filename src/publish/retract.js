const github = require('@actions/github');
const retract = require('../modules/retract-release');
const {getGitHubToken} = require('../libs/github');

const context = github.context;
const octokit = github.getOctokit(getGitHubToken());
const inputs = JSON.parse(process.env.PUBLISH_ARGS);

retract({context, octokit, inputs});
