import { expect, test } from "vitest";

const { resolvePublishLocation } = require("../publish-location.js");

test("classifies an exact full workspace path without normalizing it", () => {
  expect(
    resolvePublishLocation({
      path: "./packages/CLI",
      workspaceNames: ["packages/cli", "packages/CLI"],
    })
  ).toStrictEqual({ path: ".", workspace: "packages/CLI" });
});

test("keeps a non-workspace suffix as a checkout path", () => {
  expect(
    resolvePublishLocation({
      path: "./packages",
      workspaceNames: ["cli"],
    })
  ).toStrictEqual({ path: "./packages" });
});

test("keeps a multi-segment suffix that is not an exact workspace path", () => {
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

test("rejects invalid discovery output for a root release", () => {
  expect(() =>
    resolvePublishLocation({
      path: ".",
      workspaceNames: ["packages/../cli"],
    })
  ).toThrow("Craft workspace discovery returned an invalid workspace list.");
});

test.each(["./.", "./..", "./packages/../other"])(
  "rejects an unsafe publish path %s",
  (path) => {
    expect(() =>
      resolvePublishLocation({
        path,
        workspaceNames: [],
      })
    ).toThrow("Invalid publish path.");
  }
);

test("rejects an invalid workspace returned by discovery", () => {
  expect(() =>
    resolvePublishLocation({
      path: "./packages/cli",
      workspaceNames: ["cli-日本語"],
    })
  ).toThrow("Craft workspace discovery returned an invalid workspace list");
});

test.each([
  ".",
  "..",
  "packages/./cli",
  "packages/../cli",
  "packages/__proto__/cli",
  "packages/-cli",
  "packages/foo]",
  "packages/foo!",
  "packages/foo^",
])(
  "rejects unsafe workspace name %s",
  (workspace) => {
    expect(() =>
      resolvePublishLocation({
        path: "./packages/cli",
        workspaceNames: [workspace],
      })
    ).toThrow("Craft workspace discovery returned an invalid workspace list.");
  }
);
