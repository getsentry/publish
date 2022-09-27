const postWorkflowDetails = require('../modules/post-workflow-details.js');
const {getGitHubToken} = require('../libs/github');
const github = require('@actions/github');

const context = github.context;
const octokit = github.getOctokit(getGitHubToken());

postWorkflowDetails({context, octokit});
