function needsWorkspaceDiscovery({ path, workspace }) {
  return !workspace && /^\.\/[A-Za-z0-9_.-]+$/.test(path);
}

function resolvePublishLocation({ path, workspace, workspaceNames }) {
  if (workspace) {
    if (path !== ".") {
      throw new Error("A publish workspace must use the repository root path.");
    }
    return { path, workspace };
  }

  if (!needsWorkspaceDiscovery({ path, workspace })) {
    return { path };
  }

  if (!workspaceNames.every(isWorkspaceName)) {
    throw new Error(
      "Craft workspace discovery returned an invalid workspace list."
    );
  }

  const segments = path.slice(2).split("/");
  if (
    path.startsWith("./") &&
    segments.length === 1 &&
    workspaceNames.includes(segments[0])
  ) {
    return { path: ".", workspace: segments[0] };
  }

  return { path };
}

function isWorkspaceName(name) {
  return (
    typeof name === "string" &&
    name !== "__proto__" &&
    name !== "." &&
    name !== ".." &&
    /^[A-Za-z0-9_.-]+$/.test(name)
  );
}

module.exports = { needsWorkspaceDiscovery, resolvePublishLocation };
