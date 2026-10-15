#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isTrustedCodexLogin } from "./codex-review-helpers.mjs";

const ACTIVE_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "requested",
  "pending"
]);
const ACTIVE_RUN_POLL_INTERVAL_MS = 10_000;
const MAX_ACTIVE_RUN_POLLS = 24;

export function shouldRouteCodexReviewRerunEvent(event) {
  if (event?.review) return isTrustedCodexLogin(event.review.user?.login);
  if (!event?.issue?.pull_request || !event?.comment) return false;
  // Summary edits are wakeups only; the gate still requires a receipt or
  // formal review and never treats the summary's presence as a verdict.
  return /^(?:Codex Review:|<!-- codex-review-receipt:|<!-- codex-pull-request-review-summary -->)/.test(String(event.comment.body || "")) &&
    isTrustedCodexLogin(event.comment.user?.login);
}

export function selectCodexReviewRun(runs = [], headSha) {
  const matchingRuns = runs
    .filter((run) => run.event === "pull_request" && run.head_sha === headSha)
    .sort((left, right) =>
      Date.parse(right.created_at || "") - Date.parse(left.created_at || "")
    );

  const activeRun = matchingRuns.find((run) => ACTIVE_STATUSES.has(run.status));
  if (activeRun) return { action: "wait_for_active_then_rerun", run: activeRun };

  const rerunnableRun = matchingRuns.find((run) => run.status === "completed");
  if (rerunnableRun) return { action: "rerun", run: rerunnableRun };

  return { action: "not_found", run: null };
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function defaultRequest(token, repository, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function rerunCodexReviewForHead({
  token,
  repository,
  headSha,
  prNumber,
  evidenceUpdatedAt,
  request = defaultRequest,
  sleep = defaultSleep,
  maxActiveRunPolls = MAX_ACTIVE_RUN_POLLS
}) {
  if (!token || !repository || !headSha) {
    throw new Error("token, repository, and headSha are required to rerun Codex Review.");
  }

  const [owner, repo] = repository.split("/");
  const currentHeadMatches = async () => !prNumber || (await request(
    token, repository, `/repos/${owner}/${repo}/pulls/${prNumber}`
  )).head?.sha === headSha;
  if (!await currentHeadMatches()) return { action: "stale", message: "PR head changed before rerun." };
  const runsPath = `/repos/${owner}/${repo}/actions/workflows/codex-review.yml/runs?event=pull_request&head_sha=${encodeURIComponent(headSha)}&per_page=100`;
  let data = await request(token, repository, runsPath);
  let selected = selectCodexReviewRun(data.workflow_runs || [], headSha);

  for (let poll = 0; selected.action === "wait_for_active_then_rerun" && poll < maxActiveRunPolls; poll += 1) {
    await sleep(ACTIVE_RUN_POLL_INTERVAL_MS);
    data = await request(token, repository, runsPath);
    selected = selectCodexReviewRun(data.workflow_runs || [], headSha);
  }

  if (selected.action === "wait_for_active_then_rerun") {
    throw new Error(
      `Codex Review run ${selected.run.id} remained active while waiting to evaluate new trusted evidence for ${headSha}.`
    );
  }

  if (selected.action === "rerun") {
    // A queued duplicate event needs no extra attempt if this run already
    // started strictly after the evidence update (same-second ties rerun).
    if (Date.parse(selected.run.run_started_at || "") > Date.parse(evidenceUpdatedAt || "")) {
      return { action: "already_evaluated", run: selected.run, message: "Gate already evaluated this evidence." };
    }
    if (!await currentHeadMatches()) return { action: "stale", message: "PR head changed while waiting for the gate." };
    await request(
      token,
      repository,
      `/repos/${owner}/${repo}/actions/runs/${selected.run.id}/rerun`,
      { method: "POST" }
    );
    return {
      ...selected,
      message: `Requested Codex Review rerun for ${headSha} from run ${selected.run.id}.`
    };
  }

  const messages = {
    not_found: `No completed Codex Review pull_request run found for ${headSha}.`
  };
  return { ...selected, message: messages[selected.action] };
}

async function resolveHeadSha({ token, repository, prNumber, request = defaultRequest }) {
  if (!prNumber) {
    throw new Error("Could not resolve pull request from event.");
  }
  const [owner, repo] = repository.split("/");
  const pull = await request(
    token,
    repository,
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
  return pull.head?.sha;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !eventPath) {
    throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_EVENT_PATH are required.");
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  if (!shouldRouteCodexReviewRerunEvent(event)) {
    console.log("Codex Review rerun skipped: event is not trusted Codex evidence.");
    return;
  }

  const prNumber = event.pull_request?.number || event.issue?.number;
  const headSha = await resolveHeadSha({ token, repository, prNumber });
  const evidenceUpdatedAt = event.comment?.updated_at || event.comment?.created_at || event.review?.submitted_at;
  const result = await rerunCodexReviewForHead({ token, repository, headSha, prNumber, evidenceUpdatedAt });
  console.log(result.message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`Codex Review rerun failed: ${error.message}`);
    process.exit(1);
  }
}
