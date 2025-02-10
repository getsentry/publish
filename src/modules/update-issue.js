const fs = require("fs");
const {
  TARGETS_SECTION_PARSER_REGEX,
  TARGETS_PARSER_REGEX,
} = require("./details-from-context");

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

  const newIssueBody = transformIssueBody(craftState, issue.body);

  await octokit.rest.issues.update({
    ...publishRepo,
    issue_number,
    body: newIssueBody,
  });
}

function transformIssueBody(craftState, issueBody) {
  const declaredTargets = new Set();
  return issueBody.replace(
    TARGETS_SECTION_PARSER_REGEX,
    (targetsSection) => {
      let targetsText = targetsSection.trimRight();
      targetsText = targetsText.replace(
        TARGETS_PARSER_REGEX,
        (_match, targetId) => {
          declaredTargets.add(targetId);
          const x = craftState.published[targetId] ? "x" : " ";
          return `- [${x}] ${targetId}`;
        }
      );
      const unlistedTargets = Object.keys(craftState.published)
        .filter((target) => !declaredTargets.has(target))
        .map(
          (target) =>
            `- [${craftState.published[target] ? "x" : " "}] ${target}`
        )
        .join("\n") + '\n';
      targetsText += `\n${unlistedTargets}\n`;
      return targetsText;
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
}

module.exports = { updateIssue, transformIssueBody };
