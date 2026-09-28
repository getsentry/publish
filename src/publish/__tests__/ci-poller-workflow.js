import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(".github/workflows/ci-poller.yml", "utf8");
const manualDispatchWorkflow = readFileSync(
  ".github/workflows/ci-poller-dispatch.yml",
  "utf8"
);

describe("CI poller workflow", () => {
  test("checks out trusted code before requesting app tokens", () => {
    expect(workflow).toMatch(
      /- name: Get publish code\n\s+uses: actions\/checkout@[a-f0-9]{40}\n\s+with:\n(?:\s+#.*\n)*\s+ref: \$\{\{ steps\.validate-manual-recovery\.outputs\.default_head \}\}/
    );

    expect(workflow.indexOf("Get publish code")).toBeLessThan(
      workflow.indexOf("Get auth token")
    );
    expect(workflow).toContain(
      'echo "default_head=$default_head" >> "$GITHUB_OUTPUT"'
    );
  });

  test("resolves an immutable source SHA for every poller trigger", () => {
    expect(workflow).toContain("EVENT_NAME: ${{ github.event_name }}");
    expect(workflow).toContain(
      'if [[ "$EVENT_NAME" == "workflow_run" ]]; then'
    );
    expect(workflow).toContain('[[ "$default_head" =~ ^[0-9a-f]{40}$ ]]');
    expect(workflow).not.toContain(
      "ref: ${{ steps.validate-manual-recovery.outputs.default_head ||"
    );
  });

  test("uses a protected workflow dispatch relay for manual recovery", () => {
    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("types: [ci-poller]");
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("workflows: [Run CI Status Poller]");
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion == 'success'"
    );
    expect(workflow).toContain(
      "github.event.workflow_run.head_branch == github.event.repository.default_branch"
    );
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'workflow_dispatch'"
    );
    expect(workflow).toContain("actions/runs/${WORKFLOW_RUN_ID}");
    expect(workflow).toContain("actions/workflows/ci-poller-dispatch.yml");
    expect(workflow).toContain(".workflow_id == $workflow_id");
    expect(workflow).toContain(".head_sha == $head");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(manualDispatchWorkflow).toContain("workflow_dispatch:");
    expect(manualDispatchWorkflow).toContain("permissions: {}");
    expect(manualDispatchWorkflow).toContain("environment: production");
    expect(manualDispatchWorkflow).toContain("runs-on: ubuntu-latest");
    expect(manualDispatchWorkflow).toContain('run: ":"');
    expect(manualDispatchWorkflow).not.toContain("uses:");
    expect(manualDispatchWorkflow).not.toContain("secrets.");
    expect(manualDispatchWorkflow).not.toContain("repository_dispatch:");
  });

  test("validates repository dispatch attempts before requesting app tokens", () => {
    const validation = workflow.indexOf("Validate dispatch attempt");
    const attemptPattern = workflow.match(
      /\[\[ "\$ATTEMPT" =~ \^(.+)\$ \]\]/
    )?.[1];

    expect(validation).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(workflow.indexOf("Get auth token"));
    expect(attemptPattern).toBeDefined();

    const attemptRegex = new RegExp(`^(?:${attemptPattern})$`);
    for (let attempt = 0; attempt <= 59; attempt += 1) {
      expect(String(attempt)).toMatch(attemptRegex);
    }
    for (const attempt of ["", "00", "01", "60", "-1", "1x", "$(id)"]) {
      expect(attempt).not.toMatch(attemptRegex);
    }

    expect(workflow).toContain(
      "ATTEMPT: ${{ github.event_name == 'repository_dispatch' && steps.dispatch-attempt.outputs.value || '0' }}"
    );
    expect(workflow).toContain("attempt=$((10#$ATTEMPT + 1))");
    expect(workflow).toContain(
      'gh api --method POST "repos/$GITHUB_REPOSITORY/dispatches" --input -'
    );
  });

  test("binds every poller approval fence to the listed request snapshot", () => {
    expect(workflow).toContain(
      "request_digest=$(echo \"$publish_input\" | jq -r '.requestDigest')"
    );
    expect(
      workflow.match(/EXPECTED_REQUEST_DIGEST="\$request_digest"/g)
    ).toHaveLength(4);
  });

  test("keeps recovery enabled for every accepted authorization", () => {
    const remaining = workflow.indexOf(
      "name: Check for remaining authorization"
    );
    const sync = workflow.indexOf(
      "name: Sync poller variable with pending issue state"
    );

    expect(remaining).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(remaining);
    expect(workflow.slice(remaining, sync)).toContain(
      "count=$(echo \"$remaining\" | jq 'length')"
    );
    expect(workflow.slice(sync)).toContain(
      "steps.remaining.outcome == 'success'"
    );
  });

  test("runs scheduled recovery even when the pending variable is stale", () => {
    expect(workflow).toContain("github.event_name == 'schedule'");
  });

  test("scans all issues with authorization labels for stale-state recovery", () => {
    expect(workflow).toContain("issues?state=all&per_page=100");
    expect(workflow).toContain(
      "select(.pull_request == null and any(.labels[];"
    );
    expect(workflow).toContain("state=$(echo \"$issue\" | jq -r '.state')");
    expect(workflow).toContain('--remove-label "ci-ready"');
  });

  test("reconciles authorization when an issue closes or reopens", () => {
    expect(workflow).toContain("issues:");
    expect(workflow).toContain("types: [closed, reopened]");
    expect(workflow).toContain('"$state" != "open"');
    expect(workflow).toContain('"$has_accepted" != "true"');
  });

  test("matches stale publish runs to the triggering issue number", () => {
    expect(workflow).toContain(
      '--arg run_name "Publish issue #${number}: ${title}"'
    );
    expect(workflow).toContain(
      '.display_title == $run_name and .status != "completed"'
    );
  });

  test("does not promote without an authoritative release branch", () => {
    expect(workflow).toContain("No release branch found");
    expect(workflow).not.toContain("using issue SHA");
  });

  test("requires a signed and fresh ci-ready proof", () => {
    const removeReady = workflow.indexOf('--remove-label "ci-ready"');
    const recordProof = workflow.indexOf("record-ci-ready-attestation.js");

    expect(removeReady).toBeGreaterThan(-1);
    expect(recordProof).toBeGreaterThan(removeReady);
    expect(workflow).toContain("EXPECTED_PREVIOUS_CI_READY_EVENT_ID");
    expect(workflow).toContain(
      'PUBLISH_ATTESTATION_SECRET="$(<"$ATTESTATION_SECRET_FILE")"'
    );
    expect(workflow).not.toContain(
      'PUBLISH_ATTESTATION_SECRET="${{ secrets.PUBLISH_ATTESTATION_SECRET }}"'
    );
  });

  test("rejects incomplete workflow-run CI evidence", () => {
    expect(workflow).toContain('if [[ "$total_checks" == "0" ]]; then');
    expect(workflow).toContain("No check runs found");
  });
});
