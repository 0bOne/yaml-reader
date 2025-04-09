# Yaml Parser 

A minimalistic YAML parser with no external dependencies.

## Requirements

NodeJS v20 or higher.

## Installing

Install from within your project, like this:
```sh
npm install 0bone/yaml-reader
```

## Using

The file must be read into a string before calling the parser.

Example

```js
const fs = require("node:fs");
const path = require("node:path");
const Parser = require("@0b1.org/yaml-reader/parser");

const inputPath = path.join(__dirname, "tests/docs/valid.yaml);
const inputData = fs.readFileSync(inputPath, "utf-8");
const result = Parser.Parse(inputData);

console.log(result);
```



