# Key Rotation & Vault Changes

Currently there are three vaults that contain secrets:

- SDKs/OSS: both available to a range of employees, some of which departed
- Shared: available to all engineers, some of which departed
- Ops: available to operations, none of which departed

## Goal

We do not want employees to publish through their own accounts, but we also do not want them to have access to the global credentials. We have enabled the first part of this process as the preparation of releases no longer requires credentials when [Craft](https://github.com/getsentry/craft) is used.

The actual publish via Craft however still requires access to the credentials. For that process we need to ensure that craft doesn't have to run on employee's machines but somewhere, where access tokens cannot be accessed but approved engineers can click publish. Who is approved will depend on the project. For instance SDKs must not be published without a manager, other code bases might even want to perform automatic publishing (eg: [sentry](https://github.com/getsentry/sentry) itself).

## Proposed Setup

Ways to improve credential management for releases:

### Dedicated Service

- There is a configured machine that is informed by a GitHub action that a new release was prepared for a specific project and version
- That machine holds the credentials for all the services where releases are published to
- An authorized individual triggers the publish on press of a button / publish happens automatically if permitted

### GitHub Actions in Separate Repo

1. Centralize all release actions in a single, restricted-acces repo
2. Only add the bare-minimum personnel to this repo as admins (or with write access)
3. Only expose the credentials/tokens to this repo
4. At this stage, all releases access tokens are restricted to a few people
5. For others to be able to release with approval by repo admins: leverage structured issues and issue base workflow triggers. This means we can safely give read access to everyone so they can create issues.
6. Bonus: automatically create issues on the release repo with release requests when someone pushes a `release/*` branch to a repo.

## Access Credential Management

Already existing credentials need to be re-organized to reduce the total amount of people that have access to it. Ideally basically nobody has access as these need to be rotated when employees depart. Proposed setup:

- OSS
    - Users
        - *redacted*
    - Keys *(after the dash where the key is currently)*
        - PyPI Bot — OSS
        - [Crates.io](http://crates.io) — OSS
        - DockerHub — OSS
        - Github (getsentry-bot) — OSS
        - NPM Bot — SDKs
        - Cocoapods — SDKs
        - Nexus — SDKs
        - Packagist — SDKs
        - RubyGems — SDKs + Ops
        - Code Signing Certificate — SDKs
        - Bintray — SDKs
        - Bot Apple ITC — Shared
        - [clojars.org](http://clojars.org) → SDKs
- SDK Low Security
    - Users
        - SDK Team
    - Keys
        - Remaining items in SDKs vault
