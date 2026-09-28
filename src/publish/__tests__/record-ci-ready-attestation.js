import { describe, expect, test, vi } from "vitest";

process.env.PUBLISH_ATTESTATION_SECRET = "test-attestation-secret";

const {
  parseCiReadyAttestation,
  requestDigest,
} = require("../../modules/approval-attestation.js");
const {
  recordCiReadyAttestation,
} = require("../record-ci-ready-attestation.js");

describe("recordCiReadyAttestation", () => {
  test("binds the current approval to the app that will add ci-ready", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";

    await expect(
      recordCiReadyAttestation({
        expectedRequestDigest: requestDigest({
          body: "Merge target: main",
          labels: [{ name: "accepted" }, { name: "ci-ready" }],
          title,
        }),
        getAuthenticatedLogin: vi
          .fn()
          .mockResolvedValue("sentry-internal-app[bot]"),
        getIssue: vi.fn().mockResolvedValue({
          body: "Merge target: main",
          labels: [{ name: "accepted" }, { name: "ci-ready" }],
          state: "open",
          title,
        }),
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "200",
            label: { name: "ci-ready" },
          },
        ]),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toSatisfy((attestation) =>
      expect(parseCiReadyAttestation(attestation)).toEqual({
        acceptedActor: "contractor",
        acceptedEventId: "100",
        ciReadyActor: "sentry-internal-app[bot]",
        ciReadyEventId: "200",
        requestDigest: expect.any(String),
        signature: expect.any(String),
        title,
      })
    );
  });

  test("rejects an approval that changes before ci-ready is recorded", async () => {
    const liveTitle = "publish: getsentry/sentry-python@10.0.0";

    await expect(
      recordCiReadyAttestation({
        expectedRequestDigest: requestDigest({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          title: liveTitle,
        }),
        getAuthenticatedLogin: vi
          .fn()
          .mockResolvedValue("sentry-internal-app[bot]"),
        getIssue: vi.fn().mockResolvedValue({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          state: "open",
          title: liveTitle,
        }),
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
        issueNumber: "123",
        issueTitle: "publish: getsentry/sentry-javascript@10.0.0",
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The approval changed before CI could be marked ready");
  });

  test("rejects a ci-ready event that was already present before emission", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";

    await expect(
      recordCiReadyAttestation({
        expectedPreviousCiReadyEventId: "200",
        expectedRequestDigest: requestDigest({
          body: "Merge target: main",
          labels: [{ name: "accepted" }, { name: "ci-ready" }],
          title,
        }),
        getAuthenticatedLogin: vi
          .fn()
          .mockResolvedValue("sentry-internal-app[bot]"),
        getIssue: vi.fn().mockResolvedValue({
          body: "Merge target: main",
          labels: [{ name: "accepted" }, { name: "ci-ready" }],
          state: "open",
          title,
        }),
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "200",
            label: { name: "ci-ready" },
          },
        ]),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The approval changed before CI could be marked ready");
  });

  test("rejects a re-approval after the event observed by the poller", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";

    await expect(
      recordCiReadyAttestation({
        expectedAcceptedEvent: { actor: "contractor", eventId: "100" },
        expectedRequestDigest: requestDigest({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          title,
        }),
        getAuthenticatedLogin: vi
          .fn()
          .mockResolvedValue("sentry-internal-app[bot]"),
        getIssue: vi.fn().mockResolvedValue({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          state: "open",
          title,
        }),
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "200",
            label: { name: "accepted" },
          },
        ]),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The approval changed before CI could be marked ready");
  });

  test("rejects a valid live approval for a different poller snapshot", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const currentIssue = {
      body: "new revision",
      labels: [{ name: "accepted" }, { name: "dry-run" }],
      state: "open",
      title,
    };

    await expect(
      recordCiReadyAttestation({
        expectedRequestDigest: requestDigest({
          body: "old revision",
          labels: [{ name: "accepted" }],
          title,
        }),
        getAuthenticatedLogin: vi
          .fn()
          .mockResolvedValue("sentry-internal-app[bot]"),
        getIssue: vi.fn().mockResolvedValue(currentIssue),
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The approval changed before CI could be marked ready");
  });
});
