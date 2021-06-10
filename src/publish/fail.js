const fs = require("fs");

exports.default = async function fail({context, github, inputs}) {
  const {repo, version} = inputs;

  const repoInfo = context.repo;
  const workflowInfo = (
    await github.actions.getWorkflowRun({
      ...repoInfo,
      run_id: context.runId,
    })
  ).data;
  const issue_number = context.payload.issue.number;

  const CRAFT_STATE_FILE_PATH = `${process.env.GITHUB_WORKSPACE}/__repo__/.craft-publish-${version}.json`;
  let updateIssueBodyRequest;
  if (fs.existsSync(CRAFT_STATE_FILE_PATH)) {
    const issueRequest = github.issues.get({
      ...repoInfo,
      issue_number,
    });

    const craftStateRequest = fs.promises
      .readFile(CRAFT_STATE_FILE_PATH, {encoding: "utf-8"})
      .then((data) => JSON.parse(data));

    const [{data: issue}, craftState] = await Promise.all([
      issueRequest,
      craftStateRequest,
    ]);

    const targetsParser = /^(?!### Targets$\s)^(?: *- \[[ x]\] [\w.\[\]-]+[ ]*$(?:\r?\n)?)+/m;
    const declaredTargets = new Set();
    let leadingSpaces = " ";
    const newIssueBody = issue.body.replace(targetsParser, (targetsSection) => {
      let targetsText = targetsSection.trimRight();
      const targetMatcher = /^( *)- \[[ x]\] ([\w.\[\]-]+)$/gim;
      targetsText = targetsText.replace(
        targetMatcher,
        (_match, spaces, target) => {
          leadingSpaces = spaces;
          declaredTargets.add(target);
          const x = craftState.published[target] ? "x" : " ";
          return `${spaces}- [${x}] ${target}`;
        },
      );
      const unlistedTargets = Object.keys(craftState.published)
        .filter((target) => !declaredTargets.has(target))
        .map(
          (target) =>
            `${leadingSpaces}- [${
              craftState.published[target] ? "x" : " "
            }] ${target}`,
        )
        .join("\n");
      targetsText += `\n${unlistedTargets}\n`;
      return targetsText;
    });

    updateIssueBodyRequest = github.issues.update({
      ...repoInfo,
      issue_number,
      body: newIssueBody,
    });
  } else {
    updateIssueBodyRequest = Promise.resolve();
  }

  await Promise.all([
    updateIssueBodyRequest,
    github.issues.createComment({
      ...repoInfo,
      issue_number,
      body: `Failed to publish: [run#${context.runId}](${
        workflowInfo.html_url
      })\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version,
      )}) and start over._`,
    }),
    github.issues.removeLabel({
      ...repoInfo,
      issue_number,
      name: "accepted",
    }),
  ]);
};
