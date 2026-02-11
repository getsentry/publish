# Sentry Publish 🏠

This is a meta/control repository that implements the [Central Publish Repository](docs/rfc.md) RFC

## Quick Start

[craft quick start](https://craft.sentry.dev/github-actions/)

## Release Flow

```mermaid
flowchart TD
    A[Developer triggers release workflow] --> B["SDK Repo: craft prepare"]
    B --> C[Build artifacts & create release branch]
    C --> D[Upload artifacts to GitHub]
    D --> E["Create issue in getsentry/publish"]
    E --> F{Release Manager Review}
    F -->|"Add 'accepted' label"| G[Publish workflow triggers]
    G --> I[Download artifacts from GitHub]
    I --> J["craft publish to registries"]
    J --> K{Publish successful?}
    K -->|Yes| L[Issue closed - success]
    K -->|No| M[Issue updated with failure]
```

## Goals

1.  We do not want employees to publish through their own accounts
1.  We do not want employees to have access to the global credentials
1.  We do not want employees to build and publish releases from their machines
1.  We want releases to require formal approvals from a limited set of release managers
1.  We want all the above to not discourage from any engineer initiating a release

## Usage

1. Go to your repo and trigger the workflow (example: https://github.com/getsentry/sentry/actions/manual?workflow=.github%2Fworkflows%2Frelease.yml)
1. Once the workflow finishes, see the publishing request in this repo (example: #40)
1. Add the [**`accepted`**](https://github.com/getsentry/publish/labels/accepted) label to initiate publishing. Since this action requires elevated permissions, you may need to ask your team lead or manager
1. Observe the issue for information about the triggered run
1. The issue will automatically be closed when publishing succeeds

## CalVer

To enable calendar versioning, add the following to your `.craft.yml`:

```yaml
versioning:
  policy: calver
  calver:
    format: "%y.%-m" # e.g., 24.12 for December 2024
    offset: 14 # Days to look back for date calculation (optional)
```

See the [Craft CalVer documentation](https://craft.sentry.dev/configuration/#calendar-versioning-calver) for more details.

## Merge Target

By default, all releases will be merged to the default branch of your repository (usually `master` or `main`). If you want to override this, pass the `merge_target` input in your release workflow. For example, using [Craft's reusable workflow](https://craft.sentry.dev/github-actions/#option-1-reusable-workflow-recommended):

```yaml
name: Release
on:
  workflow_dispatch:
    inputs:
      version:
        description: Version to release
        required: false
      merge_target:
        description: Target branch to merge into (optional)
        required: false

jobs:
  release:
    uses: getsentry/craft/.github/workflows/release.yml@v2
    with:
      version: ${{ inputs.version }}
      merge_target: ${{ inputs.merge_target }}
    secrets: inherit
```

The same `merge_target` input is also available when using the [Craft composite action](https://craft.sentry.dev/github-actions/#option-2-composite-action) directly.

## Approvals

Packages we release into the wider world that our customers install, require an explicit approval. This for instance applies to
`sentry-cli`, our SDKs or the `symbolicator` distributed utilities. Internal dependencies such as `arroyo` can be published
with an auto approval. The reasoning here is that the bump of the dependency requires an explicit approval again in Sentry
proper. In theory if an independent package gets sufficient independent use of Sentry we might want to reconsider an auto
approval process for such package as it might become an interesting target for an attacker.

Automatic approvals are managed in the [`auto-approve.yml`](https://github.com/getsentry/publish/blob/main/.github/workflows/auto-approve.yml) workflow.

## Under the hood

The system uses [Craft](https://github.com/getsentry/craft) under the hood to prepare and publish releases. It uses tokens from [Sentry Release Bot](https://github.com/apps/sentry-release-bot) is a GitHub App that is installed on all repos in `getsentry` with read and write access to code, PRs, and actions. We utilize the [create-github-app-token](https://github.com/actions/create-github-app-token) to generate a short live token in every action run, with `SENTRY_RELEASE_BOT_CLIENT_ID` and `SENTRY_RELEASE_BOT_PRIVATE_KEY` defined at the organization level.

This repo is read-only for everyone except for release managers. This is because all sensitive secrets such as admin-level GitHub access tokens or package repository publishing tokens (npm, PyPI, cargo, etc.) are defined in this repository as secrets and anyone with write access can create or trigger an arbitrary GitHub action workflow, exposing these secrets without any indication. See getsentry/sentry#21930 for an example.

Due to the same reason above, [Craft's GitHub Actions](https://craft.sentry.dev/github-actions/) (which replace the now-deprecated `action-prepare-release`) also utilize tokens from Sentry Release Bot. This is to automatically create publish request issues from the action. We cannot use `GITHUB_TOKEN` for these actions as [GitHub prevents triggering more workflows via this token](https://docs.github.com/en/actions/reference/events-that-trigger-workflows).
