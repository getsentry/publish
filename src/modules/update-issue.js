const fs = require("fs");

async function updateTargets({octokit, version, publishRepo, issue_number}) {
  const CRAFT_STATE_FILE_PATH = `${process.env.GITHUB_WORKSPACE}/__repo__/.craft-publish-${version}.json`;

  if (!fs.existsSync(CRAFT_STATE_FILE_PATH)) {
    return;
  }

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

  await octokit.rest.issues.update({
    ...publishRepo,
    issue_number,
    body: newIssueBody,
  });
}

async function updateIssue({ context, octokit, inputs }) {
  const { version } = inputs;
  const { repo: publishRepo } = context;
  const { number: issue_number } = context.payload.issue;

  await Promise.all([
    updateTargets({octokit, version, publishRepo, issue_number}),
    octokit.rest.issues.removeLabel({
      ...publishRepo,
      issue_number,
      name: "accepted",
    }),
  ]);
};

module.exports = updateIssue;