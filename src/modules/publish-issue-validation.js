function isPublishRepository(name) {
  return (
    /^[A-Za-z0-9_.-]+$/.test(name) &&
    name !== "." &&
    name !== ".." &&
    name !== "__proto__" &&
    !name.startsWith("-")
  );
}

function isReleaseVersion(version) {
  return /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-?([0-9a-z-]+(?:\.[0-9a-z-]+)*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i.test(
    version
  );
}

module.exports = { isPublishRepository, isReleaseVersion };
