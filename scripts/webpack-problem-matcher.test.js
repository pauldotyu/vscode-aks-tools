"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { stripVTControlCharacters } = require("node:util");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const { config, error } = ts.readConfigFile(path.join(root, ".vscode/tasks.json"), ts.sys.readFile);
assert.equal(error, undefined);
const matchers = config.tasks.find((task) => task.label === "webpack-dev").problemMatcher;
const matcher = matchers.find((item) => item.source === "webpack");
const startPattern = new RegExp(matcher.background.beginsPattern);
const endPattern = new RegExp(matcher.background.endsPattern);

function parseErrors(output) {
    const lines = stripVTControlCharacters(output).split(/\r?\n/);
    const result = [];
    for (let index = 0; index < lines.length - 1; index++) {
        const location = new RegExp(matcher.pattern[0].regexp).exec(lines[index]);
        const message = new RegExp(matcher.pattern[1].regexp).exec(lines[index + 1]);
        if (location && message) {
            result.push({
                file: location[matcher.pattern[0].file],
                line: Number(location[matcher.pattern[0].line]),
                column: Number(location[matcher.pattern[0].column]),
                code: message[matcher.pattern[1].code],
                message: message[matcher.pattern[1].message],
            });
        }
    }
    return result;
}

describe("webpack development problem matchers", () => {
    it("extracts the actual TypeScript location and message without duplicate header entries", () => {
        const file = "/workspace with spaces/src/tests/suite/kickstartRepositories.test.ts";
        const output = [
            `ERROR in ${file}`,
            "32:30-102",
            `[tsl] ERROR in ${file}(32,30)`,
            "      TS2554: Expected 2 arguments, but got 1.",
        ].join("\n");
        assert.deepEqual(parseErrors(output), [
            {
                file,
                line: 32,
                column: 30,
                code: "TS2554",
                message: "Expected 2 arguments, but got 1.",
            },
        ]);
        assert.equal(
            parseErrors(output.replaceAll(file, "C:\\workspace\\src\\file.ts"))[0].file,
            "C:\\workspace\\src\\file.ts",
        );
    });

    it("recognizes repeated build cycles and retains webview and ESLint diagnostics", () => {
        for (const item of matchers) {
            assert.equal(item.owner, "webpack");
            assert.equal(item.applyTo, "allDocuments");
            assert.deepEqual(item.background, matcher.background);
        }
        assert.ok(matchers.some((item) => item.base === "$tsc"));
        assert.ok(matchers.some((item) => item.base === "$eslint-stylish"));
        assert.ok(startPattern.test("    [webpack-cli] Compiler starting... "));
        assert.ok(startPattern.test("    [webpack-cli] Compiler 'extension' starting... "));
        for (const line of [
            "webpack 5.110.1 compiled with 1 error in 1000 ms",
            "webpack 5.110.1 compiled successfully in 100 ms",
            "webpack compiled successfully",
        ]) {
            assert.ok(endPattern.test(line), line);
        }
    });

    it("recognizes a real failing-to-passing webpack watch rebuild", async function () {
        this.timeout(60_000);
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aks-webpack-matcher-"));
        let child;
        let closed;
        let timeout;
        try {
            const entry = path.join(directory, "entry.ts");
            await fs.writeFile(entry, 'export const value: number = "incorrect";\n');
            await fs.writeFile(
                path.join(directory, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: { target: "ES2022", module: "commonjs", types: [], skipLibCheck: true },
                    files: ["entry.ts"],
                }),
            );
            await fs.writeFile(
                path.join(directory, "webpack.config.cjs"),
                `module.exports = ${JSON.stringify({
                    context: directory,
                    entry,
                    output: { path: path.join(directory, "dist"), filename: "fixture.js" },
                })};\n` +
                    `
module.exports.module = { rules: [{
    test: /\\.ts$/,
    loader: ${JSON.stringify(require.resolve("ts-loader"))},
    options: { configFile: ${JSON.stringify(path.join(directory, "tsconfig.json"))} }
}] };\n`,
            );

            const command = require("../package.json").scripts["webpack-dev"].split("&&").at(-1).trim().split(/\s+/);
            assert.equal(command.shift(), "webpack");
            assert.ok(command.includes("--infrastructure-logging-level"));
            child = spawn(
                process.execPath,
                [
                    path.join(root, "node_modules/webpack-cli/bin/cli.js"),
                    ...command,
                    "--config",
                    path.join(directory, "webpack.config.cjs"),
                ],
                { cwd: root, env: { ...process.env, FORCE_COLOR: "0" }, stdio: ["ignore", "pipe", "pipe"] },
            );
            closed = new Promise((resolve) => child.once("close", resolve));

            let output = "";
            let starts = 0;
            let completions = 0;
            let cycle = "";
            const buffers = { stdout: "", stderr: "" };
            await new Promise((resolve, reject) => {
                timeout = setTimeout(() => reject(new Error(`Watch rebuild timed out:\n${output}`)), 45_000);
                child.once("error", reject);
                child.once("exit", (code) => {
                    if (completions < 2) reject(new Error(`Watcher exited early (${code}):\n${output}`));
                });
                for (const stream of ["stdout", "stderr"]) {
                    child[stream].on("data", (data) => {
                        output += data;
                        buffers[stream] += stripVTControlCharacters(data.toString());
                        const lines = buffers[stream].split(/\r?\n/);
                        buffers[stream] = lines.pop();
                        for (const line of lines) {
                            if (startPattern.test(line)) {
                                starts++;
                                cycle = "";
                            }
                            cycle += `${line}\n`;
                            if (!endPattern.test(line)) continue;
                            try {
                                completions++;
                                assert.equal(
                                    starts,
                                    completions,
                                    "Each rebuild needs a start marker to clear old errors",
                                );
                                if (completions === 1) {
                                    const problems = parseErrors(cycle);
                                    assert.equal(problems.length, 1, cycle);
                                    assert.equal(problems[0].file, entry);
                                    assert.equal(problems[0].line, 1);
                                    assert.equal(problems[0].column, 14);
                                    assert.equal(problems[0].code, "TS2322");
                                    void fs.writeFile(entry, "export const value: number = 1;\n").catch(reject);
                                } else {
                                    assert.match(line, /compiled successfully/);
                                    assert.deepEqual(parseErrors(cycle), []);
                                    resolve();
                                }
                            } catch (failure) {
                                reject(failure);
                            }
                        }
                    });
                }
            });
        } finally {
            clearTimeout(timeout);
            if (child && child.exitCode === null) child.kill();
            if (closed) await closed;
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
