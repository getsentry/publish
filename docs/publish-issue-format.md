# Publish Issue Format

The Publish workflow treats a publish issue as a release request. The title identifies
the release; the body supplies the merge target and selected targets. Do not edit the
title by hand unless it remains valid under this format.

## Title

Every title starts with `publish: `. This EBNF is canonical:

```text
title             = "publish: ", [ "getsentry/" ], repository, [ path ],
                    [ legacy-workspace ], "@", version ;
repository        = token, { token } ;
path              = "/", path-segment, { "/", path-segment } ;
path-segment      = token, { token } ;
legacy-workspace  = " [workspace: ", json-string, "] " ;
version           = version-character, { version-character } ;
token             = ? ASCII letter, digit, ".", "_", or "-" ? ;
version-character = token | "+" ;
```

New Craft requests always include the checkout repository identity. Root workspace
releases use one trailing path segment for the workspace name:

```text
publish: getsentry/sentry@21.3.1
publish: getsentry/toolkit/cli@1.2.3
```

Craft rejects a workspace with a non-root checkout path. Workspace names in new titles
must match `^[A-Za-z0-9_.-]+$`; Craft preserves their exact spelling.

The controller resolves a one-segment suffix only after it checks out the exact
CI-approved revision from the `View check runs` link. When that checkout has a root
`.craft.yml`, `craft workspace list` supplies the exact workspace keys. A suffix that
exactly matches one of those keys is a workspace; every other suffix remains a checkout
path. The controller never normalizes names. A missing root `.craft.yml` always means
checkout-path behavior. Discovery errors with a root configuration fail the release.

Existing JSON-qualified workspace titles remain supported for compatibility, but Craft
does not create them:

```text
publish: getsentry/toolkit [workspace: "cli/v2"] @1.2.3
publish: getsentry/toolkit [workspace: "cli [preview] \"next\""] @1.2.3
```

Legacy workspace titles must also use the repository root path.

`<json-string>` is one valid JSON string, including its double quotes. It must decode
to a nonempty workspace name and must not contain Unicode control (`Cc`), format
(`Cf`), line-separator (`Zl`), or paragraph-separator (`Zp`) characters. Legacy
workspace titles have one space after `]` before `@`; unqualified titles have no space
before `@`.

`getsentry/` remains optional when parsing existing issues. Paths must not contain a
`..` segment.

## Body

The request must start with these body fields:

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

The requester, approval guidance, and optional changelog section are informational. The
`Quick links` must follow `Requested by` and `Merge target`, and contain exactly one `View
changes` line followed by exactly one `View check runs` line for the checkout repository.
The controller and CI poller use that check-runs revision as the release authority. The
`accepted` label starts publishing;
`dry-run` requests dry-run mode.
