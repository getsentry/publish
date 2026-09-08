import { afterEach, expect, test, vi } from "vitest";

const { discoverLocation, getWorkspaceNames } = require("../discover-location.js");

afterEach(() => {
  vi.restoreAllMocks();
});

test("retains checkout-path behavior when the root config is absent", () => {
  expect(
    discoverLocation({
      input: { path: "./packages/cli" },
      repositoryDirectory: "__repo__",
      exists: () => false,
    })
  ).toEqual({ path: "./packages/cli" });
});

test("discovers exact workspace paths using the released Craft image", () => {
  const execFile = vi.fn(() => '["packages/CLI"]');

  expect(
    discoverLocation({
      input: { path: "./packages/CLI" },
      repositoryDirectory: "__repo__",
      exists: () => true,
      execFile,
    })
  ).toEqual({ path: ".", workspace: "packages/CLI" });
  expect(execFile).toHaveBeenCalledWith(
    "docker",
    expect.arrayContaining(["getsentry/craft:latest", "workspace", "list"]),
    { encoding: "utf8" }
  );
});

test("fails closed when Craft returns an invalid workspace list", () => {
  const execFile = vi.fn(() => "{}");

  expect(() =>
    getWorkspaceNames({
      repositoryDirectory: "__repo__",
      exists: () => true,
      execFile,
    })
  ).toThrow("Craft workspace discovery returned an invalid workspace list.");
});

test("fails closed when Craft returns no workspace output", () => {
  const execFile = vi.fn(() => "\n");

  expect(() =>
    getWorkspaceNames({
      repositoryDirectory: "__repo__",
      exists: () => true,
      execFile,
    })
  ).toThrow("Craft workspace discovery returned an invalid workspace list.");
});
