import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(".github/workflows/publish.yml", "utf8");

describe("publish approval workflow", () => {
  test("authorizes the approver against the target repository first", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const parseTarget = waitingForCi.indexOf("name: Parse target repository");
    const targetToken = waitingForCi.indexOf(
      "name: Get target repository token"
    );
    const authorize = waitingForCi.indexOf("name: Authorize approval");
    const markPending = waitingForCi.indexOf("name: Mark ci-pending");

    expect(parseTarget).toBeGreaterThan(-1);
    expect(targetToken).toBeGreaterThan(parseTarget);
    expect(authorize).toBeGreaterThan(targetToken);
    expect(markPending).toBeGreaterThan(authorize);
    expect(waitingForCi.slice(targetToken, authorize)).toContain(
      "repositories: ${{ fromJSON(steps.target.outputs.result).repo }}"
    );
    expect(waitingForCi.slice(authorize, markPending)).toContain(
      "node src/publish/authorize-approval.js"
    );
    expect(waitingForCi.slice(authorize, markPending)).toContain(
      "TARGET_REPOSITORY_TOKEN: ${{ steps.target-token.outputs.token }}"
    );
    expect(waitingForCi.slice(authorize, markPending)).toContain(
      "APPROVAL_ACTOR_ID: ${{ github.event.sender.id }}"
    );
    expect(waitingForCi.slice(authorize, markPending)).toContain(
      "TARGET_REPOSITORY_PATH: ${{ fromJSON(steps.target.outputs.result).path }}"
    );
  });

  test("revokes an invalid approval before changing CI state", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const authorize = waitingForCi.indexOf("name: Authorize approval");
    const reject = waitingForCi.indexOf("name: Reject invalid approval");
    const markPending = waitingForCi.indexOf("name: Mark ci-pending");

    expect(reject).toBeGreaterThan(authorize);
    expect(reject).toBeLessThan(markPending);
    expect(waitingForCi.slice(reject, markPending)).toContain(
      "steps.authorization.outputs.authorized != 'true'"
    );
    expect(waitingForCi.slice(reject, markPending)).toContain(
      '--remove-label "accepted"'
    );
  });

  test("revokes approval when setup or ci-pending fails", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const markPending = waitingForCi.indexOf("name: Mark ci-pending");
    const cleanup = waitingForCi.indexOf("name: Revoke stranded approval");

    expect(cleanup).toBeGreaterThan(markPending);
    expect(waitingForCi.slice(cleanup)).toContain("always()");
    expect(waitingForCi.slice(cleanup)).toContain(
      "steps.authorization.outputs.authorized == 'true'"
    );
    expect(waitingForCi.slice(cleanup)).toContain('--remove-label "accepted"');
    expect(waitingForCi.slice(cleanup)).toContain(
      '--remove-label "ci-pending"'
    );
    expect(waitingForCi.slice(cleanup)).toContain('--remove-label "ci-ready"');
    expect(waitingForCi.slice(cleanup)).toContain("for attempt in 1 2 3; do");
    expect(waitingForCi.slice(cleanup)).toContain(
      'gh issue view "${{ github.event.issue.number }}"'
    );
  });

  test("clears pending authorization on every rejected approval", () => {
    const waitingForCi = workflow.slice(
      workflow.indexOf("  waiting-for-ci:"),
      workflow.indexOf("  publish:")
    );
    const reject = waitingForCi.slice(
      waitingForCi.indexOf("name: Reject invalid approval"),
      waitingForCi.indexOf("name: Get auth token")
    );

    expect(reject).toContain("always()");
    expect(reject).toContain("steps.target.outcome != 'success'");
    expect(reject).toContain('--remove-label "accepted"');
    expect(reject).toContain('--remove-label "ci-pending"');
  });

  test("revalidates the live request and approver before ci-ready", () => {
    const poller = readFileSync(".github/workflows/ci-poller.yml", "utf8");
    const ciPassed = poller.slice(
      poller.indexOf('if [[ "$status_ok" == "true"'),
      poller.indexOf("elif [[", poller.indexOf('if [[ "$status_ok" == "true"'))
    );

    expect(ciPassed).toContain("# Verify live approval");
    expect(ciPassed).toContain('REQUIRE_AUTHORIZED="true"');
    expect(ciPassed).toContain('TARGET_REPOSITORY_PATH="$path"');
    expect(ciPassed).toContain(
      "node .__publish__/src/publish/authorize-approval.js"
    );
    expect(
      ciPassed.indexOf("node .__publish__/src/publish/authorize-approval.js")
    ).toBeLessThan(ciPassed.indexOf('gh issue view "$number"'));
    expect(ciPassed).toContain("expected_security_labels");
    expect(ciPassed).toContain("live_security_labels");
    expect(ciPassed.indexOf("Verify live approval")).toBeLessThan(
      ciPassed.indexOf('--add-label "ci-ready"')
    );
  });

  test("re-authorizes the ci-ready event target before target checkout", () => {
    const publishJob = workflow.slice(workflow.indexOf("  publish:"));
    const verification = publishJob.indexOf("name: Verify approved target");
    const checkout = publishJob.indexOf("name: Check out target repo");

    expect(verification).toBeGreaterThan(0);
    expect(verification).toBeLessThan(checkout);
    expect(publishJob.slice(verification, checkout)).toContain(
      'REQUIRE_AUTHORIZED: "true"'
    );
    expect(publishJob.slice(verification, checkout)).toContain(
      "node .__publish__/src/publish/authorize-approval.js"
    );
    expect(publishJob.slice(verification, checkout)).toContain(
      "TARGET_REPOSITORY_PATH: ${{ fromJSON(steps.inputs.outputs.result).path }}"
    );
  });
});
