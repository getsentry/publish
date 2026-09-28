import { describe, expect, test } from "vitest";

const { requestDigest } = require("../../modules/approval-attestation.js");
const { requestDigestFromEvent } = require("../request-digest-from-event.js");

describe("requestDigestFromEvent", () => {
  test("digests the exact issue event snapshot", () => {
    const issue = {
      body: "Merge target: main",
      labels: [{ name: "accepted" }, { name: "dry-run" }],
      title: "publish: getsentry/relay@1.2.3",
    };

    expect(requestDigestFromEvent({ issue })).toBe(requestDigest(issue));
  });

  test("rejects events without a complete issue snapshot", () => {
    expect(() => requestDigestFromEvent({})).toThrow(
      "The GitHub event has no issue snapshot"
    );
    expect(() =>
      requestDigestFromEvent({ issue: { body: "", labels: [] } })
    ).toThrow("Invalid publish request");
  });
});
