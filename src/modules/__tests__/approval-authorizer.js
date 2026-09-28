import { describe, expect, test, vi } from "vitest";

const { authorizeApproval } = require("../approval-authorizer.js");

const issueTitle = "publish: getsentry/sentry-javascript@10.0.0";

describe("authorizeApproval", () => {
  test.each(["getsantry[bot]", "sentry-release-bot[bot]"])(
    "rejects direct approval by %s without a target repository lookup",
    async (actor) => {
      const getPermission = vi.fn();

      await expect(
        authorizeApproval({
          actor,
          issueTitle,
          getPermission,
        })
      ).resolves.toEqual({
        authorized: false,
        repository: "getsentry/sentry-javascript",
      });

      expect(getPermission).not.toHaveBeenCalled();
    }
  );

  test("rejects an unlisted bot even with target repository write access", async () => {
    const getPermission = vi.fn().mockResolvedValue({ role_name: "write" });

    await expect(
      authorizeApproval({
        actor: "unlisted-app[bot]",
        issueTitle,
        getPermission,
      })
    ).resolves.toEqual({
      authorized: false,
      repository: "getsentry/sentry-javascript",
    });

    expect(getPermission).not.toHaveBeenCalled();
  });

  test("rejects the auto-approval bot for a release outside the allowlist", async () => {
    const getPermission = vi.fn().mockResolvedValue({ role_name: "write" });

    await expect(
      authorizeApproval({
        actor: "getsantry[bot]",
        issueTitle,
        getPermission,
      })
    ).resolves.toEqual({
      authorized: false,
      repository: "getsentry/sentry-javascript",
    });

    expect(getPermission).not.toHaveBeenCalled();
  });

  test.each(["write", "maintain", "admin"])(
    "allows a target repository %s collaborator",
    async (roleName) => {
      const getPermission = vi.fn().mockResolvedValue({ role_name: roleName });

      await expect(
        authorizeApproval({
          actor: "contractor",
          issueTitle,
          getPermission,
        })
      ).resolves.toEqual({
        authorized: true,
        repository: "getsentry/sentry-javascript",
      });

      expect(getPermission).toHaveBeenCalledWith({
        owner: "getsentry",
        repository: "sentry-javascript",
        username: "contractor",
      });
    }
  );

  test("authorizes an unqualified title against the getsentry repository", async () => {
    const getPermission = vi.fn().mockResolvedValue({ role_name: "write" });

    await expect(
      authorizeApproval({
        actor: "contractor",
        issueTitle: "publish: sentry-javascript/packages/core@10.0.0",
        getPermission,
      })
    ).resolves.toEqual({
      authorized: true,
      repository: "getsentry/sentry-javascript",
    });

    expect(getPermission).toHaveBeenCalledWith({
      owner: "getsentry",
      repository: "sentry-javascript",
      username: "contractor",
    });
  });

  test.each(["none", "read", "triage", "Elevated Bot", undefined])(
    "rejects a %s target repository collaborator",
    async (roleName) => {
      await expect(
        authorizeApproval({
          actor: "contractor",
          issueTitle,
          getPermission: vi.fn().mockResolvedValue({ role_name: roleName }),
        })
      ).resolves.toEqual({
        authorized: false,
        repository: "getsentry/sentry-javascript",
      });
    }
  );

  test("rejects a malformed title without querying GitHub", async () => {
    const getPermission = vi.fn();

    await expect(
      authorizeApproval({
        actor: "contractor",
        issueTitle: "publish: @1.0.0",
        getPermission,
      })
    ).resolves.toEqual({ authorized: false, repository: null });

    expect(getPermission).not.toHaveBeenCalled();
  });

  test("rejects malformed titles without querying GitHub", async () => {
    const getPermission = vi.fn();

    await expect(
      authorizeApproval({
        actor: "contractor",
        issueTitle: "publish: getsentry/sentry-javascript",
        getPermission,
      })
    ).resolves.toEqual({ authorized: false, repository: null });

    expect(getPermission).not.toHaveBeenCalled();
  });

  test("propagates a GitHub permission lookup failure", async () => {
    const getPermission = vi.fn().mockRejectedValue(new Error("Not Found"));

    await expect(
      authorizeApproval({
        actor: "contractor",
        issueTitle,
        getPermission,
      })
    ).rejects.toThrow("Not Found");
  });
});
