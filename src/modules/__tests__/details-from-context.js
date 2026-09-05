import { test, expect } from "vitest";

const { detailsFromContext } = require("../details-from-context.js");

const inputsArgs = {
  context: {
    repo: { owner: "getsentry", repo: "publish" },
    payload: {
      issue: {
        number: "223",
        title: "publish: getsentry/sentry@21.3.1",
        body: `
Requested by: @BYK

Merge target: custom-branch

Quick links:
- [View changes](https://github.com/getsentry/sentry/compare/21.3.0...refs/heads/releases/21.3.1)
- [View check runs](https://github.com/getsentry/sentry/commit/7e5ca7ed5581552de066e2a8bc295b8306be38ac/checks/)

Assign the **accepted** label to this issue to approve the release.

### Targets\r
 - [x] github\r
 - [ ] pypi\r
 - [ ] docker[release]
 - [ ] npm[@sentry/opentelemetry]
 - [x] npm[@sentry/node]
 - [x] docker[latest]\r
`,
        labels: ["accepted"],
      },
    },
  },
};

test("parse inputs", async () => {
  const result = await detailsFromContext(inputsArgs);
  expect(result).toStrictEqual({
    dry_run: "",
    merge_target: "custom-branch",
    path: ".",
    repo: "sentry",
    targets: ["github", "npm[@sentry/node]", "docker[latest]"],
    version: "21.3.1",
  });
});

test("can parse version containing +", async () => {
  const result = await detailsFromContext({
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "123",
          title: "publish: getsentry/sentry-forked-django-stubs@4.2.6+sentry1",
          body: "Requested by: @example",
          labels: [],
        },
      },
    },
  });
  expect(result.version).toEqual("4.2.6+sentry1");
});

const defaultTargetInputsArgs = {
  context: {
    repo: { owner: "getsentry", repo: "publish" },
    payload: {
      issue: {
        number: "223",
        title: "publish: getsentry/sentry@21.3.1",
        body: `
Requested by: @BYK
Merge target: (default)
Quick links:
- [View changes](https://github.com/getsentry/sentry/compare/21.3.0...refs/heads/releases/21.3.1)
- [View check runs](https://github.com/getsentry/sentry/commit/7e5ca7ed5581552de066e2a8bc295b8306be38ac/checks/)
Assign the **accepted** label to this issue to approve the release.
### Targets\r
 - [x] github\r
 - [ ] pypi\r
 - [ ] docker[release]
 - [x] docker[latest]\r
`,
        labels: ["accepted"],
      },
    },
  },
};

test("Do not extract merge_target value if its a default value", async () => {
  const result = await detailsFromContext(defaultTargetInputsArgs);
  expect(result).toStrictEqual({
    dry_run: "",
    merge_target: "",
    path: ".",
    repo: "sentry",
    targets: ["github", "docker[latest]"],
    version: "21.3.1",
  });
});

test("keeps a concrete workspace path in the title suffix", async () => {
  const result = await detailsFromContext({
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "123",
          title: "publish: getsentry/toolkit/packages/cli@1.2.3",
          body: "Requested by: @example",
          labels: [],
        },
      },
    },
  });

  expect(result).toMatchObject({
    repo: "toolkit",
    version: "1.2.3",
    path: "./packages/cli",
  });
});

test("rejects a title with an unexpected space before its version", async () => {
  const fn = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title: "publish: getsentry/toolkit @1.2.3",
            body: "",
            labels: [],
          },
        },
      },
    });

  await expect(fn).rejects.toThrow("Invalid publish issue title");
});

test("rejects a path that escapes the target checkout", async () => {
  const fn = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title: "publish: getsentry/toolkit/../other@1.2.3",
            body: "",
            labels: [],
          },
        },
      },
    });

  await expect(fn).rejects.toThrow("Invalid publish issue path");
});

test("rejects a title path with a current-directory segment before checkout", async () => {
  const fn = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title: "publish: getsentry/toolkit/./other@1.2.3",
            body: "",
            labels: [],
          },
        },
      },
    });

  await expect(fn).rejects.toThrow("Invalid publish issue path");
});

test.each(["-toolkit", ".", "..", "__proto__"])(
  "rejects an unsafe checkout repository identity: %s",
  async (repo) => {
    await expect(
      detailsFromContext({
        context: {
          payload: {
            issue: {
              title: `publish: getsentry/${repo}@1.2.3`,
              body: "",
              labels: [],
            },
          },
        },
      })
    ).rejects.toThrow("Invalid publish issue repository");
  }
);

test.each(["--config", "1.2"])(
  "rejects an invalid release version: %s",
  async (version) => {
    await expect(
      detailsFromContext({
        context: {
          payload: {
            issue: {
              title: `publish: getsentry/toolkit@${version}`,
              body: "",
              labels: [],
            },
          },
        },
      })
    ).rejects.toThrow("Invalid publish issue version");
  }
);

test("rejects a version with path syntax", async () => {
  await expect(
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title: "publish: getsentry/toolkit@1.2.3/other",
            body: "",
            labels: [],
          },
        },
      },
    })
  ).rejects.toThrow("Invalid publish issue title");
});

test("throw error when context is missing the issue payload", async () => {
  const fn = () => detailsFromContext({ context: {} });
  await expect(fn).rejects.toThrow("Issue context is not defined");
});
