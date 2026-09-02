const core = require("@actions/core");
const {
  needsWorkspaceDiscovery,
  resolvePublishLocation,
} = require("../modules/publish-location");

function resolveLocation() {
  const input = JSON.parse(process.env.PUBLISH_ARGS || "");
  const workspaceNames = needsWorkspaceDiscovery(input)
    ? JSON.parse(process.env.CRAFT_WORKSPACE_NAMES || "")
    : [];

  if (!Array.isArray(workspaceNames)) {
    throw new Error(
      "Craft workspace discovery returned an invalid workspace list."
    );
  }

  core.setOutput(
    "result",
    resolvePublishLocation({
      path: input.path,
      workspace: input.workspace,
      workspaceNames,
    })
  );
}

resolveLocation();
