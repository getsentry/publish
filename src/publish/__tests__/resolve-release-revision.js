import { spawnSync } from "child_process";
import { expect, test } from "vitest";

const script = new URL("../resolve-release-revision.js", import.meta.url)
  .pathname;

test("rejects missing workflow input through release revision validation", () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PUBLISH_ARGS: "",
      PUBLISH_ISSUE_BODY: "",
    },
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Publish input must define a repository.");
  expect(result.stderr).not.toContain("Unexpected end of JSON input");
});
