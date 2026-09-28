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
});

describe("authorize approval entry point", () => {
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
          actor: { login: "current-approver" },
          event: "labeled",
          label: { name: "accepted" },
        },
      ])
    ).toBe("current-approver");
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
