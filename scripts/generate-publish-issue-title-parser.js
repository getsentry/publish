const fs = require("fs");
const path = require("path");
const peggy = require("peggy");
const prettier = require("prettier");

const grammarPath = path.join(
  __dirname,
  "..",
  "src",
  "modules",
  "publish-issue-title.peggy"
);
const outputPath = path.join(
  __dirname,
  "..",
  "src",
  "modules",
  "publish-issue-title.js"
);
const documentationPath = path.join(
  __dirname,
  "..",
  "docs",
  "publish-issue-format.md"
);
function generateDocumentation({ documentation, titleGrammar }) {
  const markers = documentation.match(
    /<!--\s*(?:BEGIN|END)\s+GENERATED\s+TITLE\s+GRAMMAR\b/g
  );

  if (
    markers?.filter((marker) => marker.includes("BEGIN")).length !== 1 ||
    markers?.filter((marker) => marker.includes("END")).length !== 1
  ) {
    throw new Error(
      "Could not find the generated title grammar in the documentation."
    );
  }

  const marker =
    /<!--\s*BEGIN\s+GENERATED\s+TITLE\s+GRAMMAR\s*-->\n[\s\S]*?<!--\s*END\s+GENERATED\s+TITLE\s+GRAMMAR\s*-->/.exec(
      documentation
    );

  if (!marker) {
    throw new Error(
      "Could not find the generated title grammar in the documentation."
    );
  }

  return documentation.replace(
    marker[0],
    `<!-- BEGIN GENERATED TITLE GRAMMAR -->\n\`\`\`peggy\n${titleGrammar.trim()}\n\`\`\`\n<!-- END GENERATED TITLE GRAMMAR -->`
  );
}

function main() {
  const grammar = fs.readFileSync(grammarPath, "utf8");
  const parser = peggy.generate(grammar, {
    allowedStartRules: [
      "PublishIssueTitle",
      "ReleaseRevision",
      "CheckRunsLinkCount",
    ],
    format: "commonjs",
    grammarSource: "publish-issue-title.peggy",
    output: "source",
  });

  const generatedParser = prettier.format(`/* eslint-disable */\n${parser}`, {
    filepath: outputPath,
  });
  const titleGrammar = grammar.match(
    /\/\/ BEGIN TITLE GRAMMAR\n(?<grammar>[\s\S]*?)\/\/ END TITLE GRAMMAR/
  )?.groups?.grammar;

  if (!titleGrammar) {
    throw new Error("Could not find the publish issue title grammar.");
  }

  const documentation = fs.readFileSync(documentationPath, "utf8");
  const generatedDocumentation = generateDocumentation({
    documentation,
    titleGrammar,
  });

  if (process.argv.includes("--check")) {
    const currentParser = fs.readFileSync(outputPath, "utf8");
    if (currentParser !== generatedParser) {
      throw new Error(
        "The generated publish issue title parser is stale. Run `pnpm generate`."
      );
    }
    if (documentation !== generatedDocumentation) {
      throw new Error(
        "The generated publish issue title documentation is stale. Run `pnpm generate`."
      );
    }
  } else {
    fs.writeFileSync(outputPath, generatedParser);
    fs.writeFileSync(documentationPath, generatedDocumentation);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateDocumentation };
