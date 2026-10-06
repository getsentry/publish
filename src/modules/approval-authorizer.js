const fs = require("fs");
const path = require("path");

const { isPublishPath } = require("./publish-location");
const { isPublishRepository } = require("./publish-issue-validation");

const AUTO_APPROVAL_LABELER = "sentry-internal-app[bot]";
const AUTO_APPROVAL_TARGETS = new Set(
  fs
    .readFileSync(
      path.resolve(__dirname, "../../auto-approve-repos.txt"),
      "utf8"
    )
    .split(/\r?\n/)
    .filter(Boolean)
);
// Sentry-operated release bots that may approve publish requests for any
// valid getsentry publish target. Any other bot is still rejected.
const TRUSTED_APPROVER_BOTS = new Set(["sentry-junior[bot]"]);

async function authorizeApproval({
  actor,
  repository,
  publishPath = ".",
  getPermission,
}) {
  if (!isPublishRepository(repository)) {
    return { authorized: false, repository: null };
  }

  const fullRepository = `getsentry/${repository}`;
  if (!isPublishPath(publishPath)) {
    return { authorized: false, repository: fullRepository };
  }
  if (actor === AUTO_APPROVAL_LABELER) {
    const pathSuffix = publishPath === "." ? "" : publishPath.slice(1);
    return {
      authorized: AUTO_APPROVAL_TARGETS.has(`${fullRepository}${pathSuffix}`),
      repository: fullRepository,
    };
  }

  if (TRUSTED_APPROVER_BOTS.has(actor)) {
    return {
      authorized: true,
      repository: fullRepository,
    };
  }

  if (typeof actor !== "string" || /\[bot\]$/i.test(actor)) {
    return { authorized: false, repository: fullRepository };
  }

  const permission = await getPermission({
    owner: "getsentry",
    repository,
    username: actor,
  });
  const hasWriteAccess =
    permission.permission === "write" || permission.permission === "admin";
  return {
    authorized: hasWriteAccess,
    repository: fullRepository,
  };
}

module.exports = {
  AUTO_APPROVAL_LABELER,
  TRUSTED_APPROVER_BOTS,
  authorizeApproval,
};
