import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function resolveWithin(root, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || isAbsolute(relativePath)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return target;
}

export function validateConfig(config, root) {
  const errors = [];
  if (!isObject(config) || config.schemaVersion !== 1) {
    return ["web-design.config.json must use schemaVersion 1"];
  }
  if (!kebabCase.test(config.projectSlug ?? "") || config.projectSlug === "replace-me") {
    errors.push("projectSlug must be replaced with the project's lower-case kebab-case slug");
  }

  if (!Array.isArray(config.projectChecks) || config.projectChecks.length === 0) {
    errors.push("projectChecks must contain at least one real build or test command");
  } else {
    for (const [index, check] of config.projectChecks.entries()) {
      if (!isObject(check) || typeof check.name !== "string" || !check.name.trim()) {
        errors.push(`projectChecks[${index}] must have a name`);
      }
      if (!Array.isArray(check?.command) || check.command.length === 0 ||
          check.command.some((part) => typeof part !== "string" || !part)) {
        errors.push(`projectChecks[${index}].command must be a non-empty string array`);
      }
      try {
        resolveWithin(root, check?.cwd ?? ".", `projectChecks[${index}].cwd`);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  const performance = config.performance;
  if (!isObject(performance)) return [...errors, "performance configuration is required"];
  let outputRoot = root;
  try {
    outputRoot = resolveWithin(root, performance.outputDirectory, "performance.outputDirectory");
  } catch (error) {
    errors.push(error.message);
  }
  if (!Array.isArray(performance.entryPages) || performance.entryPages.length === 0) {
    errors.push("performance.entryPages must list the built documents a visitor lands on");
  } else {
    for (const [index, page] of performance.entryPages.entries()) {
      try {
        resolveWithin(outputRoot, page, `performance.entryPages[${index}]`);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  if (!Array.isArray(performance.allowedExtensions) || performance.allowedExtensions.length === 0 ||
      performance.allowedExtensions.some((extension) => !/^\.[a-z0-9]+$/.test(extension))) {
    errors.push("performance.allowedExtensions must contain lower-case file extensions");
  }

  const delivery = performance.delivery;
  if (!isObject(delivery)) return [...errors, "performance.delivery is required"];
  try {
    resolveWithin(root, delivery.baseline, "performance.delivery.baseline");
  } catch (error) {
    errors.push(error.message);
  }
  if (typeof delivery.tolerance !== "number" || !(delivery.tolerance > 0 && delivery.tolerance < 1)) {
    errors.push("performance.delivery.tolerance must be a fraction between 0 and 1");
  }
  if (!isObject(delivery.connection) || !positiveInteger(delivery.connection.downloadKbps) ||
      !positiveInteger(delivery.connection.rttMs)) {
    errors.push("performance.delivery.connection needs positive downloadKbps and rttMs");
  }
  return errors;
}

export function loadConfig(root) {
  const path = join(root, "web-design.config.json");
  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read web-design.config.json: ${error.message}`);
  }
  const errors = validateConfig(config, root);
  if (errors.length) throw new Error(errors.join("\n"));
  return config;
}
