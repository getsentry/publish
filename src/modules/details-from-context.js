/**
 * Matches the entire "Targets" section of a github publish issue body.
 */
const TARGETS_SECTION_PARSER_REGEX = /^(?!### Targets$\s)(?: *- \[[ x]\] \S+\s*$(?:\r?\n)?)+/im;

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
    throw new Error('Issue context is not defined');
  }

  const titleParser = /^publish: (?:getsentry\/)?(?<repo>[^/@]+)(?<path>\/[\w./-]+)?@(?<version>[\w.+-]+)$/;
  const titleMatch = context.payload.issue.title.match(titleParser).groups;
  const dry_run = context.payload.issue.labels.some((l) => l.name === "dry-run")
    ? "1"
    : "";
  const path = "." + (titleMatch.path || "");

  // - May only contain alphanumeric characters and hyphens.
  // - Cannot have multiple consecutive hyphens.
  // - Cannot begin or end with a hyphen.
  // - Maximum 39 characters.
  const requesterParser = /^Requested by: @(?<requester>[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38})$/m;
  const { requester } = context.payload.issue.body.match(
    requesterParser
  ).groups;

  // https://docs.github.com/en/get-started/using-git/dealing-with-special-characters-in-branch-and-tag-names#naming-branches-and-tags
  const mergeTargetParser = /^Merge target: (?<merge_target>[\w.\-/]+)$/m;
  const mergeTargetMatch = context.payload.issue.body.match(mergeTargetParser);
  let merge_target = "";
  if (mergeTargetMatch && mergeTargetMatch.groups) {
    merge_target = mergeTargetMatch.groups.merge_target || "";
  }

  const targetsMatch = context.payload.issue.body.match(TARGETS_SECTION_PARSER_REGEX);
  let targets;
  if (targetsMatch) {
    targets = Array.from(
      targetsMatch[0].matchAll(CHECKED_TARGETS_PARSER_REGEX)
    ).map((x) => x[1]);
  }

  return {
    ...titleMatch,
    dry_run,
    merge_target,
    path,
    requester,
    targets,
  };
}

module.exports = {
  detailsFromContext,
  TARGETS_SECTION_PARSER_REGEX,
  TARGETS_PARSER_REGEX,
  CHECKED_TARGETS_PARSER_REGEX,
};
