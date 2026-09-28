const Sentry = require("@sentry/node");

async function processEndState({
  context,
  octokit,
  inputs = {},
  report = reportSession,
  status,
}) {
  const { repo, version } = inputs;
  const { repo: publishRepo, runId: run_id } = context;
  const { number: issue_number } = context.payload.issue;

  // Validate the status before applying any terminal state transition.
  sentryInfoFromDetails({ status, repo });

  if (status === "success") {
    try {
      await octokit.rest.issues.update({
        ...publishRepo,
        issue_number,
        state: "closed",
      });
    } catch (error) {
      console.warn("Could not close the publish issue", error);
    }
  }

  const workflowInfo = await getWorkflowInfo({ octokit, publishRepo, run_id });

  const details = {
    repo,
    version,
    publishRepo,
    run_id,
    issue_number,
    workflowInfo,
    status,
  };

  try {
    await postIssueComment({
      octokit,
      details,
    });
  } catch (error) {
    console.warn("Could not post the publish result comment", error);
  }

  await report({ details, inputs });
}

async function getWorkflowInfo({ octokit, publishRepo, run_id }) {
  try {
    return (
      await octokit.rest.actions.getWorkflowRun({
        ...publishRepo,
        run_id,
      })
    ).data;
  } catch (error) {
    console.warn("Could not retrieve the publish workflow run", error);
    return null;
  }
}

async function postIssueComment({ octokit, details }) {
  const body = githubIssueComment(details);
  await octokit.rest.issues.createComment({
    ...details.publishRepo,
    issue_number: details.issue_number,
    body,
  });
}

function githubIssueComment({ status, workflowInfo, version, repo, run_id }) {
  switch (status) {
    case "failure":
      return `Failed to publish. ([run logs](${
        workflowInfo.html_url
      }?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}) and start over._`;
    case "cancelled":
      return `Publish workflow cancelled. ([run logs](${
        workflowInfo.html_url
      }?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}) and start over._`;
    case "success":
      return `Published successfully: [run#${run_id}](${workflowInfo.html_url})`;
    default:
      throw new Error(`Unknown status: '${status}'`);
  }
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
