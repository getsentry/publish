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
    / {6}- name: Set targets[\s\S]*? {8}run: \|\n(?<script>[\s\S]*?)\n {6}- uses: docker:\/\/getsentry\/craft:latest/
  );
  if (!section?.groups?.script) {
    throw new Error("Missing Set targets workflow script");
  }
  return section.groups.script.replace(/^ {10}/gm, "");
}

function runSetTargets({
  path,
  repo,
  version,
  workspace = "",
  targets = ["github"],
}) {
  const directory = mkdtempSync(join(tmpdir(), "publish-workflow-test-"));
  temporaryDirectories.push(directory);
  const output = join(directory, "github-output");
  writeFileSync(output, "");

  const result = spawnSync("bash", ["-e", "-c", getSetTargetsScript()], {
    env: {
      ...process.env,
      CRAFT_PUBLISH_PATH: path,
      CRAFT_PUBLISH_REPO: repo,
      CRAFT_PUBLISH_TARGETS_JSON: JSON.stringify(targets),
      CRAFT_PUBLISH_VERSION: version,
      CRAFT_PUBLISH_WORKSPACE: workspace,
      GITHUB_OUTPUT: output,
      GITHUB_WORKSPACE: directory,
    },
    encoding: "utf8",
  });

  expect(result.status, result.stderr).toBe(0);
  const outputs = readFileSync(output, "utf8");
  const stateFile = outputs.match(/^state_file=(.+)$/m)?.[1];
  const issueStateFile = outputs.match(/^issue_state_file=(.+)$/m)?.[1];
  return { stateFile, issueStateFile, state: readFileSync(stateFile, "utf8") };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("uses the CI-approved revision for checkout, location resolution, and publishing", () => {
  const workflow = getWorkflow();
  const publishJob = workflow.slice(workflow.indexOf("  publish:"));
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
  expect(publishJob.match(/actions\/checkout@v7/g)).toHaveLength(2);
  expect(workflow).toContain(
    "node .__publish__/src/publish/discover-location.js"
  );
  expect(workflow).toContain("PUBLISH_REPOSITORY_DIRECTORY: __repo__");
  expect(workflow).not.toContain("getsentry/craft:2.31.0");
  expect(workflow).toContain(
    "CRAFT_PUBLISH_PATH: ${{ fromJSON(steps.location.outputs.result).path }}"
  );
  expect(workflow).toContain(
    "CRAFT_PUBLISH_WORKSPACE: ${{ fromJSON(steps.location.outputs.result).workspace || '' }}"
  );
  expect(workflow).toContain(
    "craft publish ${{ fromJSON(steps.inputs.outputs.result).version }} --rev ${{ steps.release-revision.outputs.revision }}"
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
  expect(workflow).toContain(
    "!contains(github.event.issue.labels.*.name, 'ci-pending')"
  );
  expect(workflow).toContain(
    "!contains(github.event.issue.labels.*.name, 'ci-failed')"
  );
});

test("records completed targets before closing a successful publish issue", () => {
  const workflow = getWorkflow();
  const publish = workflow.indexOf("name: Publish using Craft");
  const update = workflow.indexOf(
    "name: Update completed targets and remove label"
  );
  const close = workflow.indexOf("name: Close on success");
  const publishStep = workflow.slice(publish, update);
  const updateStep = workflow.slice(update, close);

  expect(update).toBeGreaterThan(publish);
  expect(close).toBeGreaterThan(update);
  expect(publishStep).toContain("id: craft-publish");
  expect(updateStep).toContain("if: ${{ always() }}");
  expect(updateStep).toContain(
    "continue-on-error: ${{ steps.craft-publish.outcome == 'success' }}"
  );
  expect(updateStep).toContain(
    "CRAFT_STATE_FILE_PATH: ${{ steps.craft-state.outputs.issue_state_file }}"
  );
  expect(updateStep).toContain(
    "run: node .__publish__/src/publish/update-issue.js"
  );
  expect(workflow.slice(close)).toContain("if: ${{ success() }}");
});

test("creates a state file when no targets were already published", () => {
  const { stateFile, state } = runSetTargets({
    path: ".",
    repo: "craft",
    version: "2.34.1",
    targets: [],
  });

  expect(stateFile).toMatch(
    /\.craft-state\/craft\/publish-state-getsentry-craft-c232c383e26f-2\.34\.1\.json$/
  );
  expect(JSON.parse(state)).toEqual({ published: {} });
});

test("keeps Craft's final state after a successful publish removes its state file", () => {
  const { stateFile, issueStateFile } = runSetTargets({
    path: ".",
    repo: "craft",
    version: "2.34.1",
    targets: [],
  });
  const finalState = { published: { npm: true, gcs: true } };

  writeFileSync(stateFile, JSON.stringify(finalState));
  expect(JSON.parse(readFileSync(issueStateFile, "utf8"))).toEqual(finalState);

  rmSync(stateFile);
  expect(JSON.parse(readFileSync(issueStateFile, "utf8"))).toEqual(finalState);
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
