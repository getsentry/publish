function resolvePublishLocation({ path, workspaceNames }) {
  if (!isPublishPath(path)) {
    throw new Error("Invalid publish path.");
  }

  if (!workspaceNames.every(isWorkspaceName)) {
    throw new Error(
      "Craft workspace discovery returned an invalid workspace list."
    );
  }

  if (path === ".") {
    return { path };
  }

  const workspace = path.slice(2);
  if (workspaceNames.includes(workspace)) {
    return { path: ".", workspace };
  }

  return { path };
}

function isPublishPath(path) {
  return (
    typeof path === "string" &&
    (path === "." ||
      (path.startsWith("./") &&
        path
          .slice(2)
          .split("/")
          .every(isSafeWorkspaceSegment)))
  );
}

function isWorkspaceName(name) {
  return (
    typeof name === "string" &&
    name.split("/").every(isSafeWorkspaceSegment)
  );
}

function isSafeWorkspaceSegment(segment) {
  return (
    /^[A-Za-z0-9_.-]+$/.test(segment) &&
    segment !== "." &&
    segment !== ".." &&
    segment !== "__proto__" &&
    !segment.startsWith("-")
  );
}

module.exports = { resolvePublishLocation, isPublishPath };
