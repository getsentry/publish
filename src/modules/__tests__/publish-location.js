import { expect, test } from "vitest";

const {
  needsWorkspaceDiscovery,
  resolvePublishLocation,
} = require("../publish-location.js");

test.each([
  [{ path: "./cli" }, true],
  [{ path: "./packages/cli" }, false],
  [{ path: "." }, false],
  [{ path: "./cli", workspace: "cli" }, false],
])("workspace discovery is %s for %j", (input, expected) => {
  expect(needsWorkspaceDiscovery(input)).toBe(expected);
});

test("classifies an exact one-segment workspace without normalizing it", () => {
  expect(
    resolvePublishLocation({
      path: "./CLI",
      workspaceNames: ["cli", "CLI"],
    })
  ).toStrictEqual({ path: ".", workspace: "CLI" });
});

test("keeps a non-workspace suffix as a checkout path", () => {
  expect(
    resolvePublishLocation({
      path: "./packages",
      workspaceNames: ["cli"],
    })
  ).toStrictEqual({ path: "./packages" });
});

test("keeps multi-segment paths even when the last segment is a workspace", () => {
  expect(
    resolvePublishLocation({
      path: "./packages/cli",
      workspaceNames: ["cli"],
    })
  ).toStrictEqual({ path: "./packages/cli" });
});

test("keeps root releases at the checkout root", () => {
  expect(
    resolvePublishLocation({
      path: ".",
      workspaceNames: ["cli"],
    })
  ).toStrictEqual({ path: "." });
});

test("preserves the legacy explicit workspace", () => {
  expect(
    resolvePublishLocation({
      path: ".",
      workspace: "cli/v2",
      workspaceNames: [],
    })
  ).toStrictEqual({ path: ".", workspace: "cli/v2" });
});

test("rejects a workspace with a non-root path", () => {
  expect(() =>
    resolvePublishLocation({
      path: "./packages/cli",
      workspace: "cli/v2",
      workspaceNames: [],
    })
  ).toThrow("A publish workspace must use the repository root path.");
});

test("does not validate discovery for a legacy explicit workspace", () => {
  expect(
    resolvePublishLocation({
      path: ".",
      workspace: "cli/v2",
      workspaceNames: ["invalid/workspace"],
    })
  ).toStrictEqual({ path: ".", workspace: "cli/v2" });
});

test("rejects an invalid workspace returned by discovery", () => {
  expect(() =>
    resolvePublishLocation({
      path: "./cli",
      workspaceNames: ["cli-日本語"],
    })
  ).toThrow("Craft workspace discovery returned an invalid workspace list");
});

test.each([".", ".."])("rejects traversal workspace name %s", (workspace) => {
  expect(() =>
    resolvePublishLocation({
      path: `./${workspace}`,
      workspaceNames: [workspace],
    })
  ).toThrow("Craft workspace discovery returned an invalid workspace list.");
});
