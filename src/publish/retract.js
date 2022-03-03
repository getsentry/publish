exports.default = async function success({ context, github, inputs }) {
  const repoInfo = context.repo;
  const { repo, version } = inputs;

  await Promise.all([
    github.rest.issues.createComment({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      body: `Release request retracted by @${
        context.payload.sender.login
      }.\nYou may also want to remove your [release branch](https://github.com/getsentry/${repo}/branches/all?query=${encodeURIComponent(
        version
      )}.`,
    }),

    github.rest.issues.update({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      state: "closed",
    }),
  ]);
};
