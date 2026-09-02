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

test("parses a human-readable workspace from the title", async () => {
  const result = await detailsFromContext({
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "123",
          title: 'publish: getsentry/toolkit [workspace: "cli/v2"] @1.2.3',
          body: "Requested by: @example",
          labels: [],
        },
      },
    },
  });

  expect(result).toMatchObject({
    repo: "toolkit",
    version: "1.2.3",
    workspace: "cli/v2",
  });
});

test("rejects a legacy workspace with a non-root path", async () => {
  const fn = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit/packages/cli [workspace: "cli/v2"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });

  await expect(fn).rejects.toThrow(
    "A publish workspace must use the repository root path."
  );
});

test("parses escaped workspace characters from the title", async () => {
  const result = await detailsFromContext({
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "123",
          title:
            'publish: getsentry/toolkit [workspace: "cli [preview] \\"next\\""] @1.2.3',
          body: "Requested by: @example",
          labels: [],
        },
      },
    },
  });

  expect(result.workspace).toBe('cli [preview] "next"');
});

test("parses a safe Unicode workspace from the title", async () => {
  const result = await detailsFromContext({
    context: {
      repo: { owner: "getsentry", repo: "publish" },
      payload: {
        issue: {
          number: "123",
          title:
            'publish: getsentry/toolkit [workspace: "cli-\u65e5\u672c\u8a9e"] @1.2.3',
          body: "Requested by: @example",
          labels: [],
        },
      },
    },
  });

  expect(result.workspace).toBe("cli-\u65e5\u672c\u8a9e");
});

test("rejects a legacy title with an unexpected space before its version", async () => {
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

test("rejects an invalid JSON workspace escape with a clear error", async () => {
  const fn = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit [workspace: "cli\\qnext"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });

  await expect(fn).rejects.toThrow("Invalid publish workspace JSON in title");
});

test("rejects an empty or unsafe Unicode workspace", async () => {
  const emptyWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title: 'publish: getsentry/toolkit [workspace: ""] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });
  const multilineWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit [workspace: "cli\\nnext"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });
  const nulWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title: 'publish: getsentry/toolkit [workspace: "\\u0000"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });
  const tabWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit [workspace: "cli\\tnext"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });
  const bidiWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit [workspace: "cli\\u202enext"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });
  const lineSeparatorWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit [workspace: "cli\\u2028next"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });
  const paragraphSeparatorWorkspace = () =>
    detailsFromContext({
      context: {
        payload: {
          issue: {
            title:
              'publish: getsentry/toolkit [workspace: "cli\\u2029next"] @1.2.3',
            body: "",
            labels: [],
          },
        },
      },
    });

  await expect(emptyWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
  await expect(multilineWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
  await expect(nulWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
  await expect(tabWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
  await expect(bidiWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
  await expect(lineSeparatorWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
  await expect(paragraphSeparatorWorkspace).rejects.toThrow(
    "Workspace names must be nonempty and cannot contain Unicode control, format, or separator characters"
  );
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

test("throw error when context is missing the issue payload", async () => {
  const fn = () => detailsFromContext({ context: {} });
  await expect(fn).rejects.toThrow("Issue context is not defined");
});
