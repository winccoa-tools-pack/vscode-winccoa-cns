# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Standalone CNS HTTP manager** (`managers/cns-server.js`): a WinCC OA `node` manager that
  exposes CNS data over a lightweight HTTP REST + SSE server using the native `winccoa-manager`
  module — no external MCP server extension required.
- `managers/.env.example`: configuration template for the CNS manager (`CNS_SERVER_PORT`,
  `CNS_SERVER_TOKEN`).
- `docs/manager-setup.md`: step-by-step guide for deploying the manager and registering it via
  **vscode-winccoa-project-admin**.
- New VS Code settings: `winccoaCns.serverUrl` and `winccoaCns.token`.
- New command **WinCC OA CNS: Add CNS Manager to WinCC OA Project** (`winccoaCns.addManager`)
  that invokes `vscode-winccoa-project-admin` to register the manager and then guides settings
  configuration.

### Changed

- The extension now connects directly to the standalone CNS manager HTTP server instead of
  the `RichardJanisch.winccoa-mcp-server` extension.
- `cnsMcpClient.ts` replaced by `cnsHttpClient.ts` — plain REST fetch, no JSON-RPC session
  management.
- `cnsEventSubscriber.ts` simplified — connects to `GET /cns/events` without session ID.
- `extension.ts` reads `winccoaCns.serverUrl` / `winccoaCns.token` from VS Code settings
  and reconnects automatically on settings change.

### Removed

- Hard dependency on `RichardJanisch.winccoa-mcp-server` extension.
- `src/extensionApiTypes.ts` (MCP server API type mirrors — no longer needed).

## [0.2.1] - 2026-03-23

### Fixed

- add missing permissions to gitflow.yml and apply-settings callers

### Changed

- deps-dev(deps-dev): bump webpack-cli from 6.0.1 to 7.0.2 (#96)
- deps-dev(deps-dev): bump prettier from 2.8.8 to 3.8.1 (#79)
- deps-dev(deps-dev): bump the dev-tools group with 4 updates (#78)
- deps-dev(deps-dev): bump markdownlint-cli from 0.47.0 to 0.48.0 (#82)
- deps-dev(deps-dev): bump @types/vscode in the typescript group (#85)
- deps-dev(deps-dev): bump @types/node in the testing group (#77)
- deps-dev(deps-dev): bump globals from 17.3.0 to 17.4.0 (#80)

## [0.2.0] - 2026-03-18

### Changed

- Feature/setup repo workflow (#89)

## [0.1.5] - 2026-02-23

### Added

- merge all the changes from child repositories (#73)
- Update extension metadata and add core integration (#57)
- Enhance CI/CD workflows and Git Flow validation
- add workflows for creating release branches and pre-release process

### Fixed

- update workflow references to use the correct path for versioning-tags-changelog-reusable.yml
- update PR body text for organization sync workflow
- correct file path for integration tests in configuration
- increase line length limit for better readability

### Changed

- bump actions/github-script from 7 to 8 (#74)
- deps-dev(deps-dev): bump typescript-eslint from 8.53.1 to 8.54.0 (#60)
- deps-dev(deps-dev): bump the testing group with 2 updates (#58)
- deps-dev(deps-dev): bump typescript-eslint from 8.52.0 to 8.53.0 (#53)
- deps-dev(deps-dev): bump prettier in the dev-tools group (#52)
- deps-dev(deps-dev): bump @types/node from 22.19.5 to 25.0.9 (#54)
- bump actions/github-script from 7 to 8 (#55)
- bump actions/setup-node from 4 to 6 (#56)
- upmerge main to develop (#51)
- Upmerge (#49)
- corrected
- reeomove broken files
- load test
- no promt
- format
- remove unused imports and variables in example unit test
- fix example tests
- Update GitHub workflows for pre-release and release processes
- update CI/CD workflows and improve linting, formatting, and testing steps
- sync gh org files to repository (#43)
- update package.json and remove webpack configuration
- CRLF
- Provide all the pipelines, docs configs which we need in an good temp… (#40)
- npm install
- deps-dev(deps-dev): bump eslint from 8.57.1 to 9.39.2 (#32)
- deps-dev(deps-dev): bump @types/node from 24.10.1 to 25.0.3 (#34)
- deps-dev(deps-dev): bump @typescript-eslint/parser from 6.21.0 to 8.51.0 (#39)
- Add actions to sync org and template files (#37)

## [Unreleased]
