const postWorkflowDetails = require('../modules/post-workflow-details.js');
const github = require('@actions/github');

const context = github.context;
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

postWorkflowDetails({context, octokit});
