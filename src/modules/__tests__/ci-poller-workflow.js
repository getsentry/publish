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

function getPollerScript() {
  const workflow = readFileSync(
    join(__dirname, "../../../.github/workflows/ci-poller.yml"),
    "utf8"
  );
  const section = workflow.match(
    / {6}- name: Check CI status for ci-pending issues[\s\S]*? {8}run: \|\n(?<script>[\s\S]*?)\n {6}- name: Check for remaining authorization/
  );

  if (!section?.groups?.script) {
    throw new Error("Missing CI poller workflow script");
  }

  return section.groups.script
    .replace(/^ {10}/gm, "")
    .replaceAll("${{ github.token }}", "github-token")
    .replaceAll(
      "${{ secrets.PUBLISH_ATTESTATION_SECRET }}",
      "attestation-secret"
    );
}

function writeExecutable(path, content) {
  writeFileSync(path, content, { mode: 0o755 });
}

function runPoller({
  currentAcceptedExit = 0,
  failBranchLookup = false,
  failCheckSuiteLookup = false,
  failCiReadyAdd = false,
  failCiReadyComment = false,
  failCiReadyRemoval = false,
  failCiReadyRevoke = false,
  failCiPendingRestore = false,
  commitStatus = "success",
  includeCheckRuns = true,
  checkSuiteBranches = ["release/1.2.3"],
  headRevision = UPDATED_REVISION,
  headRevisions = [],
  initialExit = 0,
  includeIssue = true,
  issueLabels = ["accepted", "ci-pending"],
  publishRuns = [],
  recordCiReadyMode = "success",
  updateOutput = "",
  issueBody = "",
  validationFailureCall = 0,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ci-poller-workflow-test-"));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, "bin");
  const temporaryFiles = join(directory, "temporary-files");
  const attestationSecretFile = join(directory, "attestation-secret");
  const eventLogFile = join(directory, "events.log");
  const logFile = join(directory, "gh.log");
  const nodeLogFile = join(directory, "node.log");
  const nodeStateFile = join(directory, "node-state");
  const capturedBody = join(directory, "captured-body");
  mkdirSync(binDirectory);
  mkdirSync(temporaryFiles);
  writeFileSync(attestationSecretFile, "attestation-secret");
  writeFileSync(logFile, "");
  writeFileSync(eventLogFile, "");
  writeFileSync(nodeLogFile, "");

  writeExecutable(
    join(binDirectory, "node"),
    `#!/usr/bin/env bash
set -eu
printf '%s\n' "$1" >> "$NODE_LOG"
printf 'node %s\n' "$1" >> "$EVENT_LOG"
case "$1" in
  *current-accepted-event.js)
    if [[ "\${CURRENT_ACCEPTED_EXIT:-0}" != "0" ]]; then
      exit "$CURRENT_ACCEPTED_EXIT"
    fi
    printf '%s' '{"actor":"approver","eventId":"1"}'
    ;;
  *current-ci-ready-event.js)
    printf '%s' "\${CURRENT_CI_READY_EVENT:-null}"
    ;;
  *validate-approval-attestation.js)
    validation_count=0
    [[ ! -f "$NODE_STATE" ]] || validation_count=$(<"$NODE_STATE")
    validation_count=$((validation_count + 1))
    printf '%s' "$validation_count" > "$NODE_STATE"
    if [[ "\${VALIDATION_FAILURE_CALL:-0}" == "$validation_count" ]]; then
      exit 1
    fi
    ;;
  *record-ci-ready-attestation.js)
    if [[ "\${RECORD_CI_READY_MODE:-success}" == "failure" ]]; then
      exit 1
    fi
    if [[ "\${RECORD_CI_READY_MODE:-success}" == "malformed" ]]; then
      printf '%s\n' 'not-an-attestation' >> "$GITHUB_OUTPUT"
    else
      printf '%s\n' 'ci_ready_attestation=<!-- proof -->' >> "$GITHUB_OUTPUT"
    fi
    ;;
  *resolve-ci-poller-input.js)
    if [[ -n "\${PUBLISH_REVISION:-}" ]]; then
      printf '%s' "\${NODE_UPDATE_OUTPUT:-}"
    elif [[ "\${NODE_INITIAL_EXIT:-0}" != "0" ]]; then
      exit "\${NODE_INITIAL_EXIT}"
    else
      printf '%s' "\${NODE_INITIAL_OUTPUT}"
    fi
    ;;
  *)
    echo "Unexpected Node entry point: $1" >&2
    exit 1
    ;;
esac
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
printf 'gh %s\n' "$*" >> "$EVENT_LOG"
case "$*" in
  "issue list "*)
    printf '%s' "$GH_ISSUES"
    ;;
  *"/issues?state=all&per_page=100"*)
    printf '%s' "$GH_ISSUES" | jq -c '.[]'
    ;;
  *"/check-suites"*)
    if [[ "\${FAIL_CHECK_SUITE_LOOKUP:-false}" == "true" ]]; then
      exit 1
    fi
    printf '%s' '{"check_suites":['
    IFS=',' read -r -a check_suite_branches <<< "\${CHECK_SUITE_BRANCHES:-release/1.2.3}"
    for index in "\${!check_suite_branches[@]}"; do
      [[ "$index" == "0" ]] || printf '%s' ','
      printf '{"head_branch":"%s","head_sha":"%s"}' \
        "\${check_suite_branches[$index]}" "\${GH_CHECK_SUITE_REVISION}"
    done
    printf '%s' ']}'
    ;;
  *"/git/ref/heads/"*)
    if [[ "\${FAIL_BRANCH_LOOKUP:-false}" == "true" ]]; then
      exit 1
    fi
    if [[ -n "\${GH_HEAD_REVISIONS:-}" ]]; then
      branch_counter_file="$TEMPORARY_FILES/branch-counter"
      branch_counter=0
      [[ ! -f "$branch_counter_file" ]] || branch_counter=$(<"$branch_counter_file")
      printf '%s' "$((branch_counter + 1))" > "$branch_counter_file"
      IFS=',' read -r -a branch_revisions <<< "$GH_HEAD_REVISIONS"
      last_index=$((\${#branch_revisions[@]} - 1))
      [[ "$branch_counter" -gt "$last_index" ]] && branch_counter="$last_index"
      printf '%s' "\${branch_revisions[$branch_counter]}"
    else
      printf '%s' "$GH_HEAD_REVISION"
    fi
    ;;
  *"/status"*)
     printf '%s' '{"state":"'"$COMMIT_STATUS"'","total_count":1,"statuses":[{"context":"build","state":"'"$COMMIT_STATUS"'"}]}'
    ;;
    *"/check-runs"*)
      if [[ "\${INCLUDE_CHECK_RUNS:-true}" != "true" ]]; then
        exit 0
      fi
      printf '%s' '{"status":"completed","conclusion":"success"}'
      ;;
  *"/actions/workflows/publish.yml/runs"*)
    if [[ "\${PUBLISH_RUNS:-}" == '{"workflow_runs":[]}' ]]; then
      printf '%s' 'null'
    else
      printf '%s' "\${PUBLISH_RUNS}" | \
        jq -c '.workflow_runs[] | {display_title: .display_title, status: .status}'
    fi
    ;;
  "issue edit "*)
    if [[ "\${FAIL_CI_READY_ADD:-false}" == "true" && "$*" == *"--add-label ci-ready"* ]]; then
      exit 1
    fi
    if [[ "\${FAIL_CI_READY_REMOVAL:-false}" == "true" && "$*" == *"--remove-label ci-ready"* && "$*" != *"--remove-label accepted"* ]]; then
      exit 1
    fi
    if [[ "\${FAIL_CI_PENDING_RESTORE:-false}" == "true" && "$*" == *"--add-label ci-pending"* ]]; then
      exit 1
    fi
    if [[ "\${FAIL_CI_READY_REVOKE:-false}" == "true" && "$*" == *"--remove-label accepted"* ]]; then
      exit 1
    fi
    for ((index = 1; index <= $#; index++)); do
      if [[ "\${!index}" == "--body-file" ]]; then
        body_index=$((index + 1))
        cp "\${!body_index}" "$CAPTURED_BODY"
      fi
    done
    ;;
  "issue comment "*)
    if [[ "\${FAIL_CI_READY_COMMENT:-false}" == "true" && "$*" == *"<!-- proof -->"* ]]; then
      exit 1
    fi
    ;;
esac
`
  );

  const issue = includeIssue
    ? JSON.stringify([
        {
          body: issueBody,
          labels: issueLabels.map((name) => ({ name })),
          number: 1,
          state: "open",
          title: "publish: getsentry/toolkit@1.2.3",
        },
      ])
    : "[]";
  const initialOutput = JSON.stringify({
    repo: "getsentry/toolkit",
    requestDigest: "request-digest",
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
        CAPTURED_BODY: capturedBody,
        ATTESTATION_SECRET_FILE: attestationSecretFile,
        CHECK_SUITE_BRANCHES: checkSuiteBranches.join(","),
        COMMIT_STATUS: commitStatus,
        CURRENT_ACCEPTED_EXIT: String(currentAcceptedExit),
        EVENT_LOG: eventLogFile,
        FAIL_BRANCH_LOOKUP: String(failBranchLookup),
        FAIL_CHECK_SUITE_LOOKUP: String(failCheckSuiteLookup),
        FAIL_CI_READY_ADD: String(failCiReadyAdd),
        FAIL_CI_READY_COMMENT: String(failCiReadyComment),
        FAIL_CI_READY_REMOVAL: String(failCiReadyRemoval),
        FAIL_CI_READY_REVOKE: String(failCiReadyRevoke),
        FAIL_CI_PENDING_RESTORE: String(failCiPendingRestore),
        GH_LOG: logFile,
        GH_TOKEN: "test-token",
        GH_HEAD_REVISION: headRevision,
        GH_HEAD_REVISIONS: headRevisions.join(","),
        GH_CHECK_SUITE_REVISION: INITIAL_REVISION,
        GH_ISSUES: issue,
        INCLUDE_CHECK_RUNS: String(includeCheckRuns),
        GITHUB_REPOSITORY: "getsentry/publish",
        NODE_INITIAL_EXIT: String(initialExit),
        NODE_INITIAL_OUTPUT: initialOutput,
        NODE_LOG: nodeLogFile,
        NODE_STATE: nodeStateFile,
        NODE_UPDATE_OUTPUT: updateOutput,
        PATH: `${binDirectory}:${process.env.PATH}`,
        PUBLISH_RUNS: JSON.stringify({ workflow_runs: publishRuns }),
        RELEASE_TOKEN: "test-release-token",
        TEMPORARY_FILES: temporaryFiles,
        RECORD_CI_READY_MODE: recordCiReadyMode,
        VALIDATION_FAILURE_CALL: String(validationFailureCall),
        WORKFLOW_TOKEN: "test-workflow-token",
      },
    }
  );

  return {
    capturedBody,
    eventLog: readFileSync(eventLogFile, "utf8"),
    log: readFileSync(logFile, "utf8"),
    nodeLog: readFileSync(nodeLogFile, "utf8"),
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

test("revokes approval when the poller resolver fails", () => {
  const poller = runPoller({ initialExit: 1 });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain(
    "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
  );
  expect(poller.temporaryFiles).toEqual([]);
});

test("handles an empty accepted-issue response", () => {
  const poller = runPoller({ includeIssue: false });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("issue edit");
});

test("revokes approval when the rewrite response has no body", () => {
  const poller = runPoller({ updateOutput: JSON.stringify({}) });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--body-file");
  expect(poller.log).toContain(
    "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
  );
  expect(poller.temporaryFiles).toEqual([]);
});

test("revokes approval when the rewrite response body is empty", () => {
  const poller = runPoller({ updateOutput: JSON.stringify({ issueBody: "" }) });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--body-file");
  expect(poller.log).toContain(
    "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
  );
  expect(poller.temporaryFiles).toEqual([]);
});

test.each([
  ["malformed JSON", "not JSON"],
  ["a non-object JSON value", "[]"],
])(
  "revokes approval when the rewrite response is %s",
  (_name, updateOutput) => {
    const poller = runPoller({ updateOutput });

    expect(poller.result.status, poller.result.stderr).toBe(0);
    expect(poller.log).not.toContain("--body-file");
    expect(poller.log).toContain(
      "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
    );
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
  expect(poller.log).toContain(
    "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
  );
  expect(poller.log).not.toContain("/status");
  expect(poller.temporaryFiles).toEqual([]);
});

test.each([
  ["the accepted event cannot be read", { currentAcceptedExit: 1 }],
  ["initial approval validation fails", { validationFailureCall: 1 }],
  ["post-CI approval validation fails", { validationFailureCall: 2 }],
  ["CI-ready proof recording fails", { recordCiReadyMode: "failure" }],
  ["CI-ready proof output is malformed", { recordCiReadyMode: "malformed" }],
  ["the CI-ready proof comment fails", { failCiReadyComment: true }],
  ["final approval validation fails", { validationFailureCall: 3 }],
])("stops the poll cycle when %s", (_name, options) => {
  const poller = runPoller({
    ...options,
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain(
    "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
  );
  if (options.recordCiReadyMode || options.failCiReadyComment) {
    expect(poller.log).toContain("--add-label ci-ready");
  } else {
    expect(poller.log).not.toContain("--add-label ci-ready");
  }
});

test("removes stale ci-ready before revalidating and adding it", () => {
  const poller = runPoller({ headRevision: INITIAL_REVISION });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  const removeReady = poller.log.indexOf(
    "issue edit 1 -R getsentry/publish --remove-label ci-ready"
  );
  const finalValidation = poller.eventLog.lastIndexOf(
    "/validate-approval-attestation.js"
  );
  const removeReadyEvent = poller.eventLog.indexOf(
    "issue edit 1 -R getsentry/publish --remove-label ci-ready"
  );
  const addReady = poller.eventLog.indexOf("--add-label ci-ready");

  expect(removeReady).toBeGreaterThanOrEqual(0);
  expect(removeReadyEvent).toBeGreaterThanOrEqual(0);
  expect(finalValidation).toBeGreaterThan(removeReadyEvent);
  expect(addReady).toBeGreaterThan(finalValidation);
});

test("stops before promotion when stale ci-ready removal fails", () => {
  const poller = runPoller({
    failCiReadyRemoval: true,
    headRevision: INITIAL_REVISION,
    issueLabels: ["accepted", "ci-pending", "ci-ready"],
  });

  expect(poller.result.status).not.toBe(0);
  expect(poller.log).toContain("--remove-label ci-ready");
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("rechecks the release branch head before producing ci-ready", () => {
  const script = getPollerScript();

  expect(script.match(/git\/ref\/heads\/\$\{branch\}/g)).toHaveLength(3);
});

test("runs the CI transition step with fail-closed shell settings", () => {
  const script = getPollerScript();

  expect(script).toContain("set -euo pipefail");
});

test("does not promote when CI metadata names multiple release branches", () => {
  const poller = runPoller({
    checkSuiteBranches: ["release/1.2.3", "release/other"],
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("/git/ref/heads/");
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("revalidates approval and rereads the branch before ci-ready", () => {
  const script = getPollerScript();
  const branchRead = script.lastIndexOf("git/ref/heads/${branch}");
  const finalValidation = script.lastIndexOf(
    "/validate-approval-attestation.js"
  );
  const ciReady = script.indexOf('echo "  CI passed! Adding ci-ready label."');

  expect(branchRead).toBeGreaterThan(finalValidation);
  expect(finalValidation).toBeLessThan(ciReady);
  expect(branchRead).toBeLessThan(ciReady);
});

test("revokes approval when the branch moves after CI passes", () => {
  const poller = runPoller({
    headRevisions: [INITIAL_REVISION, UPDATED_REVISION],
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--add-label ci-ready");
  expect(poller.log).toContain(
    "issue edit 1 -R getsentry/publish --remove-label ci-pending --remove-label accepted"
  );
});

test("does not swallow failed approval revocation after ci-ready recovery fails", () => {
  const script = getPollerScript();
  const recovery = script.slice(script.indexOf("Could not add ci-ready"));

  expect(recovery).toContain('--remove-label "accepted"');
  expect(recovery).not.toContain("|| true");
});

test.each([
  ["check-suite lookup", { failCheckSuiteLookup: true }],
  ["branch-head lookup", { failBranchLookup: true }],
])("does not check CI when %s fails", (_name, options) => {
  const poller = runPoller({
    ...options,
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("/status");
  expect(poller.log).not.toContain("--add-label ci-ready");
  expect(poller.log).not.toContain("--remove-label ci-pending");
  expect(poller.log, poller.eventLog).not.toContain("--remove-label accepted");
});

test("revokes approval when the final ci-ready add fails", () => {
  const poller = runPoller({
    failCiReadyAdd: true,
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain("--add-label ci-ready");
  expect(poller.log).toMatch(
    /--add-label ci-ready[\s\S]*--remove-label accepted/
  );
});

test("fails loudly when ci-ready recovery and approval revocation both fail", () => {
  const poller = runPoller({
    failCiPendingRestore: true,
    failCiReadyAdd: true,
    failCiReadyRevoke: true,
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status).not.toBe(0);
  expect(poller.log).toMatch(
    /--add-label ci-ready[\s\S]*--remove-label accepted/
  );
});

test("does not promote when the commit status reports an error", () => {
  const poller = runPoller({
    commitStatus: "error",
    headRevision: INITIAL_REVISION,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).toContain("--add-label ci-failed");
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("does not promote on a successful commit status without check runs", () => {
  const poller = runPoller({
    headRevision: INITIAL_REVISION,
    includeCheckRuns: false,
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.result.stdout).toContain("No check runs found");
  expect(poller.log).not.toContain("--add-label ci-ready");
});

test("recovers accepted issues that lost ci-pending", () => {
  const script = getPollerScript();

  expect(script).toContain("state=all&per_page=100");
  expect(script).toContain('name == "accepted"');
  expect(script).toContain("ci-pending");
});

test("revokes accepted issues left ci-ready after their publish run ends", () => {
  const poller = runPoller({
    headRevision: INITIAL_REVISION,
    issueLabels: ["accepted", "ci-ready"],
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log, poller.result.stdout).toContain(
    "issue edit 1 -R getsentry/publish --remove-label accepted --remove-label ci-pending --remove-label ci-ready"
  );
});

test("leaves ci-ready authorization alone while its publish run is active", () => {
  const poller = runPoller({
    headRevision: INITIAL_REVISION,
    issueLabels: ["accepted", "ci-ready"],
    publishRuns: [
      {
        display_title: "Publish issue #1: publish: getsentry/toolkit@1.2.3",
        status: "in_progress",
      },
    ],
  });

  expect(poller.result.status, poller.result.stderr).toBe(0);
  expect(poller.log).not.toContain("--remove-label accepted");
});
