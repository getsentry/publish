import { afterEach, describe, expect, test, vi } from "vitest";
import fs from "fs";

const {
  currentAcceptedActor,
  getPermission,
  main,
} = require("../authorize-approval.js");

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("authorize approval entry point", () => {
  test("accepts a getsantry[bot] label event before starting CI", async () => {
    process.env.GITHUB_OUTPUT = "/tmp/github-output";
    process.env.APPROVAL_ACTOR = "getsantry[bot]";
    process.env.APPROVAL_ACTOR_ID = "66042841";
    process.env.APPROVAL_ACTOR_TYPE = "Bot";
    process.env.TARGET_REPOSITORY = "sentry-protos";
    process.env.TARGET_REPOSITORY_PATH = ".";
    delete process.env.TARGET_REPOSITORY_TOKEN;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const appendFileSync = vi
      .spyOn(fs, "appendFileSync")
      .mockImplementation(() => {});

    await main();

    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      "authorized=true\n"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("revalidates the getsantry[bot] label event after CI", async () => {
    process.env.APPROVAL_ISSUE_NUMBER = "9788";
    process.env.APPROVAL_ISSUE_REPOSITORY = "getsentry/publish";
    process.env.APPROVAL_TOKEN = "issue-token";
    process.env.TARGET_REPOSITORY = "sentry-protos";
    process.env.TARGET_REPOSITORY_PATH = ".";
    process.env.REQUIRE_AUTHORIZED = "true";
    delete process.env.APPROVAL_ACTOR;
    delete process.env.GITHUB_OUTPUT;
    delete process.env.TARGET_REPOSITORY_TOKEN;
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          event: "labeled",
          label: { name: "accepted" },
          actor: { login: "getsantry[bot]", id: 66042841, type: "Bot" },
        },
      ]),
    });
    vi.stubGlobal("fetch", fetch);

    await expect(main()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain(
      "/repos/getsentry/publish/issues/9788/events?"
    );
  });

  test("rejects a relabeled event with the wrong bot account ID", async () => {
    process.env.APPROVAL_ISSUE_NUMBER = "9788";
    process.env.APPROVAL_ISSUE_REPOSITORY = "getsentry/publish";
    process.env.APPROVAL_TOKEN = "issue-token";
    process.env.TARGET_REPOSITORY = "sentry-protos";
    process.env.TARGET_REPOSITORY_PATH = ".";
    process.env.REQUIRE_AUTHORIZED = "true";
    delete process.env.APPROVAL_ACTOR;
    delete process.env.GITHUB_OUTPUT;
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          event: "labeled",
          label: { name: "accepted" },
          actor: { login: "getsantry[bot]", id: 264270552, type: "Bot" },
        },
      ]),
    });
    vi.stubGlobal("fetch", fetch);

    await expect(main()).rejects.toThrow(
      "Approval is not authorized for the target repository"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("rejects a getsantry approval transferred to an unlisted target", async () => {
    process.env.APPROVAL_ISSUE_NUMBER = "9788";
    process.env.APPROVAL_ISSUE_REPOSITORY = "getsentry/publish";
    process.env.APPROVAL_TOKEN = "issue-token";
    process.env.TARGET_REPOSITORY = "sentry-javascript";
    process.env.TARGET_REPOSITORY_PATH = ".";
    process.env.REQUIRE_AUTHORIZED = "true";
    delete process.env.APPROVAL_ACTOR;
    delete process.env.GITHUB_OUTPUT;
    delete process.env.TARGET_REPOSITORY_TOKEN;
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          event: "labeled",
          label: { name: "accepted" },
          actor: { login: "getsantry[bot]", id: 66042841, type: "Bot" },
        },
      ]),
    });
    vi.stubGlobal("fetch", fetch);

    await expect(main()).rejects.toThrow(
      "Approval is not authorized for the target repository"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("uses the actor from the current accepted-label transition", () => {
    expect(
      currentAcceptedActor([
        {
          actor: { login: "first-approver" },
          event: "labeled",
          label: { name: "accepted" },
        },
        {
          actor: { login: "automation" },
          event: "unlabeled",
          label: { name: "accepted" },
        },
        {
          actor: { login: "current-approver", id: 99, type: "User" },
          event: "labeled",
          label: { name: "accepted" },
        },
      ])
    ).toEqual({ login: "current-approver", id: 99, type: "User" });
  });

  test("rejects an accepted label that was removed", () => {
    expect(
      currentAcceptedActor([
        {
          actor: { login: "approver" },
          event: "labeled",
          label: { name: "accepted" },
        },
        {
          actor: { login: "automation" },
          event: "unlabeled",
          label: { name: "accepted" },
        },
      ])
    ).toBeNull();
  });

  test("uses the target-scoped token and authorizes a writer", async () => {
    process.env.GITHUB_OUTPUT = "/tmp/github-output";
    process.env.APPROVAL_ACTOR = "approver";
    process.env.TARGET_REPOSITORY = "sentry-javascript";
    process.env.TARGET_REPOSITORY_PATH = ".";
    process.env.TARGET_REPOSITORY_TOKEN = "target-token";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        permission: "write",
        role_name: "write",
      }),
    });
    const appendFileSync = vi
      .spyOn(fs, "appendFileSync")
      .mockImplementation(() => {});

    await main();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/getsentry/sentry-javascript/collaborators/approver/permission",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer target-token",
        }),
      })
    );
    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/github-output",
      "authorized=true\n"
    );
  });

  test("fails closed when the target token is missing", async () => {
    delete process.env.TARGET_REPOSITORY_TOKEN;
    global.fetch = vi.fn();

    await expect(
      getPermission({
        owner: "getsentry",
        repository: "sentry-javascript",
        username: "approver",
      })
    ).rejects.toThrow(
      'No "TARGET_REPOSITORY_TOKEN" environment variable found'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("does not expose permission details when GitHub rejects the lookup", async () => {
    process.env.TARGET_REPOSITORY_TOKEN = "target-token";
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(
      getPermission({
        owner: "getsentry",
        repository: "sentry-javascript",
        username: "approver",
      })
    ).rejects.toThrow(
      "Could not verify approval permission: GitHub returned 403"
    );
  });
});
