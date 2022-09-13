const github = require('@actions/github');
const retract = require('../modules/retract-release');

const context = github.context;
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const inputs = JSON.parse(process.env.PUBLISH_ARGS);

retract({context, octokit, inputs});