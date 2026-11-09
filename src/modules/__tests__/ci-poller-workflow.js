import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

import { afterEach, expect, test } from "vitest";

const temporaryDirectories = [];
const INITIAL_REVISION = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const UPDATED_REVISION = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SUCCESSFUL_WORKFLOW_RUN = {
  conclusion: "success",
  html_url: "https://github.com/getsentry/toolkit/actions/runs/1",
  name: "CI",
  run_number: 1,
  status: "completed",
  workflow_id: 1,
};

function getPollerScript() {
  const workflow = readFileSync(
    join(__dirname, "../../../.github/workflows/ci-poller.yml"),
    "utf8"
  );
  const section = workflow.match(
    / {6}- name: Check CI status for ci-pending issues[\s\S]*? {8}run: \|\n(?<script>[\s\S]*?)\n {6}- name: Check for remaining pending issues/
  );

  if (!section?.groups?.script) {
    throw new Error("Missing CI poller workflow script");
  }

  return section.groups.script.replace(/^ {10}/gm, "");
}

function writeExecutable(path, content) {
  writeFileSync(path, content, { mode: 0o755 });
}

function runPoller({
  authorizationExit = 0,
  initialExit = 0,
  updateOutput = "",
  issueBody = "",
  liveIssueBody = issueBody,
  initialLabels = ["accepted", "ci-pending"],
  liveLabels = initialLabels,
  checkRuns = '{"status":"completed","conclusion":"success"}',
  workflowRuns = [SUCCESSFUL_WORKFLOW_RUN],
  workflowRunsExit = 0,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ci-poller-workflow-test-"));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, "bin");
  const temporaryFiles = join(directory, "temporary-files");
  const logFile = join(directory, "gh.log");
  const capturedBody = join(directory, "captured-body");
  mkdirSync(binDirectory);
  mkdirSync(temporaryFiles);
  writeFileSync(logFile, "");

  writeExecutable(
    join(binDirectory, "node"),
    `#!/usr/bin/env bash
set -eu
if [[ "\${REQUIRE_AUTHORIZED:-}" == "true" ]]; then
  exit "\${AUTHORIZATION_EXIT:-0}"
elif [[ -n "\${PUBLISH_REVISION:-}" ]]; then
  printf '%s' "\${NODE_UPDATE_OUTPUT:-}"
elif [[ "\${NODE_INITIAL_EXIT:-0}" != "0" ]]; then
  exit "\${NODE_INITIAL_EXIT}"
else
  printf '%s' "\${NODE_INITIAL_OUTPUT}"
fi
`
  );
  writeExecutable(
    join(binDirectory, "mktemp"),
    `#!/usr/bin/env bash
set -eu
counter_file="$TEMPORARY_FILES/counter"
counter=0
[[ ! -f "$counter_file" ]] || counter=$(<"$counter_file")
counter=$((counter + 1))
printf '%s' "$counter" > "$counter_file"
file="$TEMPORARY_FILES/$counter"
: > "$file"
printf '%s\n' "$file"
`
  );
  writeExecutable(
    join(binDirectory, "gh"),
    `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$GH_LOG"
case "$*" in
  "issue list "*)
    printf '%s' "$GH_ISSUES"
    ;;
  "issue view "*)
    printf '%s' "$GH_LIVE_ISSUE"
    ;;
  *"/actions/runs?head_sha="*)
    [[ "$GH_WORKFLOW_RUNS_EXIT" == "0" ]] || exit "$GH_WORKFLOW_RUNS_EXIT"
    printf '%s' "$GH_WORKFLOW_RUNS"
    ;;
  *"/check-suites"*)
    printf '%s' "release/1.2.3"
    ;;
  *"/git/ref/heads/"*)
    printf '%s' "${UPDATED_REVISION}"
    ;;
  *"/status"*)
    printf '%s' '{"state":"success","total_count":0}'
    ;;
  *"/check-runs"*)
    printf '%s' "$GH_CHECK_RUNS"
    ;;
  "issue edit "*)
    for ((index = 1; index <= $#; index++)); do
      if [[ "\${!index}" == "--body-file" ]]; then
        body_index=$((index + 1))
        cp "\${!body_index}" "$CAPTURED_BODY"
      fi
    done
    ;;
esac
`
  );

  const issue = JSON.stringify([
    {
      body: issueBody,
      labels: initialLabels.map((name) => ({ name })),
      number: 1,
      title: "publish: getsentry/toolkit@1.2.3",
    },
  ]);
  const liveIssue = JSON.stringify({
    body: liveIssueBody,
    labels: liveLabels.map((name) => ({ name })),
    title: "publish: getsentry/toolkit@1.2.3",
  });
  const initialOutput = JSON.stringify({
    path: ".",
    repo: "getsentry/toolkit",
    revision: INITIAL_REVISION,
    version: "1.2.3",
  });
  const result = spawnSync(
    "bash",
    ["-e", "-o", "pipefail", "-c", getPollerScript()],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        AUTHORIZATION_EXIT: String(authorizationExit),
        CAPTURED_BODY: capturedBody,
        GH_WORKFLOW_RUNS: workflowRuns
          .map((run) => JSON.stringify(run))
          .join("\n"),
        GH_WORKFLOW_RUNS_EXIT: String(workflowRunsExit),
        GH_CHECK_RUNS: checkRuns,
        GH_LOG: logFile,
        GH_ISSUES: issue,
        GH_LIVE_ISSUE: liveIssue,
        GITHUB_REPOSITORY: "getsentry/publish",
        NODE_INITIAL_EXIT: String(initialExit),
        NODE_INITIAL_OUTPUT: initialOutput,
        NODE_UPDATE_OUTPUT: updateOutput,
        PATH: `${binDirectory}:${process.env.PATH}`,
        TEMPORARY_FILES: temporaryFiles,
      },
    }
  );

  return {
    capturedBody,
    log: readFileSync(logFile, "utf8"),
    result,
    temporaryFiles: readdirSync(temporaryFiles).filter(
      (file) => file !== "counter"
    ),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("skips an issue without editing it when the poller resolver fails", () => {
  const poller = runPoller({ initialExit: 1 });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("issue edit");
  expect(poller.temporaryFiles).toEqual([]);
});

test("skips an issue without editing it when the rewrite response has no body", () => {
  const poller = runPoller({ updateOutput: JSON.stringify({}) });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--body-file");
  expect(poller.temporaryFiles).toEqual([]);
});

test("skips an issue without editing it when the rewrite response body is empty", () => {
  const poller = runPoller({ updateOutput: JSON.stringify({ issueBody: "" }) });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--body-file");
  expect(poller.temporaryFiles).toEqual([]);
});

test.each([
  ["malformed JSON", "not JSON"],
  ["a non-object JSON value", "[]"],
])(
  "skips an issue without editing it when the rewrite response is %s",
  (_name, updateOutput) => {
    const poller = runPoller({ updateOutput });

    expect(poller.result.status, poller.result.stderr).toBe(0);
    expect(poller.log).not.toContain("--body-file");
    expect(poller.temporaryFiles).toEqual([]);
  }
);

test("preserves all rewrite body bytes outside the revision", () => {
  const body = "canonical issue body\n\n";
  const poller = runPoller({
    issueBody: body,
    updateOutput: JSON.stringify({ issueBody: body }),
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(readFileSync(poller.capturedBody, "utf8")).toBe(body);
  expect(poller.temporaryFiles).toEqual([]);
});

test("revokes approval when the request changes before ci-ready", () => {
  const body = "canonical issue body\n";
  const poller = runPoller({
    issueBody: body,
    liveIssueBody: "changed issue body\n",
    updateOutput: JSON.stringify({ issueBody: body }),
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain(
    "--remove-label accepted --remove-label ci-pending"
  );
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("revokes approval when the approver loses target access", () => {
  const body = "canonical issue body\n";
  const poller = runPoller({
    authorizationExit: 1,
    issueBody: body,
    updateOutput: JSON.stringify({ issueBody: body }),
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain(
    "--remove-label accepted --remove-label ci-pending"
  );
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("revokes approval when dry-run changes before ci-ready", () => {
  const body = "canonical issue body\n";
  const poller = runPoller({
    initialLabels: ["accepted", "ci-pending", "dry-run"],
    issueBody: body,
    liveLabels: ["accepted", "ci-pending"],
    updateOutput: JSON.stringify({ issueBody: body }),
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain(
    "--remove-label accepted --remove-label ci-pending"
  );
  expect(poller.log).not.toContain("--add-label ci-ready");
});

function runPollerWithRuns({ checkRuns, workflowRuns, workflowRunsExit = 0 }) {
  const body = "canonical issue body\n";
  return runPoller({
    checkRuns,
    issueBody: body,
    updateOutput: JSON.stringify({ issueBody: body }),
    workflowRuns,
    workflowRunsExit,
  });
}

test("marks CI failed when a workflow run failed but every check run passed", () => {
  const poller = runPollerWithRuns({
    workflowRuns: [{ ...SUCCESSFUL_WORKFLOW_RUN, conclusion: "failure" }],
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain(
    "--remove-label ci-pending --remove-label accepted --add-label ci-failed"
  );
  expect(poller.log).toContain(
    "- [CI](https://github.com/getsentry/toolkit/actions/runs/1) (failure)"
  );
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("marks CI failed when a workflow run failed before creating any jobs", () => {
  const poller = runPollerWithRuns({
    checkRuns: "",
    workflowRuns: [
      { ...SUCCESSFUL_WORKFLOW_RUN, conclusion: "startup_failure" },
    ],
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain("--add-label ci-failed");
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("waits while a workflow run is still queued", () => {
  const poller = runPollerWithRuns({
    workflowRuns: [
      { ...SUCCESSFUL_WORKFLOW_RUN, conclusion: null, status: "queued" },
    ],
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--add-label");
  expect(poller.log).not.toContain("issue comment");
});

test("ignores a failed workflow run that a newer run of the same workflow replaced", () => {
  const poller = runPollerWithRuns({
    workflowRuns: [
      { ...SUCCESSFUL_WORKFLOW_RUN, conclusion: "cancelled", run_number: 1 },
      { ...SUCCESSFUL_WORKFLOW_RUN, run_number: 2 },
    ],
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain("--add-label ci-ready");
});

test("skips an issue without changing labels when workflow runs cannot be fetched", () => {
  const poller = runPollerWithRuns({ workflowRuns: [], workflowRunsExit: 1 });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--add-label");
  expect(poller.log).not.toContain("issue comment");
});
