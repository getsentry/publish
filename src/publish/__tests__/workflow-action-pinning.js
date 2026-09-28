import { readFileSync, readdirSync } from "fs";
import { describe, expect, test } from "vitest";

const workflowPaths = readdirSync(".github/workflows")
  .filter((path) => path.endsWith(".yml"))
  .map((path) => `.github/workflows/${path}`);
const workflows = workflowPaths.map((path) => ({
  path,
  contents: readFileSync(path, "utf8"),
}));
const SECRET_BEARING_JOBS = {
  ".github/workflows/auto-approve.yml": ["auto-approve"],
  ".github/workflows/ci-poller.yml": ["check-ci"],
  ".github/workflows/cocoapods-keepalive.yml": ["keepalive"],
  ".github/workflows/publish.yml": ["waiting-for-ci", "publish"],
};

function jobContents(workflow, jobName) {
  const header = `  ${jobName}:`;
  const jobStart = workflow.indexOf(header);
  const nextJobOffset = workflow
    .slice(jobStart + header.length)
    .search(/\n {2}\S/);
  const nextJob =
    nextJobOffset === -1 ? -1 : jobStart + header.length + nextJobOffset;

  return workflow.slice(jobStart, nextJob === -1 ? undefined : nextJob);
}

describe("workflow action pinning", () => {
  test.each(workflows)("pins actions in $path", ({ contents }) => {
    const actionReferences = contents.matchAll(
      /^\s+(?:- )?uses: actions\/[^\s@]+@([^\s]+)$/gm
    );

    for (const [, revision] of actionReferences) {
      expect(revision).toMatch(/^[a-f0-9]{40}$/);
    }
  });

  test.each(
    workflows.filter(
      ({ path }) => path !== ".github/workflows/ci-poller-dispatch.yml"
    )
  )(
    "does not allow workflow dispatch outside the protected relay in $path",
    ({ contents }) => {
      expect(contents).not.toContain("workflow_dispatch:");
    }
  );

  test.each(Object.entries(SECRET_BEARING_JOBS))(
    "uses the protected production environment for %s",
    (path, jobNames) => {
      const workflow = workflows.find((workflow) => workflow.path === path);

      for (const jobName of jobNames) {
        expect(jobContents(workflow.contents, jobName)).toContain(
          "environment: production"
        );
      }
    }
  );

  test("only the protected relay allows workflow dispatch", () => {
    const relay = readFileSync(
      ".github/workflows/ci-poller-dispatch.yml",
      "utf8"
    );

    expect(relay).toContain("workflow_dispatch:");
    expect(relay).toContain("permissions: {}");
    expect(relay).toContain("environment: production");
    expect(relay).toContain("runs-on: ubuntu-latest");
    expect(relay).toContain('run: ":"');
    expect(relay).not.toContain("uses:");
    expect(relay).not.toContain("secrets.");
  });

  test("pins the CocoaPods keep-alive dependency", () => {
    const workflow = readFileSync(
      ".github/workflows/cocoapods-keepalive.yml",
      "utf8"
    );
    const lockfile = readFileSync("Gemfile.lock", "utf8");

    expect(workflow).toContain("actions/checkout@");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).not.toContain("ref: main");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("bundle install");
    expect(workflow).toContain("bundle exec pod trunk me");
    expect(workflow).not.toContain("gem install cocoapods");
    expect(lockfile).toContain("cocoapods (1.16.2)");
    const token = "COCOAPODS_TRUNK_TOKEN: ${{ secrets.COCOAPODS_TRUNK_TOKEN }}";
    expect(workflow).toContain(token);
    expect(workflow.indexOf(token)).toBeGreaterThan(
      workflow.indexOf("name: Refresh CocoaPods Session")
    );
  });
});
