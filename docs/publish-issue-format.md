# Publish Issue Format

The Publish workflow treats a publish issue as a release request. The title identifies
the release; the body supplies the merge target and selected targets. Do not edit the
title by hand unless it remains valid under this format.

## Title

Every title starts with `publish: `. The following canonical Peggy grammar is
generated from `src/modules/publish-issue-title.peggy`:

<!-- BEGIN GENERATED TITLE GRAMMAR -->
```peggy
// Canonical grammar for publish issue titles. A path suffix is syntactic only:
// the controller resolves the complete suffix as a workspace after checking
// out the CI-approved revision.
PublishIssueTitle
  = "publish: " "getsentry/"? repo:Repository path:Path? "@" version:Version !. {
      return {
        repo,
        path: path || "",
        version,
      };
    }

Repository
  = characters:RepositoryCharacter+ { return join(characters); }

RepositoryCharacter
  = [A-Za-z0-9_.-]

Path
  = segments:("/" segment:PathSegment { return `/${segment}`; })+ { return join(segments); }

PathSegment
  = characters:RepositoryCharacter+ { return join(characters); }

Version
  = characters:[A-Za-z0-9_.+-]+ { return join(characters); }
```
<!-- END GENERATED TITLE GRAMMAR -->

New Craft requests always include the checkout repository identity. A workspace
release uses its full concrete path as the title suffix:

```text
publish: getsentry/sentry@21.3.1
publish: getsentry/toolkit/packages/cli@1.2.3
```

Workspace paths in titles use ASCII path segments matching `[A-Za-z0-9_.-]+`,
except `.`, `..`, `__proto__`, and segments starting with `-`. Craft preserves
their exact spelling.

Repository identities use the same safe token rule and cannot be `.`, `..`,
`__proto__`, or start with `-`. Versions must be valid Craft semantic versions;
build metadata such as `4.2.6+sentry1` is valid.

The controller resolves the complete suffix only after it checks out the exact
CI-approved revision from the `View check runs` link. When that checkout has a root
`.craft.yml`, `craft workspace list` supplies the exact concrete workspace paths. A
suffix that exactly matches one of those paths is a workspace; every other suffix
remains a checkout path. The controller never normalizes names. A missing root
`.craft.yml` always means checkout-path behavior. Discovery errors with a root
configuration fail the release.

`getsentry/` remains optional when parsing existing issues. Paths must use only
safe workspace segments.

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

`Merge target` is required. `(default)` means the target repository's default branch.
The branch may contain letters, digits, `_`, `.`, `/`, and `-`.

The workflow reads checked entries (`- [x] <target-id>`) in the `### Targets` section.
It preserves checked entries when Craft refreshes an existing request. During a failed
release, the controller updates target checkboxes from the secure Craft publish-state
file; targets marked checked are skipped on retry unless manually unchecked.

The requester, approval guidance, and optional changelog section are informational. The
`Quick links` must follow `Requested by` and `Merge target`, and contain exactly one `View
changes` line followed by exactly one `View check runs` line for the checkout repository.
The controller and CI poller use that check-runs revision as the release authority.
The `accepted` label starts CI waiting. Publishing starts only when the CI poller
adds a fresh `ci-ready` label to an open, accepted issue with neither `ci-pending`
nor `ci-failed`. `dry-run` requests dry-run mode.
