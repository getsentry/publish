const { execFileSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const core = require("@actions/core");

const { resolvePublishLocation } = require("../modules/publish-location");

function getWorkspaceNames({
  repositoryDirectory,
  exists = existsSync,
  execFile = execFileSync,
}) {
  if (!exists(path.join(repositoryDirectory, ".craft.yml"))) {
    return [];
  }

  const output = execFile(
    "docker",
    [
      "run",
      "--rm",
      "--volume",
      `${path.resolve(repositoryDirectory)}:/github/workspace/__repo__`,
      "--workdir",
      "/github/workspace/__repo__",
      "getsentry/craft:latest",
      "workspace",
      "list",
    ],
    { encoding: "utf8" }
  );
  let workspaceNames;
  try {
    workspaceNames = JSON.parse(output);
  } catch {
    throw new Error("Craft workspace discovery returned an invalid workspace list.");
  }
  if (!Array.isArray(workspaceNames)) {
    throw new Error("Craft workspace discovery returned an invalid workspace list.");
  }
  return workspaceNames;
}

function discoverLocation({
  input,
  repositoryDirectory,
  exists,
  execFile,
}) {
  return resolvePublishLocation({
    path: input.path,
    workspaceNames: getWorkspaceNames({ repositoryDirectory, exists, execFile }),
  });
}

function main() {
  const input = JSON.parse(process.env.PUBLISH_ARGS || "{}");
  if (!input.path) {
    throw new Error("Publish input must define a path.");
  }

  core.setOutput(
    "result",
    JSON.stringify(
      discoverLocation({
        input,
        repositoryDirectory: process.env.PUBLISH_REPOSITORY_DIRECTORY || "__repo__",
      })
    )
  );
}

if (require.main === module) {
  main();
}

module.exports = { discoverLocation, getWorkspaceNames };
