import { describe, expect, test } from "vitest";

process.env.PUBLISH_ATTESTATION_SECRET = "test-attestation-secret";

const {
  createApprovalAttestation,
  createAutoApprovalAttestation,
  createCiReadyAttestation,
  currentAcceptedEvent,
  hasIssueStateChangeAfter,
  hasAutoApprovalAttestation,
  hasApprovalAttestation,
  hasCiReadyAttestation,
  parseApprovalAttestation,
  parseCiReadyAttestation,
  requestDigest,
} = require("../approval-attestation.js");

function issue(title, { body = "", dryRun = false } = {}) {
  return {
    body,
    labels: dryRun ? [{ name: "dry-run" }] : [],
    title,
  };
}

describe("approval attestations", () => {
  test("matches the latest accepted event to a trusted attestation", () => {
    const title = "publish: getsentry/relay/py@1.2.3";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "200",
      issue: publishIssue,
    });
    const event = currentAcceptedEvent([
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
    ]);

    expect(event).toEqual({ actor: "contractor", eventId: "200" });
    expect(
      hasApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        event,
        issue: publishIssue,
      })
    ).toBe(true);
  });

  test("accepts numeric event IDs returned by GitHub's issue events API", () => {
    expect(
      currentAcceptedEvent([
        {
          actor: { login: "contractor" },
          event: "labeled",
          id: 29503999078,
          label: { name: "accepted" },
        },
      ])
    ).toEqual({ actor: "contractor", eventId: "29503999078" });
  });

  test("rejects event IDs that cannot be represented exactly as numbers", () => {
    expect(
      currentAcceptedEvent([
        {
          actor: { login: "contractor" },
          event: "labeled",
          id: Number.MAX_SAFE_INTEGER + 1,
          label: { name: "accepted" },
        },
      ])
    ).toBeNull();
  });

  test("rejects an accepted label after a newer unlabeled event", () => {
    expect(
      currentAcceptedEvent([
        {
          actor: { login: "contractor" },
          event: "labeled",
          id: "200",
          label: { name: "accepted" },
        },
        {
          actor: { login: "maintainer" },
          event: "unlabeled",
          id: "201",
          label: { name: "accepted" },
        },
      ])
    ).toBeNull();
  });

  test("fails closed on malformed accepted-label event IDs", () => {
    expect(
      currentAcceptedEvent([
        {
          actor: { login: "maintainer" },
          event: "labeled",
          id: "not-an-event-id",
          label: { name: "accepted" },
        },
      ])
    ).toBeNull();
  });

  test("invalidates approval after the issue is closed or reopened", () => {
    expect(
      hasIssueStateChangeAfter(
        [
          { event: "closed", id: "201" },
          { event: "reopened", id: "202" },
        ],
        { actor: "contractor", eventId: "200" }
      )
    ).toBe(true);
  });

  test("matches a CI-ready attestation to the current accepted event", () => {
    const event = { actor: "contractor", eventId: "200" };
    const title = "publish: getsentry/relay/py@1.2.3";
    const publishIssue = issue(title);
    const ciReadyEvent = {
      actor: "sentry-internal-app[bot]",
      eventId: "300",
    };
    const attestation = createCiReadyAttestation({
      acceptedEvent: event,
      ciReadyEvent,
      issue: publishIssue,
    });

    expect(parseCiReadyAttestation(attestation)).toMatchObject({
      ciReadyEventId: "300",
    });

    expect(
      hasCiReadyAttestation({
        acceptedEvent: event,
        attestationAuthor: "github-actions[bot]",
        ciReadyEvent,
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        issue: publishIssue,
      })
    ).toBe(true);
    expect(
      hasCiReadyAttestation({
        acceptedEvent: { actor: "contractor", eventId: "201" },
        attestationAuthor: "github-actions[bot]",
        ciReadyEvent: { actor: "sentry-internal-app[bot]", eventId: "300" },
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        issue: publishIssue,
      })
    ).toBe(false);
    expect(
      hasCiReadyAttestation({
        acceptedEvent: event,
        attestationAuthor: "github-actions[bot]",
        ciReadyEvent: { actor: "contractor", eventId: "301" },
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        issue: publishIssue,
      })
    ).toBe(false);
    expect(
      hasCiReadyAttestation({
        acceptedEvent: event,
        attestationAuthor: "github-actions[bot]",
        ciReadyEvent: { actor: "sentry-internal-app[bot]", eventId: "301" },
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        issue: publishIssue,
      })
    ).toBe(false);
  });

  test("does not reuse an automated proof after accepted is re-added", () => {
    const publishIssue = issue("publish: getsentry/relay/py@1.2.3");
    const attestation = createAutoApprovalAttestation({
      acceptedEvent: { actor: "sentry-internal-app[bot]", eventId: "100" },
      autoApprover: "getsantry[bot]",
      issue: publishIssue,
    });

    expect(
      hasAutoApprovalAttestation({
        acceptedEvent: { actor: "sentry-internal-app[bot]", eventId: "200" },
        attestationAuthor: "github-actions[bot]",
        autoApprover: "getsantry[bot]",
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        issue: publishIssue,
      })
    ).toBe(false);
  });

  test("rejects malformed or stale attestations", () => {
    const title = "publish: getsentry/relay/py@1.2.3";
    const publishIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "getsantry[bot]",
      eventId: "200",
      issue: publishIssue,
    });

    expect(
      hasApprovalAttestation({
        attestationAuthor: "sentry-internal-app[bot]",
        comments: [{ body: attestation, user: { login: "contractor" } }],
        event: { actor: "getsantry[bot]", eventId: "200" },
        issue: publishIssue,
      })
    ).toBe(false);
    expect(
      hasApprovalAttestation({
        attestationAuthor: "sentry-internal-app[bot]",
        comments: [
          {
            body: attestation,
            user: { login: "sentry-internal-app[bot]" },
          },
        ],
        event: { actor: "getsantry[bot]", eventId: "201" },
        issue: issue("publish: getsentry/relay/py@1.2.4"),
      })
    ).toBe(false);
    expect(
      parseApprovalAttestation("<!-- publish-approval not-base64 -->")
    ).toBeNull();
  });

  test("rejects a request after its dry-run state changes", () => {
    const title = "publish: getsentry/relay/py@1.2.3";
    const attestedIssue = issue(title);
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "200",
      issue: attestedIssue,
    });

    expect(parseApprovalAttestation(attestation)).toMatchObject({
      requestDigest: requestDigest(attestedIssue),
    });
    expect(
      hasApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        comments: [
          { body: attestation, user: { login: "github-actions[bot]" } },
        ],
        event: { actor: "contractor", eventId: "200" },
        issue: issue(title, { dryRun: true }),
      })
    ).toBe(false);
  });

  test("rejects an unsigned approval attestation", () => {
    const publishIssue = issue("publish: getsentry/relay/py@1.2.3");
    const unsignedAttestation = `<!-- publish-approval ${Buffer.from(
      JSON.stringify({
        actor: "contractor",
        eventId: "200",
        requestDigest: requestDigest(publishIssue),
        title: publishIssue.title,
      })
    ).toString("base64url")} -->`;

    expect(
      hasApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        comments: [
          {
            body: unsignedAttestation,
            user: { login: "github-actions[bot]" },
          },
        ],
        event: { actor: "contractor", eventId: "200" },
        issue: publishIssue,
      })
    ).toBe(false);
  });

  test("rejects an attestation whose signed request was modified", () => {
    const publishIssue = issue("publish: getsentry/relay/py@1.2.3");
    const attestation = createApprovalAttestation({
      actor: "contractor",
      eventId: "200",
      issue: publishIssue,
    });
    const parsed = parseApprovalAttestation(attestation);
    const tampered = `<!-- publish-approval ${Buffer.from(
      JSON.stringify({ ...parsed, actor: "maintainer" })
    ).toString("base64url")} -->`;

    expect(
      hasApprovalAttestation({
        attestationAuthor: "github-actions[bot]",
        comments: [{ body: tampered, user: { login: "github-actions[bot]" } }],
        event: { actor: "contractor", eventId: "200" },
        issue: publishIssue,
      })
    ).toBe(false);
  });
});
