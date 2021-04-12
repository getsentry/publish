export default async function inputs({context}) {
  const titleParser = /^publish: (?:getsentry\/)?(?<repo>[^/@]+)(?<path>\/[\w./-]+)?@(?<version>[\w.-]+)$/;
  const titleMatch = context.payload.issue.title.match(titleParser).groups;
  const dry_run = context.payload.issue.labels.some((l) => l.name === "dry-run")
    ? "1"
    : "";
  const path = "." + (titleMatch.path || "");

  const targetsParser = /^### Targets$\s((?: *- \[[ x]\] [\w.\[\]-]+$\n?)+)/m;
  const targetsMatch = context.payload.issue.body.match(targetsParser);
  let targets;
  if (targetsMatch) {
    const targetMatcher = /^ *- \[x\] ([\w.\[\]-]+)$/gim;
    targets = Array.from(targetsMatch[1].matchAll(targetMatcher)).map(
      (x) => x[1],
    );
  }

  return {...titleMatch, path, dry_run, targets};
}
