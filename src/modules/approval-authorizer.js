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
// Sentry-operated release bots that may approve publish requests for the
// specific repositories they manage. Each bot is scoped to an explicit target
// list; any other repository or bot is still rejected.
const TRUSTED_APPROVER_BOTS = new Map([
  [
    "sentry-junior[bot]",
    new Set([
      "getsentry/junior",
      "getsentry/scm-platform",
      "getsentry/sentry-mcp",
      "getsentry/sentry-starlight-theme",
      "getsentry/vitest-evals",
      "getsentry/warden",
    ]),
  ],
]);

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
      authorized: TRUSTED_APPROVER_BOTS.get(actor).has(fullRepository),
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
