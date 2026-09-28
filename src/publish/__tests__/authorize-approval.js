import { afterEach, describe, expect, test, vi } from "vitest";

process.env.PUBLISH_ATTESTATION_SECRET = "test-attestation-secret";
import fs from "fs";
const {
  createAutoApprovalAttestation,
  requestDigest,
} = require("../../modules/approval-attestation.js");
const {
  getAutoApprovedRepositories,
  main,
  getPermission,
} = require("../authorize-approval.js");

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
  vi.resetModules();
});

function jsonResponse(json) {
  return { ok: true, json: vi.fn().mockResolvedValue(json) };
}

async function runAuthorization({ actor, issueTitle, responses }) {
  process.env.GITHUB_OUTPUT = "/tmp/github-output";
  process.env.APPROVAL_TOKEN = "issue-token";
  process.env.TARGET_REPOSITORY_TOKEN = "release-bot-token";
  process.env.APPROVAL_ACTOR = actor;
  process.env.APPROVAL_ISSUE_NUMBER = "123";
  process.env.APPROVAL_ISSUE_REPOSITORY = "getsentry/publish";
  process.env.APPROVAL_ISSUE_TITLE = issueTitle;
  process.env.EXPECTED_REQUEST_DIGEST = requestDigest({
    body: "Merge target: main",
    labels: [{ name: "accepted" }],
    title: issueTitle,
  });

  const appendFileSync = vi
    .spyOn(fs, "appendFileSync")
    .mockImplementation(() => {});
  global.fetch = vi.fn();
  for (const response of responses) {
    global.fetch.mockResolvedValueOnce(response);
  }

  await main();
  await vi.waitFor(() => expect(appendFileSync).toHaveBeenCalled());

  return { appendFileSync, fetch: global.fetch };
}

describe("authorize-approval entry point", () => {
  test("loads the auto-approval allowlist from the checked-out source tree", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue("");

    getAutoApprovedRepositories();

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("/auto-approve-repos.txt"),
      "utf8"
    );
  });

  test("loads exact release paths from the auto-approval allowlist", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      "getsentry/sentry-javascript\ngetsentry/objectstore/clients\n"
    );

    expect(getAutoApprovedRepositories()).toEqual(
      new Set(["getsentry/sentry-javascript", "getsentry/objectstore/clients"])
    );
  });

  test("writes authorization after a successful GitHub permission lookup", async () => {
    const { appendFileSync, fetch } = await runAuthorization({
      actor: "contractor",
      issueTitle: "publish: getsentry/sentry-javascript@10.0.0",
      responses: [
        jsonResponse({ role_name: "write" }),
        jsonResponse({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          state: "open",
          title: "publish: getsentry/sentry-javascript@10.0.0",
          user: { login: "requester" },
        }),
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
      ],
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/getsentry/sentry-javascript/collaborators/contractor/permission",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer release-bot-token",
        }),
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/getsentry/publish/issues/123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer issue-token",
        }),
      })
    );
    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      expect.stringMatching(
        /^authorized=true\napproval_attestation=<!-- publish-approval .+ -->\n$/
      )
    );
  });

  test("rejects a requester approving their own release", async () => {
    const { appendFileSync } = await runAuthorization({
      actor: "contractor",
      issueTitle: "publish: getsentry/sentry-javascript@10.0.0",
      responses: [
        jsonResponse({ role_name: "write" }),
        jsonResponse({
          body: "Merge target: main",
          labels: [{ name: "accepted" }],
          state: "open",
          title: "publish: getsentry/sentry-javascript@10.0.0",
          user: { login: "contractor" },
        }),
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
      ],
    });

    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      "authorized=false\n"
    );
  });

  test("rejects a valid live approval for a different label-event snapshot", async () => {
    const issueTitle = "publish: getsentry/sentry-javascript@10.0.0";
    const { appendFileSync } = await runAuthorization({
      actor: "contractor",
      issueTitle,
      responses: [
        jsonResponse({ role_name: "write" }),
        jsonResponse({
          body: "changed after accepted",
          labels: [{ name: "accepted" }, { name: "dry-run" }],
          state: "open",
          title: issueTitle,
          user: { login: "requester" },
        }),
        jsonResponse([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
      ],
    });

    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      "authorized=false\n"
    );
  });

  test("authorizes an allowlisted automated request with a request proof", async () => {
    const issue = {
      body: "Merge target: main",
      labels: [{ name: "accepted" }],
      state: "open",
      title: "publish: getsentry/relay@1.2.3",
      user: { login: "getsantry[bot]" },
    };
    const { appendFileSync, fetch } = await runAuthorization({
      actor: "sentry-internal-app[bot]",
      issueTitle: issue.title,
      responses: [
        jsonResponse(issue),
        jsonResponse([
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
        jsonResponse([
          {
            body: createAutoApprovalAttestation({
              acceptedEvent: {
                actor: "sentry-internal-app[bot]",
                eventId: "100",
              },
              autoApprover: "getsantry[bot]",
              issue,
            }),
            user: { login: "github-actions[bot]" },
          },
        ]),
      ],
    });

    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/collaborators/"),
      expect.anything()
    );
    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      expect.stringMatching(
        /^authorized=true\napproval_attestation=<!-- publish-approval .+ -->\n$/
      )
    );
  });

  test("rejects an automated approval without a request proof", async () => {
    const issue = {
      body: "Merge target: main",
      labels: [{ name: "accepted" }],
      state: "open",
      title: "publish: getsentry/relay@1.2.3",
      user: { login: "getsantry[bot]" },
    };
    const { appendFileSync } = await runAuthorization({
      actor: "sentry-internal-app[bot]",
      issueTitle: issue.title,
      responses: [
        jsonResponse(issue),
        jsonResponse([
          {
            actor: { login: "sentry-internal-app[bot]" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
        ]),
        jsonResponse([]),
      ],
    });

    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      "authorized=false\n"
    );
  });

  test("rejects direct approval by an automated opener", async () => {
    const { appendFileSync, fetch } = await runAuthorization({
      actor: "sentry-release-bot[bot]",
      issueTitle: "publish: getsentry/relay@1.2.3",
      responses: [],
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      "authorized=false\n"
    );
  });

  test("fails closed when GitHub cannot return a permission", async () => {
    process.env.GITHUB_OUTPUT = "/tmp/github-output";
    process.env.APPROVAL_TOKEN = "issue-token";
    process.env.TARGET_REPOSITORY_TOKEN = "release-bot-token";
    process.env.APPROVAL_ACTOR = "contractor";
    process.env.APPROVAL_ISSUE_NUMBER = "123";
    process.env.APPROVAL_ISSUE_REPOSITORY = "getsentry/publish";
    process.env.APPROVAL_ISSUE_TITLE =
      "publish: getsentry/sentry-javascript@10.0.0";
    process.env.EXPECTED_REQUEST_DIGEST = requestDigest({
      body: "Merge target: main",
      labels: [{ name: "accepted" }],
      title: process.env.APPROVAL_ISSUE_TITLE,
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const appendFileSync = vi
      .spyOn(fs, "appendFileSync")
      .mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).rejects.toThrow(
      "Could not retrieve contractor's permission for getsentry/sentry-javascript: GitHub returned 404"
    );

    expect(error).not.toHaveBeenCalled();
    expect(appendFileSync).not.toHaveBeenCalled();
  });

  test("does not fall back to the issue token for permission lookup", async () => {
    process.env.APPROVAL_TOKEN = "issue-token";
    delete process.env.TARGET_REPOSITORY_TOKEN;
    global.fetch = vi.fn();

    await expect(
      getPermission({
        owner: "getsentry",
        repository: "sentry-javascript",
        username: "contractor",
      })
    ).rejects.toThrow(
      'No "TARGET_REPOSITORY_TOKEN" environment variable found'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
