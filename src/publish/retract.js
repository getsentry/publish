exports.default = async function success({ context, github }) {
  const repoInfo = context.repo;

  await Promise.all([
    github.rest.issues.createComment({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      body: `Release request retracted by @${context.payload.sender.login}`,
    }),

    github.rest.issues.update({
      ...repoInfo,
      issue_number: context.payload.issue.number,
      state: "closed",
    }),
  ]);
};
