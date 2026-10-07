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

  test.each([
    "github-actions[bot]",
    "unlisted-app[bot]",
    "getsantry-app[bot]",
    "Getsantry[bot]",
  ])("rejects direct approval by %s", async (actor) => {
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
  });

  test.each([
    ["sentry-junior[bot]", 264270552, "junior", "."],
    ["sentry-junior[bot]", 264270552, "sentry-javascript", "."],
    ["sentry-junior[bot]", 264270552, "objectstore", "./other"],
    ["getsantry[bot]", 66042841, "sentry-protos", "."],
    ["getsantry[bot]", 66042841, "arroyo", "."],
    ["getsantry[bot]", 66042841, "objectstore", "./clients"],
  ])(
    "allows trusted %s (%i) to approve %s%s",
    async (actor, actorId, repository, publishPath) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor,
          actorId,
          actorType: "Bot",
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

  test.each([
    ["sentry-javascript", "."],
    ["objectstore", "."],
    ["objectstore", "./other"],
  ])(
    "rejects getsantry[bot] outside the auto-approval list: %s%s",
    async (repository, publishPath) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor: "getsantry[bot]",
          actorId: 66042841,
          actorType: "Bot",
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

  test.each([
    ["getsantry[bot]", 264270552, "Bot"],
    ["getsantry[bot]", 66042841, "User"],
    ["getsantry[bot]", undefined, "Bot"],
    ["sentry-junior[bot]", 66042841, "Bot"],
  ])(
    "rejects mismatched bot identity %s (%s, %s)",
    async (actor, actorId, actorType) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor,
          actorId,
          actorType,
          repository: "sentry-protos",
          getPermission,
        })
      ).resolves.toEqual({
        authorized: false,
        repository: "getsentry/sentry-protos",
      });
      expect(getPermission).not.toHaveBeenCalled();
    }
  );

  test.each(["sentry-junior[bot]", "getsantry[bot]"])(
    "rejects %s approval for an invalid publish path",
    async (actor) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor,
          publishPath: "../escape",
          repository: "junior",
          getPermission,
        })
      ).resolves.toEqual({
        authorized: false,
        repository: "getsentry/junior",
      });
      expect(getPermission).not.toHaveBeenCalled();
    }
  );

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
