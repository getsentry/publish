import { expect, test } from "vitest";

const {
  generateDocumentation,
} = require("../../../scripts/generate-publish-issue-title-parser.js");

test("requires generated title grammar markers in the documentation", () => {
  expect(() =>
    generateDocumentation({
      documentation: "# Publish Issue Format\n",
      titleGrammar: 'PublishIssueTitle = "publish: "',
    })
  ).toThrow("Could not find the generated title grammar in the documentation.");
});

test("rejects duplicate generated title grammar markers", () => {
  expect(() =>
    generateDocumentation({
      documentation: `<!-- BEGIN GENERATED TITLE GRAMMAR -->
old
<!-- END GENERATED TITLE GRAMMAR -->
<!-- BEGIN GENERATED TITLE GRAMMAR -->
old
<!-- END GENERATED TITLE GRAMMAR -->`,
      titleGrammar: 'PublishIssueTitle = "publish: "',
    })
  ).toThrow("Could not find the generated title grammar in the documentation.");
});

test("rejects malformed generated title grammar markers", () => {
  expect(() =>
    generateDocumentation({
      documentation: `<!-- BEGIN GENERATED TITLE GRAMMAR -->
old
<!-- END GENERATED TITLE GRAMMAR -->
<!-- BEGIN GENERATED TITLE GRAMMAR -- >`,
      titleGrammar: 'PublishIssueTitle = "publish: "',
    })
  ).toThrow("Could not find the generated title grammar in the documentation.");
});
