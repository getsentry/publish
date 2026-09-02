const { parse: parsePublishIssueTitle } = require("./publish-issue-title");

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
  const { workspace: workspaceJson, ...parsedTitleDetails } = titleDetails;
  let workspace = "";
  if (workspaceJson) {
    try {
      workspace = JSON.parse(workspaceJson);
    } catch {
      throw new Error(
        `Invalid publish workspace JSON in title: '${context.payload.issue.title}'`
      );
    }
    if (!workspace || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(workspace)) {
      throw new Error(
        "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
      );
    }
  }
  const dry_run = context.payload.issue.labels.some((l) => l.name === "dry-run")
    ? "1"
    : "";
  const path = "." + parsedTitleDetails.path;
  if (path.split("/").includes("..")) {
    throw new Error(`Invalid publish issue path: '${path}'`);
  }
  if (workspace && path !== ".") {
    throw new Error("A publish workspace must use the repository root path.");
  }

  // https://docs.github.com/en/get-started/using-git/dealing-with-special-characters-in-branch-and-tag-names#naming-branches-and-tags
  const mergeTargetParser = /^Merge target: (?<merge_target>[\w.\-/]+)$/m;
  const mergeTargetMatch = context.payload.issue.body.match(mergeTargetParser);
  let merge_target = "";
  if (mergeTargetMatch && mergeTargetMatch.groups) {
    merge_target = mergeTargetMatch.groups.merge_target || "";
  }

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
    ...parsedTitleDetails,
    dry_run,
    merge_target,
    path,
    targets,
    ...(workspace ? { workspace } : {}),
  };
}

module.exports = {
  detailsFromContext,
  TARGETS_SECTION_PARSER_REGEX,
  TARGETS_PARSER_REGEX,
  CHECKED_TARGETS_PARSER_REGEX,
};
