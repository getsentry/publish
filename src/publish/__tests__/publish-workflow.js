import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(".github/workflows/publish.yml", "utf8");

describe("publish workflow", () => {
  test("names runs with the triggering issue number", () => {
    expect(workflow).toContain(
      'run-name: "Publish issue #${{ github.event.issue.number }}:'
    );
  });

  test("serializes all publish attempts for an issue number", () => {
    expect(workflow).toContain(
      "group: publish-issue-${{ github.event.issue.number }}"
    );
    expect(workflow).not.toContain("group: ${{ github.event.issue.title }}");
  });

  test("keeps poller recovery enabled when pending-label activation fails", () => {
    const markPending = workflow.indexOf("name: Mark ci-pending");
    const pollerToken = workflow.indexOf("name: Get poller app token");
    const enablePoller = workflow.indexOf("name: Enable cron poller");
    const revoke = workflow.indexOf("name: Revoke stranded approval");

    expect(pollerToken).toBeGreaterThan(markPending);
    expect(enablePoller).toBeGreaterThan(pollerToken);
    expect(revoke).toBeGreaterThan(enablePoller);
    expect(workflow.slice(pollerToken, enablePoller)).toContain("if: always()");
    expect(workflow.slice(enablePoller, revoke)).not.toContain(
      "steps.mark-pending.outcome"
    );
  });

  test("binds approval and publication to the triggering issue snapshot", () => {
    expect(workflow).toContain("node src/publish/request-digest-from-event.js");
    expect(
      workflow.match(
        /EXPECTED_REQUEST_DIGEST: \$\{\{ steps\.request-digest\.outputs\.request_digest \}\}/g
      )
    ).toHaveLength(6);
  });

  test("uses separate issue and target-repository approval tokens", () => {
    const authorization = workflow.slice(
      workflow.indexOf("name: Authorize approval"),
      workflow.indexOf("name: Record approval attestation")
    );

    expect(authorization).toContain("APPROVAL_TOKEN: ${{ github.token }}");
    expect(authorization).toContain(
      "TARGET_REPOSITORY_TOKEN: ${{ steps.release-token.outputs.token }}"
    );
    expect(authorization).not.toContain(
      "APPROVAL_TOKEN: ${{ steps.release-token.outputs.token }}"
    );
  });

  test("revalidates approval immediately before Craft", () => {
    const fence = workflow.indexOf("Revalidate approval attestation");
    const craft = workflow.indexOf("Publish using Craft");
    const preCraft = workflow.slice(fence, craft);

    expect(fence).toBeGreaterThan(workflow.indexOf("Set targets"));
    expect(fence).toBeLessThan(craft);
    expect(preCraft).toContain('REQUIRE_CI_PENDING_ABSENT: "true"');
    expect(preCraft).toContain('REQUIRE_CI_READY_ATTESTATION: "true"');
    expect(workflow).not.toContain("name: Consume approval");
  });

  test("runs the final signed request and branch fence inside Craft", () => {
    const craft = workflow.slice(workflow.indexOf("name: Publish using Craft"));

    expect(craft).toContain(
      "node /github/workspace/.__publish__/src/publish/publish-and-validate.js"
    );
    expect(craft).toContain("PUBLISH_ATTESTATION_SECRET_FILE:");
    expect(craft).not.toContain("PUBLISH_ATTESTATION_SECRET: ${{");
    expect(craft).not.toContain("APPROVAL_TOKEN: ${{");
    expect(craft).not.toContain("RELEASE_TOKEN: ${{");
    expect(craft).toContain("RELEASE_REVISION:");
    expect(craft).not.toContain("exec craft publish ${{");
  });

  test("does not interpolate the attestation secret into shell source", () => {
    expect(workflow).not.toContain(
      'PUBLISH_ATTESTATION_SECRET="${{ secrets.PUBLISH_ATTESTATION_SECRET }}"'
    );
    expect(workflow).toContain(
      'PUBLISH_ATTESTATION_SECRET="$(<"$ATTESTATION_SECRET_FILE")"'
    );
  });

  test("removes final validation credentials after the Craft attempt", () => {
    const preparation = workflow.indexOf(
      "name: Prepare final validation credentials"
    );
    const craft = workflow.indexOf("name: Publish using Craft");
    const cleanup = workflow.indexOf(
      "name: Remove final validation credentials"
    );
    const reconciliation = workflow.indexOf(
      "name: Reconcile publish issue",
      cleanup
    );

    expect(preparation).toBeGreaterThan(-1);
    expect(preparation).toBeLessThan(craft);
    expect(cleanup).toBeGreaterThan(craft);
    expect(workflow.slice(preparation, cleanup)).toContain("umask 077");
    expect(workflow.slice(preparation, cleanup)).toContain(
      ".publish-credentials"
    );
    expect(workflow.slice(preparation, cleanup)).toContain(
      'container_credential_directory="/github/workspace/.publish-credentials"'
    );
    expect(workflow.slice(preparation, cleanup)).toContain(
      "approval_token_file=$container_credential_directory/approval-token"
    );
    const cleanupStep = workflow.slice(cleanup, reconciliation);
    expect(cleanupStep).toContain("id: remove-final-credentials");
    expect(cleanupStep).toContain("if: always()");
    expect(cleanupStep).toContain("set -euo pipefail");
    expect(cleanupStep).toContain('[[ -e "$credential_directory"');
    expect(cleanupStep).toContain('|| -L "$credential_directory"');
    expect(cleanupStep).toContain('|| -e "$secret_file"');
    expect(cleanupStep).toContain('|| -L "$secret_file"');
    expect(cleanupStep).not.toContain("continue-on-error: true");
  });

  test("installs dependencies before parsing the waiting-for-ci request", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const checkout = waitingForCi.indexOf("name: Get publish code");
    const install = waitingForCi.indexOf("name: Install yarn dependencies");
    const parse = waitingForCi.indexOf("name: Parse target repository");

    expect(install).toBeGreaterThan(checkout);
    expect(install).toBeLessThan(parse);
    expect(waitingForCi.slice(install)).toContain(
      "yarn install --frozen-lockfile"
    );
  });

  test("scopes release bot tokens to the target repository", () => {
    const releaseTokens = workflow.match(
      /name: Get (?:release bot|Release Bot) auth token[\s\S]*?(?=\n\s+- name:|\n\s+- uses:)/g
    );

    expect(releaseTokens).toHaveLength(2);
    for (const token of releaseTokens) {
      expect(token).toContain("owner: getsentry");
      expect(token).toContain("repositories:");
    }
  });

  test("revalidates the release branch head before the final approval fence", () => {
    const branchFence = workflow.indexOf(
      "name: Revalidate release branch head"
    );
    const approvalFence = workflow.indexOf(
      "name: Revalidate approval attestation"
    );
    const craft = workflow.indexOf("name: Publish using Craft");

    expect(branchFence).toBeGreaterThan(workflow.indexOf("name: Set targets"));
    expect(branchFence).toBeLessThan(approvalFence);
    expect(approvalFence).toBeLessThan(craft);
    expect(workflow.slice(branchFence, approvalFence)).toContain(
      "git/ref/heads/"
    );
    expect(workflow.slice(branchFence, approvalFence)).toContain(
      "RELEASE_REVISION"
    );
  });

  test("revalidates the release branch head after the final approval fence", () => {
    const approvalFence = workflow.lastIndexOf(
      "name: Revalidate approval attestation"
    );
    const branchFence = workflow.lastIndexOf(
      "name: Revalidate release branch immediately before Craft"
    );
    const craft = workflow.indexOf("name: Publish using Craft");

    expect(branchFence).toBeGreaterThan(approvalFence);
    expect(branchFence).toBeLessThan(craft);
    expect(workflow.slice(branchFence, craft)).toContain("git/ref/heads/");
    expect(workflow.slice(branchFence, craft)).toContain("RELEASE_REVISION");
    expect(workflow.slice(branchFence, craft)).toContain(
      "node .__publish__/src/publish/validate-approval-attestation.js"
    );
  });

  test("does not make the informational start comment a publication gate", () => {
    const start = workflow.indexOf("name: Inform start");
    const token = workflow.indexOf("name: Get Release Bot auth token");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(token).toBeGreaterThan(start);
    expect(workflow.slice(start, token)).toContain("continue-on-error: true");
  });

  test("revokes approval when marking ci-pending fails", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const mark = waitingForCi.indexOf("name: Mark ci-pending");
    const trigger = waitingForCi.indexOf("name: Trigger CI poller");
    const guard = waitingForCi.indexOf("name: Revoke stranded approval");

    expect(waitingForCi.slice(mark, trigger)).toContain("id: mark-pending");
    expect(waitingForCi.slice(mark, trigger)).toContain(
      "continue-on-error: true"
    );
    expect(waitingForCi.slice(trigger, guard)).toContain(
      "steps.mark-pending.outcome == 'success'"
    );
    expect(waitingForCi.slice(guard)).toContain(
      "steps.mark-pending.outcome != 'success'"
    );
    expect(waitingForCi.slice(guard)).toContain('--remove-label "ci-ready"');
  });

  test("pins Craft to an immutable digest", () => {
    expect(workflow).toMatch(
      /uses: docker:\/\/getsentry\/craft@sha256:[a-f0-9]{64}/
    );
  });

  test("activates the poller independently of comments and revokes approval if both activation paths fail", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const markPending = waitingForCi.indexOf("name: Mark ci-pending");
    const trigger = waitingForCi.indexOf("name: Trigger CI poller");
    const comment = waitingForCi.indexOf("name: Comment on issue");
    const enable = waitingForCi.indexOf("name: Enable cron poller");
    const guard = waitingForCi.indexOf("name: Revoke stranded approval");

    expect(markPending).toBeGreaterThanOrEqual(0);
    expect(trigger).toBeGreaterThan(markPending);
    expect(comment).toBeGreaterThan(trigger);
    expect(enable).toBeGreaterThan(trigger);
    expect(guard).toBeGreaterThan(enable);
    expect(waitingForCi.slice(trigger, comment)).toContain(
      "continue-on-error: true"
    );
    expect(waitingForCi.slice(comment, enable)).toContain(
      "continue-on-error: true"
    );
    expect(waitingForCi.slice(enable, guard)).toContain(
      "continue-on-error: true"
    );
    expect(waitingForCi.slice(guard)).toContain(
      "steps.trigger-poller.outcome != 'success'"
    );
    expect(waitingForCi.slice(guard)).toContain(
      "steps.enable-poller.outcome != 'success'"
    );
    expect(waitingForCi.slice(guard)).toContain('--remove-label "ci-pending"');
    expect(waitingForCi.slice(guard)).toContain('--remove-label "accepted"');
  });

  test("installs checked-out dependencies from the lockfile", () => {
    expect(workflow).toContain(
      'yarn install --cwd ".__publish__" --frozen-lockfile'
    );
  });

  test("reconciles authorization without Node before and after terminal reporting", () => {
    const publishJob = workflow.slice(workflow.indexOf("  publish:"));
    const craft = publishJob.indexOf("name: Publish using Craft");
    const firstReconcile = publishJob.indexOf("name: Reconcile publish issue");
    const report = publishJob.indexOf("name: Report publish result");
    const finalReconcile = publishJob.indexOf(
      "name: Verify publish issue reconciliation"
    );
    const updateTargets = publishJob.indexOf(
      "name: Update completed targets and remove label"
    );

    expect(craft).toBeGreaterThanOrEqual(0);
    expect(firstReconcile).toBeGreaterThan(craft);
    expect(report).toBeGreaterThan(firstReconcile);
    expect(finalReconcile).toBeGreaterThan(report);

    for (const section of [
      publishJob.slice(firstReconcile, updateTargets),
      publishJob.slice(finalReconcile),
    ]) {
      expect(section).toContain("if: always()");
      expect(section).toContain('${{ steps.publish.outcome }}" == "success');
      expect(section).toContain("steps.remove-final-credentials.outcome");
      expect(section).toContain('--remove-label "accepted"');
      expect(section).toContain('--remove-label "ci-pending"');
      expect(section).toContain('--remove-label "ci-ready"');
      expect(section).toContain("--state closed");
      expect(section).not.toContain("node ");
    }
  });

  test("places no label mutation between the final fence and Craft", () => {
    const publishJob = workflow.slice(workflow.indexOf("  publish:"));
    const fence = publishJob.indexOf("name: Revalidate approval attestation");
    const craft = publishJob.indexOf("name: Publish using Craft");

    expect(publishJob.slice(fence, craft)).not.toContain(
      "name: Consume approval"
    );
    expect(publishJob).not.toContain("name: Consume approval");
  });

  test("reports exactly one terminal status from the Craft outcome", () => {
    const reports = workflow.match(/name: Report publish result/g) || [];
    const report = workflow.slice(
      workflow.indexOf("name: Report publish result"),
      workflow.indexOf("name: Verify publish issue reconciliation")
    );

    expect(reports).toHaveLength(1);
    expect(report).toContain("if: always()");
    expect(report).toContain('case "${{ steps.publish.outcome }}" in');
    expect(report).toContain("success) status=success ;;");
    expect(report).toContain("cancelled) status=cancelled ;;");
    expect(report).toContain("*) status=failure ;;");
    expect(report).toContain(
      'node .__publish__/src/publish/post-result.js "$status"'
    );
    expect(report).toContain("steps.remove-final-credentials.outcome");
    expect(report).not.toContain("cancelled()");
  });
});
