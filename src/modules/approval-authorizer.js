const ALLOWED_ROLE_NAMES = new Set(["write", "maintain", "admin"]);
const { parsePublishTitle } = require("./details-from-context.js");

const AUTO_APPROVAL_LABELER = "sentry-internal-app[bot]";
const AUTO_APPROVERS = new Set(["getsantry[bot]", "sentry-release-bot[bot]"]);

function isAutoApprovedRepository({
  actor,
  autoApprovedRepositories,
  issueTitle,
}) {
  if (!AUTO_APPROVERS.has(actor)) {
    return false;
  }

  const title = parsePublishTitle(issueTitle);

  if (!title) {
    return false;
  }

  return autoApprovedRepositories.has(
    `getsentry/${title.repo}${title.path || ""}`
  );
}

async function authorizeApproval({ actor, issueTitle, getPermission }) {
  const title = parsePublishTitle(issueTitle);

  if (!title) {
    return { authorized: false, repository: null };
  }

  const repository = `getsentry/${title.repo}`;
  if (
    AUTO_APPROVERS.has(actor) ||
    actor === AUTO_APPROVAL_LABELER ||
    (typeof actor === "string" && /\[bot\]$/i.test(actor))
  ) {
    return { authorized: false, repository };
  }

  const { role_name } = await getPermission({
    owner: "getsentry",
    repository: title.repo,
    username: actor,
  });

  return { authorized: ALLOWED_ROLE_NAMES.has(role_name), repository };
}

module.exports = {
  AUTO_APPROVAL_LABELER,
  AUTO_APPROVERS,
  authorizeApproval,
  isAutoApprovedRepository,
};
