async function retract({ context, octokit, inputs }) {
  const { repo, version } = inputs;
  const { repo: publishRepo } = context;
  const { number: issue_number } = context.payload.issue;
  const { login } = context.payload.sender;

  await Promise.all([
    octokit.rest.issues.createComment({
      ...publishRepo,
      issue_number,
      body: `Release request retracted by @${login}.\nYou may also want to remove your [release branch](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}).`,
    }),

    octokit.rest.issues.update({
      ...publishRepo,
      issue_number,
      state: "closed",
    }),
  ]);
};

module.exports = retract;