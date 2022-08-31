const fs = require("fs");

async function updateIssue() {
  const context = github.context;
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
  const { version } = JSON.parse(process.env.PUBLISH_ARGS);

  const { repo: publishRepo } = context;
  const { number: issue_number } = context.payload.issue;

  const CRAFT_STATE_FILE_PATH = `${process.env.GITHUB_WORKSPACE}/__repo__/.craft-publish-${version}.json`;
  let updateIssueBodyRequest;

  if (fs.existsSync(CRAFT_STATE_FILE_PATH)) {
    const issueRequest = octokit.rest.issues.get({
      ...publishRepo,
      issue_number,
    });

    const craftStateRequest = fs.promises
      .readFile(CRAFT_STATE_FILE_PATH, { encoding: "utf-8" })
      .then((data) => JSON.parse(data));

    const [{ data: issue }, craftState] = await Promise.all([
      issueRequest,
      craftStateRequest,
    ]);

    const targetsParser = /^(?!### Targets$\s)^(?: *- \[[ x]\] [\w.[\]-]+[ ]*$(?:\r?\n)?)+/m;
    const declaredTargets = new Set();
    let leadingSpaces = " ";
    const newIssueBody = issue.body.replace(targetsParser, (targetsSection) => {
      let targetsText = targetsSection.trimRight();
      const targetMatcher = /^( *)- \[[ x]\] ([\w.[\]-]+)$/gim;
      targetsText = targetsText.replace(
        targetMatcher,
        (_match, spaces, target) => {
          leadingSpaces = spaces;
          declaredTargets.add(target);
          const x = craftState.published[target] ? "x" : " ";
          return `${spaces}- [${x}] ${target}`;
        }
      );
      const unlistedTargets = Object.keys(craftState.published)
        .filter((target) => !declaredTargets.has(target))
        .map(
          (target) =>
            `${leadingSpaces}- [${
              craftState.published[target] ? "x" : " "
            }] ${target}`
        )
        .join("\n");
      targetsText += `\n${unlistedTargets}\n`;
      return targetsText;
    });

    updateIssueBodyRequest = octokit.rest.issues.update({
      ...publishRepo,
      issue_number,
      body: newIssueBody,
    });
  } else {
    updateIssueBodyRequest = Promise.resolve();
  }

  await Promise.all([
    updateIssueBodyRequest,
    octokit.rest.issues.removeLabel({
      ...publishRepo,
      issue_number,
      name: "accepted",
    }),
  ]);
}
updateIssue();