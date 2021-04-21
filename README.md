# Sentry Publish 🏠

This is a meta/control repository that implements the [Central Publish Repository](docs/rfc.md) RFC

## Goals

 1. We do not want employees to publish through their own accounts
 1. We do not want employees to have access to the global credentials
 1. We do not want employees to build and publish releases from their machines
 1. We want releases to require formal approvals from a limited set of release managers
 1. We want all the above to not discourage from any engineer initiating a release

## Setup

1. Set up [Craft](https://github.com/getsentry/craft/) for your repo and add `0.21.0` as `minVersion`:
    ```yaml
    minVersion: '0.21.0'
    ```
1. Add [action-prepare-release](https://github.com/getsentry/action-prepare-release/) to your project in a release workflow under `.github/workflows/release.yml`:
    ```yaml
    name: Release

    on:
      workflow_dispatch:
        inputs:
          version:
            description: Version to release
            required: true
          force:
            description: Force a release even when there are release-blockers (optional)
            required: false

    jobs:
      release:
        runs-on: ubuntu-latest
        name: 'Release a new version'
        steps:
          - uses: actions/checkout@v2
            with:
              token: ${{ secrets.GH_RELEASE_PAT }}
              fetch-depth: 0

          - name: Prepare release
            uses: getsentry/action-prepare-release@v1
            env:
              GITHUB_TOKEN: ${{ secrets.GH_RELEASE_PAT }}
            with:
              version: ${{ github.event.inputs.version }}
              force: ${{ github.event.inputs.force }}
    ```
1. Make sure you don't have branch protections enabled on your repository or the [release-bot team](https://github.com/orgs/getsentry/teams/release-bot) is added to your repository as an admin with the "Include administrators" option disabled. This is to ensure we can automatically merge or push to master during the release flows with our bot.
Also make sure the [engineering team](https://github.com/orgs/getsentry/teams/engineering) has write access to the repo. This is to ensure access of [getsentry-release](https://github.com/getsentry-release) bot.

## Usage

1. Go to your repo and trigger the workflow (example: https://github.com/getsentry/sentry/actions/manual?workflow=.github%2Fworkflows%2Frelease.yml)
1. Once the workflow finishes, see the publishing request in this repo (example: #40)
1. Add the [**`accepted`**](https://github.com/getsentry/publish/labels/accepted) label to initiate publishing. Since this action requires elevated permissions, you may need to ask your team lead or manager
1. Observe the issue for information about the triggered run
1. The issue will automatically be closed when publishing succeeds

## CalVer

1. You need to add `calver: true` under the `with` block of the `Prepare release` step to enable automatic version determination
1. You also need to add your repository to the list in the [`calver workflow`](https://github.com/getsentry/publish/blob/main/.github/workflows/calver.yml#L9-L13)

## Under the hood

The system uses [Craft](https://github.com/getsentry/craft) under the hood to prepare and publish releases. It uses `GH_SENTRY_BOT_PAT` personal access token, tied to the [getsentry-bot](https://github.com/getsentry-bot) account to perform repository actions automatically. This account is a member of the [release-bot team](https://github.com/orgs/getsentry/teams/release-bot). The reason for using a team is to ease role-based ACLs and making the rotation of the bot account itself if/when needed.

This repo is read-only for everyone except for release managers. This is because all sensitive secrets such as admin-level GitHub access tokens or package repository publishing tokens (npm, PyPI, cargo, etc.) are defined in this repository as secrets and anyone with write access can create or trigger an arbitrary GitHub action workflow, exposing these secrets without any indication. See getsentry/sentry#21930 for an example.

Due to the same reason above, [action-prepare-release](https://github.com/getsentry/action-prepare-release/) needs yet another bot account, [getsentry-release](https://github.com/getsentry-release) that is defined as a regular member of the [engineering team](https://github.com/orgs/getsentry/teams/engineering) to have read access to this private repo. This is to automatically create publish request issues from the action. We cannot use `GITHUB_TOKEN` for these actions as [GitHub prevents triggering more workflows via this token](https://docs.github.com/en/actions/reference/events-that-trigger-workflows). The access token for this account is called `GH_RELEASE_PAT` and it is defined at the organization level.
