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
// GitHub actor IDs are stable across login changes. Pin both the login and ID
// observed on the accepted-label events for these Sentry-operated bots.
// Junior may approve any valid target; getsantry is limited to auto-approved
// repository/path pairs. Any other bot is still rejected.
const TRUSTED_APPROVER_BOTS = new Map([
  ["sentry-junior[bot]", { id: 264270552, targets: null }],
  ["getsantry[bot]", { id: 66042841, targets: AUTO_APPROVAL_TARGETS }],
]);

async function authorizeApproval({
  actor,
  actorId,
  actorType,
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
  const pathSuffix = publishPath === "." ? "" : publishPath.slice(1);
  const target = `${fullRepository}${pathSuffix}`;
  if (actor === AUTO_APPROVAL_LABELER) {
    return {
      authorized: AUTO_APPROVAL_TARGETS.has(target),
      repository: fullRepository,
    };
  }

  const trustedBot = TRUSTED_APPROVER_BOTS.get(actor);
  if (trustedBot) {
    return {
      authorized:
        actorType === "Bot" &&
        String(actorId) === String(trustedBot.id) &&
        (trustedBot.targets === null || trustedBot.targets.has(target)),
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
