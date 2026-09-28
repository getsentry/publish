import { describe, expect, test, vi } from "vitest";

process.env.PUBLISH_ATTESTATION_SECRET = "test-attestation-secret";

const {
  parseAutoApprovalAttestation,
  requestDigest,
} = require("../../modules/approval-attestation.js");
const {
  recordAutoApprovalAttestation,
} = require("../record-auto-approval-attestation.js");

describe("recordAutoApprovalAttestation", () => {
  test("binds an automated requester to the live publish request", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";

    await expect(
      recordAutoApprovalAttestation({
        autoApprover: "getsantry[bot]",
        expectedRequestDigest: requestDigest({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          title,
        }),
        getIssue: vi.fn().mockResolvedValue({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          state: "open",
          title,
          user: { login: "getsantry[bot]" },
        }),
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "123",
            label: { name: "accepted" },
          },
        ]),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toSatisfy((attestation) =>
      expect(parseAutoApprovalAttestation(attestation)).toEqual({
        acceptedActor: "sentry-internal-app[bot]",
        acceptedEventId: "123",
        autoApprover: "getsantry[bot]",
        requestDigest: expect.any(String),
        signature: expect.any(String),
        title,
      })
    );
  });

  test("rejects a request whose author changed", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";

    await expect(
      recordAutoApprovalAttestation({
        autoApprover: "getsantry[bot]",
        expectedRequestDigest: requestDigest({
          body: "",
          labels: [],
          title,
        }),
        getIssue: vi.fn().mockResolvedValue({
          body: "",
          labels: [],
          state: "open",
          title,
          user: { login: "contractor" },
        }),
        getIssueEvents: vi.fn(),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The automated approval request changed before approval");
  });

  test("rejects a valid live request for a different opened-event snapshot", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";

    await expect(
      recordAutoApprovalAttestation({
        autoApprover: "getsantry[bot]",
        expectedRequestDigest: requestDigest({
          body: "old request",
          labels: [],
          title,
        }),
        getIssue: vi.fn().mockResolvedValue({
          body: "changed request",
          labels: [{ name: "dry-run" }],
          state: "open",
          title,
          user: { login: "getsantry[bot]" },
        }),
        getIssueEvents: vi.fn(),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The automated approval request changed before approval");
  });
});
