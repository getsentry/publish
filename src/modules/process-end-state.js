const Sentry = require('@sentry/node');

async function processEndState({context, octokit, inputs, status}) {
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
  };

  await postIssueComment({
    octokit,
    details,
  });

  if (status === 'success') {
    await octokit.rest.issues.update({
      ...publishRepo,
      issue_number,
      state: "closed",
    });
  }

  await reportSession({details, inputs});
}

async function postIssueComment({octokit, details}) {
  const body = githubIssueComment(details);
  await octokit.rest.issues.createComment({
    ...details.publishRepo,
    issue_number: details.issue_number,
    body,
  });
}

function githubIssueComment({status, workflowInfo, version, repo, run_id}) {
  switch(status) {
    case 'failure':
      return `Failed to publish. ([run logs](${
        workflowInfo.html_url
      }?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}) and start over._`;
    case 'cancelled':
      return `Publish workflow cancelled. ([run logs](${
        workflowInfo.html_url
      }?check_suite_focus=true#step:8))\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}) and start over._`;
    case 'success':
      return `Published successfully: [run#${run_id}](${workflowInfo.html_url})`;
    default:
      throw new Error(`Unknown status: '${status}'`);
  }
}

async function reportSession({details, inputs}) {
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

    const hub = Sentry.getCurrentHub();
    hub.startSession({status: sentryInfo.status});
    hub.endSession();
  });
  await Sentry.close();
}

function sentryInfoFromDetails({status, repo}) {
  switch(status) {
    case 'failure':
      return {
        message: `Release failed: ${repo}`,
        severity: "error",
        status: "crashed",
      };
    case 'cancelled':
      return {
        message: `Release cancelled: ${repo}`,
        severity: "warn",
        status: "crashed",
      };
    case 'success':
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