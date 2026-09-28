const { parse: parsePublishIssueTitle } = require("./publish-issue-title");
const { getReleaseRevisionDetails } = require("./release-revision");
const { isPublishPath } = require("./publish-location");
const {
  isPublishRepository,
  isReleaseVersion,
} = require("./publish-issue-validation");

/**
 * Matches the entire "Targets" section of a github publish issue body.
 */
const TARGETS_SECTION_PARSER_REGEX =
  /^(?!### Targets$\s)(?: *- \[[ xX]\] \S+\s*$(?:\r?\n)?)+/m;

/**
 * Matches all targets of a github publish issue body in a section that was already matched and extracted with `TARGETS_PARSER_REGEX`.
 * The "id" of the targets is captured within a capture group.
 */
const TARGETS_PARSER_REGEX = /^\s*- \[[ x]\] (\S+)/gim;

/**
 * Matches checked targets of a github publish issue body in a section that was already matched and extracted with `TARGETS_PARSER_REGEX`.
 * The "id" of the targets is captured within a capture group.
 */
const CHECKED_TARGETS_PARSER_REGEX = /^\s*- \[x\] (\S+)/gim;

function parsePublishTitle(title) {
  try {
    const titleDetails = parsePublishIssueTitle(title);
    const path = "." + titleDetails.path;

    if (
      !isPublishRepository(titleDetails.repo) ||
      !isReleaseVersion(titleDetails.version) ||
      !isPublishPath(path)
    ) {
      return null;
    }

    return titleDetails;
  } catch {
    return null;
  }
}

async function detailsFromContext({ context }) {
  if (!context || !context.payload || !context.payload.issue) {
    throw new Error("Issue context is not defined");
  }

  let titleDetails;
  try {
    titleDetails = parsePublishIssueTitle(context.payload.issue.title);
  } catch {
    throw new Error(
      `Invalid publish issue title: '${context.payload.issue.title}'`
    );
  }
  if (!isPublishRepository(titleDetails.repo)) {
    throw new Error(`Invalid publish issue repository: '${titleDetails.repo}'`);
  }
  if (!isReleaseVersion(titleDetails.version)) {
    throw new Error(`Invalid publish issue version: '${titleDetails.version}'`);
  }
  const dry_run = context.payload.issue.labels.some((l) => l.name === "dry-run")
    ? "1"
    : "";
  const path = "." + titleDetails.path;
  if (!isPublishPath(path)) {
    throw new Error(`Invalid publish issue path: '${path}'`);
  }

  const { mergeTarget } = getReleaseRevisionDetails({
    issueBody: context.payload.issue.body || "",
    repo: titleDetails.repo,
  });

  const targetsMatch = context.payload.issue.body.match(
    TARGETS_SECTION_PARSER_REGEX
  );
  let targets;
  if (targetsMatch) {
    targets = Array.from(
      targetsMatch[0].matchAll(CHECKED_TARGETS_PARSER_REGEX)
    ).map((x) => x[1]);
  }

  return {
    ...titleDetails,
    dry_run,
    merge_target: mergeTarget === "(default)" ? "" : mergeTarget,
    path,
    targets,
  };
}

module.exports = {
  detailsFromContext,
  TARGETS_SECTION_PARSER_REGEX,
  TARGETS_PARSER_REGEX,
  CHECKED_TARGETS_PARSER_REGEX,
  parsePublishTitle,
};
