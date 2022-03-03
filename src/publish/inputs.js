exports.default = async function inputs({ context }) {
  const titleParser = /^publish: (?:getsentry\/)?(?<repo>[^/@]+)(?<path>\/[\w./-]+)?@(?<version>[\w.-]+)$/;
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

  const targetsParser = /^(?!### Targets$\s)(?: *- \[[ x]\] [\w.[\]-]+$(?:\r?\n)?)+/m;
  const targetsMatch = context.payload.issue.body.match(targetsParser);
  let targets;
  if (targetsMatch) {
    const targetMatcher = /^ *- \[x\] ([\w.[\]-]+)$(?:\r?\n)?/gim;
    targets = Array.from(targetsMatch[0].matchAll(targetMatcher)).map(
      (x) => x[1]
    );
  }

  return {
    ...titleMatch,
    dry_run,
    merge_target,
    path,
    requester,
    targets,
  };
};
