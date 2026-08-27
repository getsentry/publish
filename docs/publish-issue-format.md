# Publish Issue Format

The Publish workflow treats a publish issue as a release request. The title identifies
the release; the body supplies the merge target and selected targets. Do not edit the
title by hand unless it remains valid under this format.

## Title

Every title starts with `publish: `.

Legacy releases without a workspace use this form:

```text
publish: getsentry/<repository><optional-path>@<version>
```

Workspace releases use this form:

```text
publish: getsentry/<repository><optional-path> [workspace: <json-string>] @<version>
```

Examples:

```text
publish: getsentry/sentry@21.3.1
publish: getsentry/toolkit/cli@1.2.3
publish: getsentry/toolkit/cli [workspace: "cli/v2"] @1.2.3
publish: getsentry/toolkit [workspace: "cli [preview] \"next\""] @1.2.3
```

`getsentry/` is optional when parsing existing issues. New requests created by Craft
always include the checkout repository identity.

`<repository>` contains only ASCII letters, digits, `.`, `_`, and `-`. An optional
path starts with `/` and contains letters, digits, `_`, `.`, `/`, and `-`; it must not
include a `..` path segment. `<version>` contains letters, digits, `_`, `.`, `+`, and
`-`.

`<json-string>` is one valid JSON string, including its double quotes. It must decode
to a nonempty workspace name and must not contain Unicode control (`Cc`), format
(`Cf`), line-separator (`Zl`), or paragraph-separator (`Zp`) characters. JSON escaping
makes brackets, quotes, and other printable characters unambiguous.

The legacy and workspace forms intentionally use different separators: legacy titles
have no space before `@`; workspace titles have one space after the closing `]` before
`@`.

## Body

The workflow reads these body fields:

```markdown
Requested by: @<actor>

Merge target: <branch-or-(default)>

Quick links:

- [View changes](compare-url)
- [View check runs](checks-url)

Assign the **accepted** label to this issue to approve the release.

### Targets

- [ ] <target-id>

Checked targets will be skipped (either already published or user-requested skip). Uncheck to retry a target.
```

`Merge target` is optional. `(default)` means the target repository's default branch.
When present, the branch may contain letters, digits, `_`, `.`, `/`, and `-`.

The workflow reads checked entries (`- [x] <target-id>`) in the `### Targets` section.
It preserves checked entries when Craft refreshes an existing request. During a failed
release, the controller updates target checkboxes from the secure Craft publish-state
file; targets marked checked are skipped on retry unless manually unchecked.

The requester, quick links, approval guidance, and optional changelog section are
informational. The `accepted` label starts publishing; `dry-run` requests dry-run mode.
