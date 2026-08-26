import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, expect, test } from "vitest";

const temporaryDirectories = [];

function getSetTargetsScript() {
  const workflow = readFileSync(
    join(__dirname, "../../../.github/workflows/publish.yml"),
    "utf8"
  );
  const section = workflow.match(
    / {6}- name: Set targets[\s\S]*? {8}run: \|\n(?<script>[\s\S]*?)\n {6}- uses: docker:\/\/getsentry\/craft:latest/
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
  const { stateFile, state } = runSetTargets({
    path: "./cli",
    repo: "toolkit",
    version: "1.2.3",
    workspace: "cli",
  });

  expect(stateFile).toMatch(
    /\.craft-state\/craft\/publish-state-getsentry-toolkit-21cf7beaeda4-workspace-Y2xp-1\.2\.3\.json$/
  );
  expect(JSON.parse(state)).toEqual({ published: { github: true } });
});
