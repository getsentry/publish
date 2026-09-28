const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { isRevision } = require("../modules/release-revision.js");
const {
  getGitHubResponse,
  validateApprovalAttestation,
} = require("./validate-approval-attestation.js");

async function getGitHubJson(
  apiPath,
  token = process.env.RELEASE_TOKEN || process.env.APPROVAL_TOKEN
) {
  const response = await getGitHubResponse(apiPath, token);

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${apiPath}`);
  }

  return response.json();
}

function encodedBranchPath(branch) {
  return branch.split("/").map(encodeURIComponent).join("/");
}

async function getReleaseBranch({ repository, revision, token }) {
  const result = await getGitHubJson(
    `repos/${repository}/commits/${revision}/check-suites`,
    token
  );
  const branches = [
    ...new Set(
      (result.check_suites || [])
        .filter(
          (suite) =>
            suite.head_sha === revision &&
            typeof suite.head_branch === "string" &&
            suite.head_branch.length > 0
        )
        .map((suite) => suite.head_branch)
    ),
  ];

  if (branches.length === 0) {
    throw new Error(`No release branch found for ${repository}@${revision}`);
  }
  if (branches.length > 1) {
    throw new Error(`Ambiguous release branches for ${repository}@${revision}`);
  }

  return branches[0];
}

async function isReleaseRevisionAtBranchHead({
  branch,
  repository,
  revision,
  token,
}) {
  const result = await getGitHubJson(
    `repos/${repository}/git/ref/heads/${encodedBranchPath(branch)}`,
    token
  );

  return result.object?.sha === revision;
}

async function validateFinalPublication({
  approvalToken = process.env.APPROVAL_TOKEN,
  attestationSecret = process.env.PUBLISH_ATTESTATION_SECRET,
  releaseToken = process.env.RELEASE_TOKEN || approvalToken,
} = {}) {
  const repository = process.env.RELEASE_REPOSITORY;
  const revision = process.env.RELEASE_REVISION;
  const issueNumber = process.env.APPROVAL_ISSUE_NUMBER;
  const issueRepository = process.env.APPROVAL_ISSUE_REPOSITORY;
  const issueTitle = process.env.APPROVAL_ISSUE_TITLE;
  const expectedRequestDigest = process.env.EXPECTED_REQUEST_DIGEST;
  const attestationAuthor = process.env.APPROVAL_ATTESTATION_AUTHOR;

  if (
    !/^getsentry\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !isRevision(revision) ||
    !issueNumber ||
    !issueRepository ||
    !issueTitle ||
    !expectedRequestDigest ||
    !attestationAuthor ||
    !approvalToken ||
    !attestationSecret ||
    !releaseToken
  ) {
    throw new Error("Invalid final publication validation input");
  }

  const branch = await getReleaseBranch({
    repository,
    revision,
    token: releaseToken,
  });

  const validateSnapshot = async () => {
    const [approved, branchMatches] = await Promise.all([
      validateApprovalAttestation({
        attestationAuthor,
        expectedRequestDigest,
        issueNumber,
        issueTitle,
        repository: issueRepository,
        approvalToken,
        attestationSecret,
        requireCiPendingAbsent: true,
        requireCiReadyAttestation: true,
      }),
      isReleaseRevisionAtBranchHead({
        branch,
        repository,
        revision,
        token: releaseToken,
      }),
    ]);

    if (!approved || !branchMatches) {
      throw new Error("The release changed before Craft could publish");
    }
  };

  await validateSnapshot();
  await validateSnapshot();
}

function getPublishDirectory() {
  const workspace = process.env.GITHUB_WORKSPACE || "/github/workspace";
  const repositoryDirectory = path.resolve(workspace, "__repo__");
  const canonicalRepositoryDirectory = fs.realpathSync(repositoryDirectory);
  const requestedDirectory = path.resolve(
    repositoryDirectory,
    process.env.CRAFT_PUBLISH_PATH
  );
  const publishDirectory = fs.realpathSync(requestedDirectory);
  const relativeDirectory = path.relative(
    canonicalRepositoryDirectory,
    publishDirectory
  );

  if (
    canonicalRepositoryDirectory !== repositoryDirectory ||
    relativeDirectory.startsWith("..") ||
    path.isAbsolute(relativeDirectory) ||
    !fs.statSync(publishDirectory).isDirectory()
  ) {
    throw new Error("Publish path must remain inside the target checkout");
  }

  return publishDirectory;
}

function runCraft(publishDirectory, spawnImplementation = spawn) {
  const publishVersion = process.env.CRAFT_PUBLISH_VERSION;
  const releaseRevision = process.env.RELEASE_REVISION;
  const validatorCredentialNames = [
    "APPROVAL_TOKEN",
    "PUBLISH_ATTESTATION_SECRET",
    "RELEASE_TOKEN",
  ];
  const exposedCredential = validatorCredentialNames.find(
    (name) => process.env[name]
  );

  if (exposedCredential) {
    throw new Error(
      `Refusing to start Craft with validator credentials: ${exposedCredential}`
    );
  }

  const craftEnvironment = { ...process.env };
  for (const name of [
    "APPROVAL_ATTESTATION_AUTHOR",
    "APPROVAL_ISSUE_NUMBER",
    "APPROVAL_ISSUE_REPOSITORY",
    "APPROVAL_ISSUE_TITLE",
    "APPROVAL_TOKEN",
    "EXPECTED_REQUEST_DIGEST",
    "PUBLISH_ATTESTATION_SECRET",
    "RELEASE_REPOSITORY",
    "RELEASE_REVISION",
    "RELEASE_TOKEN",
    "APPROVAL_TOKEN_FILE",
    "PUBLISH_ATTESTATION_SECRET_FILE",
    "RELEASE_TOKEN_FILE",
  ]) {
    delete craftEnvironment[name];
  }

  return new Promise((resolve, reject) => {
    const child = spawnImplementation(
      "craft",
      ["publish", publishVersion, "--rev", releaseRevision],
      {
        cwd: publishDirectory,
        env: craftEnvironment,
        stdio: "inherit",
      }
    );

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `Craft exited because of signal ${signal}`
            : `Craft exited with status ${code}`
        )
      );
    });
  });
}

async function main() {
  for (const name of [
    "APPROVAL_ATTESTATION_AUTHOR",
    "APPROVAL_ISSUE_NUMBER",
    "APPROVAL_ISSUE_REPOSITORY",
    "APPROVAL_ISSUE_TITLE",
    "CRAFT_PUBLISH_PATH",
    "CRAFT_PUBLISH_VERSION",
    "EXPECTED_REQUEST_DIGEST",
    "RELEASE_REPOSITORY",
    "RELEASE_REVISION",
    "APPROVAL_TOKEN_FILE",
    "PUBLISH_ATTESTATION_SECRET_FILE",
    "RELEASE_TOKEN_FILE",
  ]) {
    if (!process.env[name]) {
      throw new Error(`No "${name}" environment variable found`);
    }
  }

  const credentialFiles = [
    process.env.APPROVAL_TOKEN_FILE,
    process.env.PUBLISH_ATTESTATION_SECRET_FILE,
    process.env.RELEASE_TOKEN_FILE,
  ];

  try {
    const readCredential = (filePath) => {
      const value = fs.readFileSync(filePath, "utf8");
      if (!value) {
        throw new Error(`Empty final publication credential file: ${filePath}`);
      }
      return value;
    };

    await validateFinalPublication({
      approvalToken: readCredential(process.env.APPROVAL_TOKEN_FILE),
      attestationSecret: readCredential(
        process.env.PUBLISH_ATTESTATION_SECRET_FILE
      ),
      releaseToken: readCredential(process.env.RELEASE_TOKEN_FILE),
    });
    for (const filePath of credentialFiles) {
      fs.rmSync(filePath, { force: true });
    }
    await runCraft(getPublishDirectory());
  } finally {
    for (const filePath of credentialFiles) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  encodedBranchPath,
  getReleaseBranch,
  getPublishDirectory,
  isReleaseRevisionAtBranchHead,
  main,
  runCraft,
  validateFinalPublication,
};
