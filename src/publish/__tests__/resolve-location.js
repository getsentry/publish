import { spawnSync } from "child_process";
import { expect, test } from "vitest";

const script = new URL("../resolve-location.js", import.meta.url).pathname;

test("rejects missing workflow input through location validation", () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PUBLISH_ARGS: "",
      CRAFT_WORKSPACE_NAMES: "[]",
    },
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Invalid publish path.");
  expect(result.stderr).not.toContain("Unexpected end of JSON input");
});
