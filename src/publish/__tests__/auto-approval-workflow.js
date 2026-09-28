import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(".github/workflows/auto-approve.yml", "utf8");

describe("auto-approval workflow", () => {
  test("checks out the code used to record the attestation", () => {
    const checkout = workflow.slice(
      workflow.indexOf("uses: actions/checkout@"),
      workflow.indexOf("Record automated approval attestation")
    );

    expect(checkout).not.toContain("sparse-checkout:");
  });

  test("binds the automated proof to the accepted label event", () => {
    expect(workflow).toContain("node src/publish/request-digest-from-event.js");
    expect(workflow).toContain("--add-label accepted");
    expect(workflow).toContain(
      "EXPECTED_REQUEST_DIGEST: ${{ steps.request-digest.outputs.request_digest }}"
    );
    expect(workflow).toContain(
      "node src/publish/record-auto-approval-attestation.js"
    );
    expect(workflow.indexOf("--add-label accepted")).toBeLessThan(
      workflow.indexOf("record-auto-approval-attestation.js")
    );
    expect(workflow).toContain(
      "PUBLISH_ATTESTATION_SECRET: ${{ secrets.PUBLISH_ATTESTATION_SECRET }}"
    );
  });

  test("posts the proof as github-actions before activating CI polling", () => {
    const label = workflow.indexOf("--add-label accepted");
    const record = workflow.indexOf("record-auto-approval-attestation.js");
    const proof = workflow.indexOf("Post automated approval attestation");

    expect(label).toBeLessThan(record);
    expect(record).toBeLessThan(proof);
    expect(workflow.slice(proof)).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow.slice(proof)).toContain(
      "GH_TOKEN: ${{ steps.token.outputs.token }}"
    );
  });

  test("enables the cron poller as an independent recovery path", () => {
    expect(workflow).toContain("name: Get poller app token");
    expect(workflow).toContain("name: Enable cron poller");
    expect(workflow).toContain(
      'gh variable set CI_POLLER_HAS_PENDING -R "$GITHUB_REPOSITORY" -b "true"'
    );
    expect(workflow).toContain("steps.enable-poller.outcome != 'success'");
    expect(workflow).toContain(
      "steps.auto-approval.outputs.attempted == 'true'"
    );
  });

  test("records the mutation attempt before adding accepted", () => {
    const attempt = workflow.indexOf("attempted=true");
    const label = workflow.indexOf("gh issue edit", attempt);

    expect(attempt).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(attempt);
    expect(workflow).toContain(
      "steps.auto-approval.outputs.attempted == 'true'"
    );
  });
});
