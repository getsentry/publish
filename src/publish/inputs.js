const github = require('@actions/github');
const core = require('@actions/core');
const detailsFromContext = require('../modules/details-from-context');

async function inputs() {
    const result = await detailsFromContext({
      context: github.context,
    });
    core.setOutput('result', result);
}


inputs();