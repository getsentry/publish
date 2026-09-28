import { afterEach, describe, expect, test, vi } from "vitest";

const { main } = require("../post-result.js");

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("post-result entry point", () => {
  test.each([undefined, "not-json"])(
    "reports terminal state when publish inputs are %s",
    async (publishArgs) => {
      const report = vi.fn().mockResolvedValue(undefined);
      if (publishArgs === undefined) {
        delete process.env.PUBLISH_ARGS;
      } else {
        process.env.PUBLISH_ARGS = publishArgs;
      }

      await main({
        context: {},
        octokit: {},
        report,
        status: "failure",
      });

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ inputs: {}, status: "failure" })
      );
    }
  );
});
