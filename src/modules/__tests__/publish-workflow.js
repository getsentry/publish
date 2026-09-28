import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, expect, test } from "vitest";

const { resolvePublishLocation } = require("../publish-location.js");

const temporaryDirectories = [];

function getWorkflow() {
  return readFileSync(
    join(__dirname, "../../../.github/workflows/publish.yml"),
    "utf8"
  );
}

function getSetTargetsScript() {
  const workflow = getWorkflow();
  const section = workflow.match(
    / {6}- name: Set targets[\s\S]*? {8}run: \|\n(?<script>[\s\S]*?)\n {6}- name: Revalidate release branch head/
  );
  if (!section?.groups?.script) {
    throw new Error("Missing Set targets workflow script");
  }
  return section.groups.script.replace(/^ {10}/gm, "");
}

function runSetTargets({ path, repo, version, workspace = "" }) {
  const directory = mkdtempSync(join(tmpdir(), "publish-workflow-test-"));
  temporaryDirectories.push(directory);
  const output = join(directory, "github-output");
  writeFileSync(output, "");

  const result = spawnSync("bash", ["-e", "-c", getSetTargetsScript()], {
    env: {
      ...process.env,
      CRAFT_PUBLISH_PATH: path,
      CRAFT_PUBLISH_REPO: repo,
      CRAFT_PUBLISH_TARGETS_JSON: '["github"]',
      CRAFT_PUBLISH_VERSION: version,
      CRAFT_PUBLISH_WORKSPACE: workspace,
      GITHUB_OUTPUT: output,
      GITHUB_WORKSPACE: directory,
    },
    encoding: "utf8",
  });

  expect(result.status, result.stderr).toBe(0);
  const stateFile = readFileSync(output, "utf8")
    .trim()
    .replace("state_file=", "");
  return { stateFile, state: readFileSync(stateFile, "utf8") };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("uses the CI-approved revision for checkout, location resolution, and publishing", () => {
  const workflow = getWorkflow();
  const revision = workflow.indexOf(
    "name: Resolve CI-approved release revision"
  );
  const informStart = workflow.indexOf("name: Inform start");
  const checkout = workflow.indexOf("name: Check out target repo");
  const location = workflow.indexOf("name: Resolve publish location");
  const state = workflow.indexOf("name: Set targets");
  const publish = workflow.indexOf("name: Publish using Craft");

  expect(checkout).toBeGreaterThan(-1);
  expect(informStart).toBeGreaterThan(revision);
  expect(checkout).toBeGreaterThan(informStart);
  expect(location).toBeGreaterThan(checkout);
  expect(state).toBeGreaterThan(location);
  expect(publish).toBeGreaterThan(state);
  expect(workflow).toContain(
    "ref: ${{ steps.release-revision.outputs.revision }}"
  );
  expect(
    workflow.match(
      /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g
    )
  ).toHaveLength(2);
  expect(workflow).toContain(
    "node .__publish__/src/publish/discover-location.js"
  );
  expect(workflow).toContain("PUBLISH_REPOSITORY_DIRECTORY: __repo__");
  expect(workflow).toContain(
    "docker://getsentry/craft@sha256:9a4a5d5efa44a00c2215078ead39800d4aaa5a97908b94f45a64d7d506d6e14b"
  );
  expect(workflow).toContain(
    "CRAFT_PUBLISH_PATH: ${{ fromJSON(steps.location.outputs.result).path }}"
  );
  expect(workflow).toContain(
    "CRAFT_PUBLISH_WORKSPACE: ${{ fromJSON(steps.location.outputs.result).workspace || '' }}"
  );
  expect(workflow).toContain(
    "node /github/workspace/.__publish__/src/publish/publish-and-validate.js"
  );
});

test("publishes only on a fresh CI-ready label event", () => {
  const workflow = getWorkflow();

  expect(workflow).toContain("github.event.label.name == 'ci-ready'");
  expect(workflow).toContain(
    "contains(github.event.issue.labels.*.name, 'accepted')"
  );
  expect(workflow).toContain(
    "contains(github.event.issue.labels.*.name, 'ci-ready')"
  );
  expect(workflow).toContain('REQUIRE_CI_PENDING_ABSENT: "true"');
  expect(workflow).toContain(
    "!contains(github.event.issue.labels.*.name, 'ci-failed')"
  );
});

test("uses Craft's legacy root state filename", () => {
  const { stateFile, state } = runSetTargets({
    path: ".",
    repo: "sentry",
    version: "21.3.1",
  });

  expect(stateFile).toMatch(
    /\.craft-state\/craft\/publish-state-getsentry-sentry-c232c383e26f-21\.3\.1\.json$/
  );
  expect(JSON.parse(state)).toEqual({ published: { github: true } });
});

test("matches Craft's workspace state filename for a monorepo release", () => {
  const location = resolvePublishLocation({
    path: "./packages/cli",
    workspaceNames: ["packages/cli"],
  });
  const { stateFile, state } = runSetTargets({
    path: location.path,
    repo: "toolkit",
    version: "1.2.3",
    workspace: location.workspace,
  });

  expect(stateFile).toMatch(
    /\.craft-state\/craft\/publish-state-getsentry-toolkit-c232c383e26f-workspace-cGFja2FnZXMvY2xp-1\.2\.3\.json$/
  );
  expect(JSON.parse(state)).toEqual({ published: { github: true } });
});

test("does not collide state files for release versions that differ by case", () => {
  const first = runSetTargets({
    path: ".",
    repo: "toolkit",
    version: "4.2.6+sentry1",
  });
  const second = runSetTargets({
    path: ".",
    repo: "toolkit",
    version: "4.2.6+Sentry1",
  });

  expect(first.stateFile).not.toBe(second.stateFile);
  expect(first.stateFile).toMatch(/-version-NC4yLjYrc2VudHJ5MQ\.json$/);
  expect(second.stateFile).toMatch(/-version-NC4yLjYrU2VudHJ5MQ\.json$/);
});
