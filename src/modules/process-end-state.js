const fs = require("fs");
const core = require("@actions/core");
const Sentry = require("@sentry/node");
const { loadGitHubIncidents } = require("../libs/github-status");

async function processEndState({
  context,
  octokit,
  inputs,
  status,
  publishedTargets = [],
}) {
  const { repo, version } = inputs;
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;
  const workflowInfo = (
    await octokit.rest.actions.getWorkflowRun({
      ...publishRepo,
      run_id,
    })
  ).data;

  const details = {
    repo,
    version,
    publishRepo,
    run_id,
    issue_number,
    workflowInfo,
    status,
    publishedTargets,
  };

  await postIssueComment({
    octokit,
    details,
  });

  if (status === "success") {
    await octokit.rest.issues.update({
      ...publishRepo,
      issue_number,
      state: "closed",
    });
  }

  await reportSession({ details, inputs });
}

async function postIssueComment({ octokit, details }) {
  let body = githubIssueComment(details);
  // Failed and cancelled runs are often caused by a GitHub outage (stuck
  // runners, API or git errors). List the incidents that overlap the run so
  // readers can tell a GitHub problem from a release problem.
  if (details.status === "failure" || details.status === "cancelled") {
    const incidents = await loadGitHubIncidents(
      new Date(details.workflowInfo.run_started_at)
    );
    body += githubIncidentsSection(incidents);
  }
  await octokit.rest.issues.createComment({
    ...details.publishRepo,
    issue_number: details.issue_number,
    body,
  });
}

function githubIssueComment({
  status,
  workflowInfo,
  version,
  repo,
  run_id,
  publishedTargets,
}) {
  const runLogs = `([run logs](${workflowInfo.html_url}?check_suite_focus=true#step:8))`;
  switch (status) {
    case "failure":
      return `Failed to publish. ${runLogs}\n\n${retryAdvice({
        repo,
        version,
        publishedTargets,
      })}`;
    case "cancelled":
      return `Publish workflow cancelled. ${runLogs}\n\n${retryAdvice({
        repo,
        version,
        publishedTargets,
      })}`;
    case "success":
      return `Published successfully: [run#${run_id}](${workflowInfo.html_url})`;
    default:
      throw new Error(`Unknown status: '${status}'`);
  }
}

/**
 * Once a target is done, starting over would publish the same version again,
 * so the advice is to retry: the retry skips the done targets.
 */
function retryAdvice({ repo, version, publishedTargets }) {
  if (publishedTargets.length > 0) {
    const targets = publishedTargets
      .map((target) => `\`${target}\``)
      .join(", ");
    return `_Already done: ${targets}. Don't delete the release branch and start over. Fix the cause in the run logs, then add the \`accepted\` label again: the retry skips the done targets._`;
  }
  return `_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
    version
  )}) and start over._`;
}

/**
 * Reads the targets that the Craft publish state file marks as published.
 * Returns an empty list when there is no state file.
 */
function readPublishedTargets(stateFilePath) {
  if (!stateFilePath || !fs.existsSync(stateFilePath)) {
    return [];
  }
  try {
    const { published = {} } = JSON.parse(
      fs.readFileSync(stateFilePath, { encoding: "utf-8" })
    );
    return Object.keys(published).filter((target) => published[target]);
  } catch (error) {
    // Still post the comment, with the default advice.
    core.warning(`Could not read the Craft publish state: ${error.message}`);
    return [];
  }
}

function githubIncidentsSection(incidents) {
  if (incidents.length === 0) {
    return "";
  }
  const lines = incidents.map((incident) => {
    const components = incident.components.join(", ") || "no components";
    const resolved = incident.resolvedAt
      ? `, resolved ${incident.resolvedAt}`
      : "";
    return `- [${incident.name}](${incident.url}) (${incident.status}; ${components}; started ${incident.startedAt}${resolved})`;
  });
  return `\n\n**GitHub incidents during this run** ([githubstatus.com](https://www.githubstatus.com)):\n${lines.join(
    "\n"
  )}`;
}

async function reportSession({ details, inputs }) {
  const release = `${details.repo}@${details.version}`;
  const sentryInfo = sentryInfoFromDetails(details);

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release,
  });

  Sentry.withScope((scope) => {
    scope.setTag("repository", details.repo);
    scope.setContext("release", {
      issue_number: details.issue_number,
      inputs,
    });

    Sentry.captureMessage(sentryInfo.message, sentryInfo.severity);

    Sentry.startSession({ status: sentryInfo.status });
    Sentry.endSession();
  });
  await Sentry.close();
}

function sentryInfoFromDetails({ status, repo }) {
  switch (status) {
    case "failure":
      return {
        message: `Release failed: ${repo}`,
        severity: "error",
        status: "crashed",
      };
    case "cancelled":
      return {
        message: `Release cancelled: ${repo}`,
        severity: "warn",
        status: "crashed",
      };
    case "success":
      return {
        message: `Release succeeded: ${repo}`,
        severity: "info",
        status: "ok",
      };
    default:
      throw new Error(`Unknown status: '${status}'`);
  }
}

module.exports = processEndState;
module.exports.readPublishedTargets = readPublishedTargets;
