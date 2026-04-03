import { readFileSync, writeFileSync } from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const inputPath = "dist/index.js";
const code = readFileSync(inputPath, "utf8");

const result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: "browser",
});

writeFileSync(inputPath, result.getObfuscatedCode());
console.log("Obfuscation complete.");
