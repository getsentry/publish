# AGENTS.md - Coding Agent Guidelines

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

This is the **Sentry Publish Repository** - a GitHub Actions-based approval system for publishing releases across multiple Sentry projects using [Craft](https://github.com/getsentry/craft). It's a pure JavaScript (Node.js 24.0.0) project using CommonJS modules.

## Build/Lint/Test Commands

### Package Manager

- **Yarn 1.22.22** (classic) - Do NOT use npm
- Version management via Volta (pinned in package.json)

### Commands

```bash
# Install dependencies
yarn install

# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run a single test file
yarn test src/modules/__tests__/update-issue.js

# Run tests matching a pattern
yarn test -t "pattern"

# Lint code
yarn lint

# Format code with Prettier
yarn prettier
```

### Running Single Tests

```bash
# By file path
yarn test src/modules/__tests__/update-issue.js

# By test name pattern (matches describe/test names)
yarn test -t "transformIssueBody"

# Combine file and pattern
yarn test src/modules/__tests__/update-issue.js -t "specific test name"
```

## Project Structure

```
src/
├── libs/                    # Shared utilities
│   └── __tests__/
├── modules/                 # Core business logic (reusable)
│   └── __tests__/
└── publish/                 # GitHub Actions entry points
```

- **libs/**: Shared helper functions
- **modules/**: Core business logic, designed to be reusable
- **publish/**: Entry points called by GitHub Actions workflows

## Code Style Guidelines

### File Naming

- Use **kebab-case** for all files: `details-from-context.js`, `update-issue.js`
- Test files go in `__tests__/` subdirectory with same name as source file

### Variable/Function Naming

- **camelCase** for variables and functions: `detailsFromContext`, `publishRepo`
- **UPPER_SNAKE_CASE** for constants/regex patterns: `TARGETS_SECTION_PARSER_REGEX`

### Module System

- **CommonJS** for all source files (`require`/`module.exports`)
- **ES Modules** for test files (`import`/`export`)

### Import Ordering

1. Node.js built-ins (`fs`, `path`)
2. External packages (`@actions/github`, `@actions/core`)
3. Local modules (relative paths)

```javascript
// Example - source file
const fs = require("fs");
const github = require("@actions/github");
const core = require("@actions/core");
const { detailsFromContext } = require("../modules/details-from-context");
```

```javascript
// Example - test file
import { vi, describe, test, expect } from "vitest";
import fs from "fs";
const { updateIssue } = require("../update-issue.js");
```

### Exports

Use CommonJS exports:

```javascript
// Named exports (preferred for multiple exports)
module.exports = { functionA, functionB };

// Single default export
module.exports = functionName;
```

### Formatting

- **Prettier** with default settings
- Double quotes for strings
- Semicolons required
- Run `yarn prettier` before committing

## Error Handling

### Throw Descriptive Errors

Include context about what went wrong and potential fixes:

```javascript
throw new Error(
  'No "GITHUB_TOKEN" environment variable found. ' +
    "Please ensure the workflow is configured correctly"
);
```

### Use Guard Clauses

Validate inputs early with descriptive error messages:

```javascript
if (!context || !context.payload || !context.payload.issue) {
  throw new Error("Issue context is not defined");
}
```

### Handle Unknown Cases in Switch Statements

Always throw for unexpected values:

```javascript
switch (status) {
  case "failure":
    return {
      /* ... */
    };
  case "cancelled":
    return {
      /* ... */
    };
  case "success":
    return {
      /* ... */
    };
  default:
    throw new Error(`Unknown status: '${status}'`);
}
```

### Check File Existence

Before reading files:

```javascript
if (!fs.existsSync(CRAFT_STATE_FILE_PATH)) {
  return;
}
```

## Testing Guidelines

### Framework

- **Vitest v4.0.0** with globals enabled
- No need to import `describe`, `test`, `expect` in test files (they're global)
- Mocks are auto-cleared between tests

### Test File Structure

```javascript
import { vi, describe, test, expect } from "vitest";

// Mock external dependencies
vi.mock("@actions/github");
vi.mock("@actions/core");

// Import module under test AFTER mocks
const { myFunction } = require("../my-module.js");

describe("myFunction", () => {
  test("does something", () => {
    expect(myFunction()).toBe(expected);
  });
});
```

### Mocking Patterns

```javascript
// Mock a module
vi.mock("@actions/github");

// Mock with implementation
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Inline snapshots for complex output
expect(result).toMatchInlineSnapshot(`"expected output"`);
```

## Key Dependencies

- `@actions/core` - GitHub Actions toolkit (inputs, outputs, logging)
- `@actions/github` - GitHub API client for Actions
- `@sentry/node` - Sentry error reporting

## Common Patterns

### Async/Await with Parallel Execution

```javascript
await Promise.all([operation1(), operation2()]);
```

### Destructuring

```javascript
const { repo, owner, issueNumber } = context;
```

### Spread Operator for Object Merging

```javascript
const fullContext = { ...publishRepo, additionalProp: value };
```

### Template Literals

```javascript
const message = `Release ${version} published successfully`;
```

### Regular Expressions with Named Groups

```javascript
const PARSER_REGEX = /(?<name>\w+): (?<value>.+)/;
const match = text.match(PARSER_REGEX);
const { name, value } = match.groups;
```

## GitHub Actions Context

This codebase interacts heavily with GitHub Actions. Entry points in `src/publish/` are called by workflows and use:

- `@actions/core` for inputs/outputs
- `@actions/github` for GitHub API interactions
- Issue-based workflows triggered by labels and comments

## Code Owners

All code is owned by `@getsentry/releng` (Release Engineering team).
