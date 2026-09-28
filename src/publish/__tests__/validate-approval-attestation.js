import { afterEach, describe, expect, test, vi } from "vitest";

process.env.PUBLISH_ATTESTATION_SECRET = "test-attestation-secret";

const {
  validateApprovalAttestation,
} = require("../validate-approval-attestation.js");
const {
  createApprovalAttestation,
  createAutoApprovalAttestation,
  createCiReadyAttestation,
  requestDigest,
} = require("../../modules/approval-attestation.js");

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(json) {
  return { ok: true, json: vi.fn().mockResolvedValue(json) };
}

function issue(
  title,
  { body = "", labels = [{ name: "accepted" }], state = "open" } = {}
) {
  return { body, labels, state, title };
}

describe("validateApprovalAttestation", () => {
  test("accepts the current accepted event and its trusted attestation", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(true);
  });

  test("rejects a valid approval while ci-pending remains", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title, {
      labels: [{ name: "accepted" }, { name: "ci-pending" }],
    });
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
        requireCiPendingAbsent: true,
      })
    ).resolves.toBe(false);
  });

  test("accepts an allowlisted automated approval attestation", async () => {
    const title = "publish: getsentry/relay/py@1.2.3";
    const acceptedEvent = {
      actor: "sentry-internal-app[bot]",
      eventId: "100",
    };
    const publishIssue = {
      ...issue(title, { labels: [{ name: "accepted" }, { name: "ci-ready" }] }),
      user: { login: "getsantry[bot]" },
    };
    const autoApprovalAttestation = createAutoApprovalAttestation({
      acceptedEvent,
      autoApprover: "getsantry[bot]",
      issue: publishIssue,
    });
    const ciReadyAttestation = createCiReadyAttestation({
      acceptedEvent,
      ciReadyEvent: {
        actor: "sentry-internal-app[bot]",
        eventId: "200",
      },
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: acceptedEvent.actor },
            event: "labeled",
            id: acceptedEvent.eventId,
            label: { name: "accepted" },
          },
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "200",
            label: { name: "ci-ready" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            body: autoApprovalAttestation,
            user: { login: "github-actions[bot]" },
          },
          {
            body: ciReadyAttestation,
            user: { login: "github-actions[bot]" },
          },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
        requireCiReadyAttestation: true,
      })
    ).resolves.toBe(true);
  });

  test("rejects an attestation after the issue title changes", async () => {
    const attestedTitle = "publish: getsentry/sentry-javascript@10.0.0";
    const currentTitle = "publish: getsentry/sentry-python@10.0.0";
    const attestedIssue = issue(attestedTitle);
    const currentIssue = issue(currentTitle);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: attestedIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(currentIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(currentIssue),
        issueNumber: "123",
        issueTitle: currentTitle,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects an attestation after the issue body changes", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const attestedIssue = issue(title);
    const currentIssue = issue(title, {
      body: "Merge target: main\n\n- [ ] npm",
    });
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: attestedIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(currentIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(attestedIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects a valid live approval for a different poller snapshot", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const listedIssue = issue(title, { body: "old revision" });
    const currentIssue = issue(title, {
      body: "new revision",
      labels: [{ name: "accepted" }, { name: "dry-run" }],
    });
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "200",
      issue: currentIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(currentIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "200",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(listedIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects an attestation when accepted was removed", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(issue(title, { labels: [] })))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects an attestation after the issue is closed", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(issue(title, { state: "closed" })))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects an approval reused after the issue is closed and reopened", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
          { event: "closed", id: "200" },
          { event: "reopened", id: "300" },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects an attestation after accepted is re-added", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "100",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "200",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("rejects a later attested approval when an earlier event was checked", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "200",
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "200",
            label: { name: "accepted" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { body: attestation, user: { login: "github-actions[bot]" } },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedAcceptedEvent: { actor: "contractor", eventId: "100" },
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
      })
    ).resolves.toBe(false);
  });

  test("requires a CI-ready proof tied to the current approval and label actor", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const acceptedEvent = { actor: "contractor", eventId: "100" };
    const publishIssue = issue(title, {
      labels: [{ name: "accepted" }, { name: "ci-ready" }],
    });
    const approvalAttestation = createApprovalAttestation({
      actor: acceptedEvent.actor,
      eventId: acceptedEvent.eventId,
      issue: publishIssue,
    });
    const ciReadyAttestation = createCiReadyAttestation({
      acceptedEvent,
      ciReadyEvent: {
        actor: "sentry-internal-app[bot]",
        eventId: "200",
      },
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: acceptedEvent.actor },
            event: "labeled",
            id: acceptedEvent.eventId,
            label: { name: "accepted" },
          },
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "200",
            label: { name: "ci-ready" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            body: approvalAttestation,
            user: { login: "github-actions[bot]" },
          },
          {
            body: ciReadyAttestation,
            user: { login: "github-actions[bot]" },
          },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
        requireCiReadyAttestation: true,
      })
    ).resolves.toBe(true);
  });

  test("rejects a manually added ci-ready label", async () => {
    const title = "publish: getsentry/sentry-javascript@10.0.0";
    const acceptedEvent = { actor: "contractor", eventId: "100" };
    const publishIssue = issue(title, {
      labels: [{ name: "accepted" }, { name: "ci-ready" }],
    });
    const approvalAttestation = createApprovalAttestation({
      actor: acceptedEvent.actor,
      eventId: acceptedEvent.eventId,
      issue: publishIssue,
    });
    const ciReadyAttestation = createCiReadyAttestation({
      acceptedEvent,
      ciReadyEvent: {
        actor: "sentry-internal-app[bot]",
        eventId: "200",
      },
      issue: publishIssue,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(publishIssue))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            actor: { login: acceptedEvent.actor },
            event: "labeled",
            id: acceptedEvent.eventId,
            label: { name: "accepted" },
          },
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "200",
            label: { name: "ci-ready" },
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            body: approvalAttestation,
            user: { login: "github-actions[bot]" },
          },
          {
            body: ciReadyAttestation,
            user: { login: "github-actions[bot]" },
          },
        ])
      );

    await expect(
      validateApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        expectedRequestDigest: requestDigest(publishIssue),
        issueNumber: "123",
        issueTitle: title,
        repository: "getsentry/publish",
        requireCiReadyAttestation: true,
      })
    ).resolves.toBe(false);
  });
});
