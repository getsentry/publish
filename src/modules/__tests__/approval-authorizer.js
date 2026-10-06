import { describe, expect, test, vi } from "vitest";

const {
  AUTO_APPROVAL_LABELER,
  authorizeApproval,
} = require("../approval-authorizer.js");

describe("authorizeApproval", () => {
  test.each([
    ["write", "write"],
    ["write", "maintain"],
    ["admin", "admin"],
  ])("allows a user with %s/%s access", async (permission, roleName) => {
    const getPermission = vi.fn().mockResolvedValue({
      permission,
      role_name: roleName,
    });

    await expect(
      authorizeApproval({
        actor: "approver",
        repository: "sentry-javascript",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: true,
      repository: "getsentry/sentry-javascript",
    });
  });

  test("allows a target repository writer to approve their own request", async () => {
    const getPermission = vi.fn().mockResolvedValue({
      permission: "write",
      role_name: "write",
    });

    await expect(
      authorizeApproval({
        actor: "publisher",
        repository: "sentry-javascript",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: true,
      repository: "getsentry/sentry-javascript",
    });
  });

  test("rejects users without write access", async () => {
    const getPermission = vi.fn().mockResolvedValue({
      permission: "read",
      role_name: "read",
    });

    await expect(
      authorizeApproval({
        actor: "reader",
        repository: "sentry-javascript",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: false,
      repository: "getsentry/sentry-javascript",
    });
  });

  test("fails closed on a contradictory role name", async () => {
    const getPermission = vi.fn().mockResolvedValue({
      permission: "read",
      role_name: "admin",
    });

    await expect(
      authorizeApproval({
        actor: "reader",
        repository: "sentry-javascript",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: false,
      repository: "getsentry/sentry-javascript",
    });
  });

  test("preserves the existing automated approval path", async () => {
    const getPermission = vi.fn();

    await expect(
      authorizeApproval({
        actor: AUTO_APPROVAL_LABELER,
        publishPath: ".",
        repository: "relay",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: true,
      repository: "getsentry/relay",
    });
    expect(getPermission).not.toHaveBeenCalled();
  });

  test.each([
    ["sentry-javascript", "."],
    ["objectstore", "."],
    ["objectstore", "./other"],
  ])(
    "rejects automated approval outside the allowlist: %s%s",
    async (repository, publishPath) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor: AUTO_APPROVAL_LABELER,
          publishPath,
          repository,
          getPermission,
        })
      ).resolves.toEqual({
        authorized: false,
        repository: `getsentry/${repository}`,
      });
      expect(getPermission).not.toHaveBeenCalled();
    }
  );

  test("preserves an allowlisted automated monorepo path", async () => {
    const getPermission = vi.fn();

    await expect(
      authorizeApproval({
        actor: AUTO_APPROVAL_LABELER,
        publishPath: "./clients",
        repository: "objectstore",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: true,
      repository: "getsentry/objectstore",
    });
    expect(getPermission).not.toHaveBeenCalled();
  });

  test.each(["github-actions[bot]", "unlisted-app[bot]"])(
    "rejects direct approval by %s",
    async (actor) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor,
          repository: "sentry-javascript",
          getPermission,
        })
      ).resolves.toEqual({
        authorized: false,
        repository: "getsentry/sentry-javascript",
      });
      expect(getPermission).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["junior", "."],
    ["sentry-mcp", "."],
    ["junior", "./packages/junior"],
  ])(
    "allows sentry-junior[bot] to approve its managed repository: %s%s",
    async (repository, publishPath) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor: "sentry-junior[bot]",
          publishPath,
          repository,
          getPermission,
        })
      ).resolves.toEqual({
        authorized: true,
        repository: `getsentry/${repository}`,
      });
      expect(getPermission).not.toHaveBeenCalled();
    }
  );

  test("rejects sentry-junior[bot] approval outside its managed repositories", async () => {
    const getPermission = vi.fn();

    await expect(
      authorizeApproval({
        actor: "sentry-junior[bot]",
        repository: "sentry-javascript",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: false,
      repository: "getsentry/sentry-javascript",
    });
    expect(getPermission).not.toHaveBeenCalled();
  });

  test("rejects an invalid target repository", async () => {
    const getPermission = vi.fn();

    await expect(
      authorizeApproval({
        actor: "approver",
        repository: "../private",
        getPermission,
      })
    ).resolves.toEqual({ authorized: false, repository: null });
    expect(getPermission).not.toHaveBeenCalled();
  });

  test("propagates permission lookup failures", async () => {
    const getPermission = vi.fn().mockRejectedValue(new Error("unavailable"));

    await expect(
      authorizeApproval({
        actor: "approver",
        repository: "sentry-javascript",
        getPermission,
      })
    ).rejects.toThrow("unavailable");
  });
});
