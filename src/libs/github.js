/**
 * This is a helper function that throws a useful error message if the
 * workflow environment is not configured correctly.
 *
 * @returns string
 */
function getGitHubToken() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('No "GITHUB_TOKEN" environment variable found. ' +
    'Please ensure the workflow is configured correctly');
  }
  return process.env.GITHUB_TOKEN;
}

module.exports = {
  getGitHubToken,
};
