import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const {
  createApprovalAttestation,
  createCiReadyAttestation,
  requestDigest,
} = require("../../modules/approval-attestation.js");
const {
  getReleaseBranch,
  getPublishDirectory,
  runCraft,
  validateFinalPublication,
} = require("../publish-and-validate.js");

const REVISION = "a".repeat(40);

function response(value) {
  return { json: vi.fn().mockResolvedValue(value), ok: true, status: 200 };
}

function issueData() {
  return {
    body: "Merge target: main",
    labels: [{ name: "accepted" }, { name: "ci-ready" }],
    state: "open",
    title: "publish: getsentry/sentry@1.2.3",
    user: { login: "contractor" },
  };
}

function eventData() {
  return [
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
  ];
}

describe("publish-and-validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPROVAL_TOKEN = "issue-token";
    process.env.RELEASE_TOKEN = "release-token";
    process.env.APPROVAL_ATTESTATION_AUTHOR = "github-actions[bot]";
    process.env.APPROVAL_ISSUE_NUMBER = "123";
    process.env.APPROVAL_ISSUE_REPOSITORY = "getsentry/publish";
    process.env.APPROVAL_ISSUE_TITLE = "publish: getsentry/sentry@1.2.3";
    process.env.EXPECTED_REQUEST_DIGEST = "request-digest";
    process.env.PUBLISH_ATTESTATION_SECRET = "test-attestation-secret";
    process.env.CRAFT_PUBLISH_VERSION = "1.2.3";
    process.env.RELEASE_REPOSITORY = "getsentry/sentry";
    process.env.RELEASE_REVISION = REVISION;
  });

  afterEach(() => {
    delete process.env.CRAFT_PUBLISH_PATH;
    delete process.env.GITHUB_WORKSPACE;
    vi.clearAllMocks();
  });

  test("revalidates the live request and branch head immediately before Craft", async () => {
    const issue = issueData();
    const acceptedEvent = { actor: "contractor", eventId: "100" };
    const ciReadyEvent = {
      actor: "sentry-internal-app[bot]",
      eventId: "200",
    };
    process.env.EXPECTED_REQUEST_DIGEST = requestDigest(issue);
    const comments = [
      {
        body: createApprovalAttestation({
          actor: acceptedEvent.actor,
          eventId: acceptedEvent.eventId,
          issue,
        }),
        user: { login: "github-actions[bot]" },
      },
      {
        body: createCiReadyAttestation({
          acceptedEvent,
          ciReadyEvent,
          issue,
        }),
        user: { login: "github-actions[bot]" },
      },
    ];
    const branchRevisions = [REVISION, REVISION];
    global.fetch = vi.fn((url) => {
      if (url.includes("/check-suites")) {
        return Promise.resolve(
          response({
            check_suites: [
              { head_branch: "release/1.2.3", head_sha: REVISION },
            ],
          })
        );
      }
      if (url.includes("/git/ref/heads/")) {
        return Promise.resolve(
          response({ object: { sha: branchRevisions.shift() } })
        );
      }
      if (url.includes("/events?")) {
        return Promise.resolve(response(eventData()));
      }
      if (url.includes("/comments?")) {
        return Promise.resolve(response(comments));
      }
      return Promise.resolve(response(issue));
    });

    await expect(validateFinalPublication()).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/getsentry/sentry/git/ref/heads/release/1.2.3",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer release-token",
        }),
      })
    );
  });

  test("rejects a branch that moves during final validation", async () => {
    const movedRevision = "b".repeat(40);
    const issue = issueData();
    const acceptedEvent = { actor: "contractor", eventId: "100" };
    const ciReadyEvent = {
      actor: "sentry-internal-app[bot]",
      eventId: "200",
    };
    process.env.EXPECTED_REQUEST_DIGEST = requestDigest(issue);
    const comments = [
      {
        body: createApprovalAttestation({
          actor: acceptedEvent.actor,
          eventId: acceptedEvent.eventId,
          issue,
        }),
        user: { login: "github-actions[bot]" },
      },
      {
        body: createCiReadyAttestation({
          acceptedEvent,
          ciReadyEvent,
          issue,
        }),
        user: { login: "github-actions[bot]" },
      },
    ];
    const branchRevisions = [REVISION, movedRevision];
    global.fetch = vi.fn((url) => {
      if (url.includes("/check-suites")) {
        return Promise.resolve(
          response({
            check_suites: [
              { head_branch: "release/1.2.3", head_sha: REVISION },
            ],
          })
        );
      }
      if (url.includes("/git/ref/heads/")) {
        return Promise.resolve(
          response({ object: { sha: branchRevisions.shift() } })
        );
      }
      if (url.includes("/events?")) {
        return Promise.resolve(response(eventData()));
      }
      if (url.includes("/comments?")) {
        return Promise.resolve(response(comments));
      }
      return Promise.resolve(response(issue));
    });

    await expect(validateFinalPublication()).rejects.toThrow(
      "The release changed before Craft could publish"
    );
  });

  test("rejects ambiguous release branch metadata", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      response({
        check_suites: [
          { head_branch: "release/1.2.3", head_sha: REVISION },
          { head_branch: "release/other", head_sha: REVISION },
        ],
      })
    );

    await expect(
      getReleaseBranch({ repository: "getsentry/sentry", revision: REVISION })
    ).rejects.toThrow("Ambiguous release branches");
  });

  test("rejects a publish path that escapes through a symlink", () => {
    const workspace = mkdtempSync(`${tmpdir()}/publish-and-validate-`);
    const repositoryDirectory = `${workspace}/__repo__`;
    const outsideDirectory = mkdtempSync(`${tmpdir()}/publish-outside-`);
    mkdirSync(repositoryDirectory);
    symlinkSync(outsideDirectory, `${repositoryDirectory}/link`, "dir");
    process.env.GITHUB_WORKSPACE = workspace;
    process.env.CRAFT_PUBLISH_PATH = "link";

    try {
      expect(() => getPublishDirectory()).toThrow(
        "Publish path must remain inside the target checkout"
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      rmSync(outsideDirectory, { force: true, recursive: true });
    }
  });

  test("does not expose the attestation secret to Craft", async () => {
    const child = { on: vi.fn() };
    const spawn = vi.fn();
    child.on.mockImplementation((event, callback) => {
      if (event === "exit") {
        callback(0, null);
      }
      return child;
    });
    spawn.mockReturnValue(child);

    for (const name of [
      "APPROVAL_ATTESTATION_AUTHOR",
      "APPROVAL_ISSUE_NUMBER",
      "APPROVAL_ISSUE_REPOSITORY",
      "APPROVAL_ISSUE_TITLE",
      "APPROVAL_TOKEN",
      "EXPECTED_REQUEST_DIGEST",
      "PUBLISH_ATTESTATION_SECRET",
      "RELEASE_REPOSITORY",
      "RELEASE_REVISION",
      "RELEASE_TOKEN",
    ]) {
      delete process.env[name];
    }
    process.env.RELEASE_REVISION = REVISION;

    await runCraft("/tmp", spawn);

    expect(process.env.PUBLISH_ATTESTATION_SECRET).toBeUndefined();
    expect(process.env.APPROVAL_TOKEN).toBeUndefined();
    expect(process.env.RELEASE_TOKEN).toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      "craft",
      ["publish", "1.2.3", "--rev", REVISION],
      expect.objectContaining({
        env: expect.not.objectContaining({
          APPROVAL_TOKEN: "issue-token",
          PUBLISH_ATTESTATION_SECRET: "test-attestation-secret",
          RELEASE_TOKEN: "release-token",
        }),
      })
    );
  });

  test("refuses to start Craft with validator credentials in its environment", async () => {
    const spawn = vi.fn();

    expect(() => runCraft("/tmp", spawn)).toThrow(
      "Refusing to start Craft with validator credentials"
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  test("removes credential files before starting Craft", () => {
    const source = readFileSync("src/publish/publish-and-validate.js", "utf8");
    const validation = source.indexOf("await validateFinalPublication");
    const cleanup = source.indexOf("fs.rmSync(filePath", validation);
    const craft = source.indexOf("await runCraft", cleanup);

    expect(validation).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(validation);
    expect(cleanup).toBeLessThan(craft);
  });
});
