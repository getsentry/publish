const fs = require("fs");

const { authorizeApproval } = require("../modules/approval-authorizer");
const { isPublishRepository } = require("../modules/publish-issue-validation");

async function getGitHubJson(url, token, description) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not ${description}: GitHub returned ${response.status}`
    );
  }

  return response.json();
}

async function getPermission({ owner, repository, username }) {
  if (!process.env.TARGET_REPOSITORY_TOKEN) {
    throw new Error('No "TARGET_REPOSITORY_TOKEN" environment variable found');
  }

  return getGitHubJson(
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(repository)}/collaborators/${encodeURIComponent(
      username
    )}/permission`,
    process.env.TARGET_REPOSITORY_TOKEN,
    "verify approval permission"
  );
}

async function getAllIssueEvents({ repository, issueNumber, token, page = 1 }) {
  const [owner, name, extra] = repository.split("/");
  if (
    owner !== "getsentry" ||
    !isPublishRepository(name) ||
    extra ||
    !/^[1-9][0-9]*$/.test(issueNumber)
  ) {
    throw new Error("Invalid approval issue input");
  }

  const events = await getGitHubJson(
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      name
    )}/issues/${issueNumber}/events?per_page=100&page=${page}`,
    token,
    "retrieve approval events"
  );
  if (!Array.isArray(events)) {
    throw new Error("Invalid approval events response");
  }
  if (events.length < 100) {
    return events;
  }

  return events.concat(
    await getAllIssueEvents({ repository, issueNumber, token, page: page + 1 })
  );
}

function currentAcceptedActor(events) {
  return events.reduce((actor, event) => {
    if (event?.label?.name !== "accepted") {
      return actor;
    }
    if (event.event === "unlabeled") {
      return null;
    }
    if (event.event === "labeled") {
      return event.actor?.login || null;
    }
    return actor;
  }, null);
}

async function getCurrentAcceptedActor() {
  if (!process.env.APPROVAL_TOKEN) {
    throw new Error('No "APPROVAL_TOKEN" environment variable found');
  }

  const events = await getAllIssueEvents({
    repository: process.env.APPROVAL_ISSUE_REPOSITORY || "",
    issueNumber: process.env.APPROVAL_ISSUE_NUMBER || "",
    token: process.env.APPROVAL_TOKEN,
  });
  return currentAcceptedActor(events);
}

async function main() {
  const requireAuthorized = process.env.REQUIRE_AUTHORIZED === "true";
  if (!process.env.GITHUB_OUTPUT && !requireAuthorized) {
    throw new Error('No "GITHUB_OUTPUT" environment variable found');
  }

  const actor = process.env.APPROVAL_ACTOR || (await getCurrentAcceptedActor());
  const publishPath = process.env.TARGET_REPOSITORY_PATH || "";
  if (!publishPath) {
    throw new Error("Invalid approval authorization input");
  }
  const { authorized } = await authorizeApproval({
    actor,
    publishPath,
    repository: process.env.TARGET_REPOSITORY,
    getPermission,
  });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `authorized=${authorized ? "true" : "false"}\n`
    );
  }
  if (requireAuthorized && !authorized) {
    throw new Error("Approval is not authorized for the target repository");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  currentAcceptedActor,
  getAllIssueEvents,
  getCurrentAcceptedActor,
  getPermission,
  main,
};
