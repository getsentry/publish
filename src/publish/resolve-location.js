const core = require("@actions/core");
const { resolvePublishLocation } = require("../modules/publish-location");

function resolveLocation() {
  const input = JSON.parse(process.env.PUBLISH_ARGS || "{}");
  const workspaceNames = JSON.parse(process.env.CRAFT_WORKSPACE_NAMES || "[]");

  if (!Array.isArray(workspaceNames)) {
    throw new Error(
      "Craft workspace discovery returned an invalid workspace list."
    );
  }

  core.setOutput(
    "result",
    JSON.stringify(
      resolvePublishLocation({
        path: input.path,
        workspaceNames,
      })
    )
  );
}

resolveLocation();
