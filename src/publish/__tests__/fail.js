const fail = require("../fail.js").default;

function deepFreeze(object) {
  // Retrieve the property names defined on object
  const propNames = Object.getOwnPropertyNames(object);

  // Freeze properties before freezing self

  for (const name of propNames) {
    const value = object[name];

    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}

const failArgs = deepFreeze({
  inputs: {repo: "sentry", version: "21.3.1"},
  context: {
    runId: "1234",
    repo: {owner: "getsentry", repo: "publish"},
    payload: {issue: {number: "211"}},
  },
  github: {
    actions: {
      getWorkflowRun: async () => ({
        data: {
          html_url:
            "https://github.com/getsentry/sentry/actions/runs/1234/logs",
        },
      }),
    },
    issues: {
      createComment: jest.fn(),
      removeLabel: jest.fn(),
    },
  },
});

const runOnFail = async () => fail(failArgs);

test("create comment", async () => {
  await runOnFail();

  const createComment = failArgs.github.issues.createComment;
  expect(createComment).toHaveBeenCalledTimes(1);
  expect(createComment).toHaveBeenCalledWith({
    owner: "getsentry",
    repo: "publish",
    issue_number: "211",
    body:
      "Failed to publish: [run#1234](https://github.com/getsentry/sentry/actions/runs/1234/logs)\n\n_Bad branch? You can [delete with ease](https://github.com/getsentry/sentry/branches/all?query=21.3.1) and start over._",
  });
});

test("remove label", async () => {
  await runOnFail();

  const removeLabel = failArgs.github.issues.removeLabel;
  expect(removeLabel).toHaveBeenCalledTimes(1);
  expect(removeLabel).toHaveBeenCalledWith({
    owner: "getsentry",
    repo: "publish",
    issue_number: "211",
    name: "accepted",
  });
});
