const fs = require("node:fs");
const path = require("node:path");
const Parser = require("../lib/parser");


const tests = [
    "valid"
];

let passCount = 0;


console.log("starting tests");

tests.forEach(name => {
    console.log("testing:", name);
    const result = runTest(name);
    passCount += result;
    console.log("completed:", name, 1 ? "passed": "failed");
});

console.log("completed tests", passCount, "passed, out of", tests.length, "total");
if (passCount < tests.length) {
    process.exit(1);
}

function runTest(fileName) {
    let testSuccess = 0;
    const yamlPath = path.resolve(__dirname, "docs", fileName + ".yaml");
    const rawYaml = fs.readFileSync(yamlPath, "utf-8");
    const parsed = Parser.Parse(rawYaml);
    let actualJson = JSON.stringify(parsed, null, 2);

    const jsonPath = path.resolve(__dirname, "docs", fileName + ".json");
    if (fs.existsSync(jsonPath)) {
        const rawJson = fs.readFileSync(jsonPath, "utf-8");
        testSuccess = (rawJson === actualJson)? 1: 0;
        if (testSuccess === 0) {
            console.warn("jsom mismatch", actualJson);
        }
    } else {
        console.warn("json does not exist", jsonPath, "Saving");
        fs.writeFileSync(jsonPath, actualJson, "utf-8");
    }

    return testSuccess;

}