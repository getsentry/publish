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
const grammar = fs.readFileSync(grammarPath, "utf8");
const parser = peggy.generate(grammar, {
  format: "commonjs",
  grammarSource: "publish-issue-title.peggy",
  output: "source",
});

const generatedParser = prettier.format(`/* eslint-disable */\n${parser}`, {
  filepath: outputPath,
});

if (process.argv.includes("--check")) {
  const currentParser = fs.readFileSync(outputPath, "utf8");
  if (currentParser !== generatedParser) {
    throw new Error(
      "The generated publish issue title parser is stale. Run `yarn generate`."
    );
  }
} else {
  fs.writeFileSync(outputPath, generatedParser);
}
