import { expect, test } from "vitest";

const {
  getReleaseRevision,
  updateReleaseRevision,
} = require("../release-revision.js");

const REVISION = "7e5ca7ed5581552de066e2a8bc295b8306be38ac";

function requestBody(quickLinks) {
  return `Requested by: @byk

Merge target: (default)

Quick links:
${quickLinks}`;
}

function canonicalQuickLinks(revision = REVISION) {
  return `- [View changes](https://github.com/getsentry/toolkit/compare/1.2.2...release/1.2.3)
- [View check runs](https://github.com/getsentry/toolkit/commit/${revision}/checks/)`;
}

test("gets the CI-approved revision from the request header", () => {
  expect(
    getReleaseRevision({
      repo: "toolkit",
      issueBody: requestBody(canonicalQuickLinks()),
    })
  ).toBe(REVISION);
});

test("accepts CRLF request bodies", () => {
  expect(
    getReleaseRevision({
      repo: "toolkit",
      issueBody: requestBody(canonicalQuickLinks()).replace(/\n/g, "\r\n"),
    })
  ).toBe(REVISION);
});

test("accepts a check-runs URL without a trailing slash", () => {
  expect(
    getReleaseRevision({
      repo: "toolkit",
      issueBody: requestBody(canonicalQuickLinks().replace("/checks/)", "/checks)")),
    })
  ).toBe(REVISION);
});

test("rejects a check-runs URL without the checks path", () => {
  expect(() =>
    getReleaseRevision({
      repo: "toolkit",
      issueBody: requestBody(canonicalQuickLinks().replace("/checks/)", ")")),
    })
  ).toThrow("Expected a View check runs link for getsentry/toolkit");
});

test("rejects a check-runs link for another repository", () => {
  expect(() =>
    getReleaseRevision({
      repo: "toolkit",
      issueBody: requestBody(
        canonicalQuickLinks().replace(
          "https://github.com/getsentry/toolkit/commit",
          "https://github.com/getsentry/other/commit"
        )
      ),
    })
  ).toThrow("Expected a View check runs link for getsentry/toolkit");
});

test("rejects a decoy check-runs link outside the request header", () => {
  expect(() =>
    getReleaseRevision({
      repo: "toolkit",
      issueBody: `${requestBody(canonicalQuickLinks())}

<details>
Quick links:
- [View changes](https://github.com/getsentry/toolkit/compare/1.2.2...release/1.2.3)
- [View check runs](https://github.com/getsentry/toolkit/commit/${"a".repeat(
        40
      )}/checks/)
</details>`,
    })
  ).toThrow("Expected exactly one View check runs link in Quick links");
});

test("rejects an embedded check-runs link outside the request header", () => {
  expect(() =>
    getReleaseRevision({
      repo: "toolkit",
      issueBody: `${requestBody(canonicalQuickLinks())}

Ignored - [View check runs](https://github.com/getsentry/toolkit/commit/${"a".repeat(
        40
      )}/checks/)`,
    })
  ).toThrow("Expected exactly one View check runs link in Quick links");
});

test("rejects a complete Quick links block outside the request header", () => {
  expect(() =>
    getReleaseRevision({
      repo: "toolkit",
      issueBody: `### Changelog

Quick links:
${canonicalQuickLinks()}`,
    })
  ).toThrow("Expected a View check runs link for getsentry/toolkit");
});

test("rejects a complete request header outside the issue start", () => {
  expect(() =>
    getReleaseRevision({
      repo: "toolkit",
      issueBody: `### Changelog

${requestBody(canonicalQuickLinks())}`,
    })
  ).toThrow("Expected a View check runs link for getsentry/toolkit");
});

test("updates only the canonical request-header revision", () => {
  const replacement = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const issueBody = `${requestBody(canonicalQuickLinks()).replace(
    /\n/g,
    "\r\n"
  )}\r\n\r\nTrailing content\r\n`;

  expect(
    updateReleaseRevision({ issueBody, repo: "toolkit", revision: replacement })
  ).toBe(issueBody.replace(REVISION, replacement));
});

test.each(["A".repeat(40), "a".repeat(39), "a".repeat(41)])(
  "rejects an invalid replacement revision: %s",
  (revision) => {
    expect(() =>
      updateReleaseRevision({
        issueBody: requestBody(canonicalQuickLinks()),
        repo: "toolkit",
        revision,
      })
    ).toThrow("Release revision must be a lowercase 40-character SHA.");
  }
);
