# [RFC] Central Publish Repository

This design document is written to address the concerns mentioned in [Key Rotation & Vault Changes](key_rotation_vault_changes.md). Implementation pending feedback from engineering team members, specifically SDK team.

# Problem Statement

1. We need to be able to quickly recycle all publishing tokens (NPM, PyPI, Cargo, Docker, etc.) at will without disrupting our releases or our developer flow
2. We need to limit the publishing tokens to authorized personnel only and not leak them in any way
    1. GitHub secrets is not enough as it lets anyone with write access to the repo to access the secrets and scuttle them out, even in a brand new PR. Example: [https://github.com/getsentry/sentry/pull/21930](https://github.com/getsentry/sentry/pull/21930)
3. We need SDK releases to be approved by a manager or senior engineer per our SOC/ISO compliance policy
4. We have per-project release/publish configurations that repeat almost the same pattern, causing divergence of code

# Solution Proposal

1. Create a central release/publish repository to store release workflow and publishing tokens
2. Only add the authorized personnel to this repo with write/admin/triage access
3. Add all other engineers with read access to the repo
4. Create a structured issue template to request releases
5. Have a "release" action on each repo, that runs `craft prepare` to get the release branch ready and opens an issue on the release repo for publishing with the following information:
    1. repository name
    2. version to release

6. The owners of the release repo adds an "accepted" tag to trigger the actual release
7. The release then closes the issue with a success message
8. Special case: OSS CalVer releases are done automatically and get automatically approved unless there is a release blocker.

# Questions

1. Should release repo owners be able to publish releases on their own by directly running the workflow or not?
2. Should release repo owners still need to create an issue to trigger a release, even if they mark it as approved themselves? (or should we always require a second person to approve, like a code review)
3. How much friction will this cause?
4. Should we restrict who can approve what release? How?
5. Is exposing all the tokens to all authorized personnel acceptable?

# Notes

We can directly link to manual workflow triggers in the repos but GitHub does not allow pre-filling input values via the URL: [https://github.com/getsentry/sentry/actions/manual?workflow=.github%2Fworkflows%2Frelease.yml](https://github.com/getsentry/sentry/actions/manual?workflow=.github%2Fworkflows%2Frelease.yml) so we need to use the issue system to store this information and reduce friction. Issues also create a paper trail for future auditing.