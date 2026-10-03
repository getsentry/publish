import { readFileSync } from "fs";
import { join } from "path";

import { expect, test } from "vitest";

const workflows = join(__dirname, "../../../.github/workflows");
const PINNED_PNPM_ACTION = /uses: pnpm\/action-setup@[0-9a-f]{40}/g;

test("the test workflow installs from the pnpm lockfile on every run", () => {
  const workflow = readFileSync(join(workflows, "test.yml"), "utf8");

  expect(workflow.match(PINNED_PNPM_ACTION)).toHaveLength(1);
  expect(workflow.indexOf("pnpm/action-setup@")).toBeLessThan(
    workflow.indexOf("actions/setup-node@")
  );
  expect(workflow).toContain("cache: pnpm");
  expect(workflow).toContain("pnpm install --frozen-lockfile");
  expect(workflow).toContain("pnpm test");
  expect(workflow).not.toMatch(/cache-hit|path: node_modules|yarn\.lock/);
});

test("both publish jobs install pinned pnpm dependencies before using credentials", () => {
  const workflow = readFileSync(join(workflows, "publish.yml"), "utf8");
  const waiting = workflow.slice(
    workflow.indexOf("  waiting-for-ci:"),
    workflow.indexOf("  publish:")
  );
  const publishing = workflow.slice(workflow.indexOf("  publish:"));

  expect(workflow.match(PINNED_PNPM_ACTION)).toHaveLength(2);
  expect(waiting.indexOf("pnpm/action-setup@")).toBeLessThan(
    waiting.indexOf("actions/setup-node@")
  );
  expect(waiting).toContain("cache: pnpm");
  expect(waiting).toContain("pnpm install --frozen-lockfile");
  expect(waiting.indexOf("pnpm install --frozen-lockfile")).toBeLessThan(
    waiting.indexOf("name: Get target repository token")
  );

  expect(publishing).toContain("package_json_file: .__publish__/package.json");
  expect(publishing.indexOf("pnpm/action-setup@")).toBeLessThan(
    publishing.indexOf("actions/setup-node@")
  );
  expect(publishing).toContain(
    "cache-dependency-path: .__publish__/pnpm-lock.yaml"
  );
  expect(publishing).toContain(
    "pnpm --dir .__publish__ install --frozen-lockfile"
  );
  expect(
    publishing.indexOf("pnpm --dir .__publish__ install --frozen-lockfile")
  ).toBeLessThan(publishing.indexOf("name: Get approval target token"));
});
