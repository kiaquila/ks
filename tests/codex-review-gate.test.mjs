import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(
  process.env.WEB_DESIGN_REPOSITORY_ROOT || resolve(import.meta.dirname, "..")
);
const helpers = await import(pathToFileURL(
  resolve(repositoryRoot, "scripts/codex-review-helpers.mjs")
).href);
const rerun = await import(pathToFileURL(
  resolve(repositoryRoot, "scripts/codex-review-rerun.mjs")
).href);
const publisher = await import(pathToFileURL(
  resolve(repositoryRoot, "scripts/publish-codex-review-check.mjs")
).href);

const {
  classifyCodexNativeReview,
  evaluateCodexReviewEvidence,
  createCodexReviewRequestMarkerBody,
  extractCodexReviewRequestMarker,
  isAcceptableCodexSummaryComment,
  isCodexReviewCommand,
  isCodexReviewCommandForHead,
  isStrictlyAfterCodexReviewRequest,
  isTrustedAssociation,
  latestCodexNativeReviewResult,
  latestCodexReviewRequestMarker,
  latestTrustedCodexReviewCommand
} = helpers;
const {
  rerunCodexReviewForHead,
  selectCodexReviewRun,
  shouldRouteCodexReviewRerunEvent
} = rerun;
const { checkRunPayload, publishCodexReviewCheck } = publisher;

const headSha = "abc123def456".padEnd(40, "0");
const codexUser = { login: "chatgpt-codex-connector[bot]" };

function markerBody() {
  return createCodexReviewRequestMarkerBody({
    headSha,
    requestId: "10-abc123def456",
    sourceCommentId: "10",
    sourceCommentCreatedAt: "2026-08-05T12:00:00Z",
    requestedAt: "2026-08-05T12:00:00Z"
  });
}

test("trusted request associations and the Codex command are explicit", () => {
  const commandHeadSha = "abcdef0123456789abcdef0123456789abcdef01";
  assert.equal(isTrustedAssociation("OWNER"), true);
  assert.equal(isTrustedAssociation("MEMBER"), true);
  assert.equal(isTrustedAssociation("COLLABORATOR"), true);
  assert.equal(isTrustedAssociation("CONTRIBUTOR"), false);
  assert.equal(isCodexReviewCommand("@codex review"), true);
  assert.equal(isCodexReviewCommand("please @CoDeX   review this"), true);
  assert.equal(isCodexReviewCommand("@codex implement"), false);
  assert.equal(isCodexReviewCommandForHead(`@codex review ${commandHeadSha}`, commandHeadSha), true);
  assert.equal(isCodexReviewCommandForHead(`@codex review ${commandHeadSha}`, "b".repeat(40)), false);
  assert.equal(isCodexReviewCommandForHead("@codex review", commandHeadSha), false);
});

test("request markers bind a GitHub Actions comment to the current head", () => {
  assert.deepEqual(extractCodexReviewRequestMarker(markerBody()), {
    requestId: "10-abc123def456",
    sha: headSha,
    sourceCommentId: "10",
    sourceCommentCreatedAt: "2026-08-05T12:00:00Z",
    requestedAt: "2026-08-05T12:00:00Z"
  });

  const trusted = {
    id: 11,
    body: markerBody(),
    created_at: "2026-08-05T12:00:01Z",
    user: { login: "github-actions[bot]" }
  };
  assert.equal(latestCodexReviewRequestMarker([trusted], headSha)?.requestId, "10-abc123def456");
  assert.equal(
    latestCodexReviewRequestMarker([{ ...trusted, user: { login: "repo-owner" } }], headSha),
    null,
    "a user-authored forged marker must not be accepted"
  );
  assert.equal(latestCodexReviewRequestMarker([trusted], "new-head"), null);
  const olderRequestPublishedLater = {
    ...trusted,
    body: createCodexReviewRequestMarkerBody({
      headSha,
      requestId: "20-abc123def456",
      sourceCommentId: "20",
      sourceCommentCreatedAt: "2026-08-05T12:00:00Z",
      requestedAt: "2026-08-05T12:00:00Z"
    }),
    created_at: "2026-08-05T12:00:02Z"
  };
  const laterRequestPublishedFirst = {
    ...trusted,
    body: createCodexReviewRequestMarkerBody({
      headSha,
      requestId: "21-abc123def456",
      sourceCommentId: "21",
      sourceCommentCreatedAt: "2026-08-05T12:00:01Z",
      requestedAt: "2026-08-05T12:00:01Z"
    }),
    created_at: "2026-08-05T12:00:01Z"
  };
  assert.equal(
    latestCodexReviewRequestMarker([olderRequestPublishedLater, laterRequestPublishedFirst], headSha)?.sourceCommentId,
    "21",
    "markers are ordered by their source request, not delayed marker publication"
  );
});

test("the installation PR can bind directly to a trusted request comment", () => {
  const installationHeadSha = "abcdef0123456789abcdef0123456789abcdef01";
  const command = {
    id: 12,
    body: `@codex review ${installationHeadSha}`,
    created_at: "2026-08-05T12:00:00Z",
    author_association: "OWNER",
    user: { login: "repo-owner", type: "User" }
  };
  assert.equal(
    latestTrustedCodexReviewCommand([command], [], installationHeadSha)?.bootstrap,
    true
  );
  assert.equal(
    latestTrustedCodexReviewCommand(
      [command],
      [{ event: "committed", created_at: "2026-08-05T12:01:00Z" }],
      "new-head"
    ),
    null,
    "a later head update changes the required command SHA"
  );
  assert.equal(
    latestTrustedCodexReviewCommand(
      [{ ...command, author_association: "CONTRIBUTOR" }],
      [],
      installationHeadSha
    ),
    null
  );
});

test("native Codex reviews are current-head and P0-P2 blocking", () => {
  const review = {
    id: 20,
    commit_id: headSha,
    state: "COMMENTED",
    submitted_at: "2026-08-05T12:01:00Z",
    user: codexUser
  };

  assert.equal(classifyCodexNativeReview(review, [], headSha), "pass");
  assert.equal(classifyCodexNativeReview(review, [{
    pull_request_review_id: 20,
    body: "![P3 Badge] Advisory note",
    user: codexUser
  }], headSha), "pass");
  assert.equal(classifyCodexNativeReview(review, [{
    pull_request_review_id: 20,
    body: "P3 context, then ![P2 Badge] Blocking issue",
    user: codexUser
  }], headSha), "fail");
  assert.equal(classifyCodexNativeReview({
    ...review,
    state: "APPROVED"
  }, [{
    pull_request_review_id: 20,
    body: "P3 context, then ![P2 Badge] Blocking issue",
    user: codexUser
  }], headSha), "fail", "approved reviews must still inspect inline findings");
  assert.equal(classifyCodexNativeReview(review, [{
    pull_request_review_id: 20,
    body: "Unclassified finding",
    user: codexUser
  }], headSha), "fail");
  assert.equal(classifyCodexNativeReview(review, [], "new-head"), null);
  assert.equal(
    classifyCodexNativeReview({ ...review, user: { login: "fake-codex[bot]" } }, [], headSha),
    null
  );
});

test("manual trusted validation publishes a head-bound check result", async () => {
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ id: 1 }) };
  };
  await publishCodexReviewCheck({
    token: "token",
    repository: "owner/repo",
    headSha: "a".repeat(40),
    conclusion: "success",
    detailsUrl: "https://github.com/owner/repo/actions/runs/1",
    request
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.github.com/repos/owner/repo/check-runs");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    name: "Codex Review",
    head_sha: "a".repeat(40),
    status: "completed",
    conclusion: "success",
    details_url: "https://github.com/owner/repo/actions/runs/1",
    output: {
      title: "Codex Review passed",
      summary: `Trusted manual validation passed for ${"a".repeat(40)}.`
    }
  });
  assert.throws(
    () => checkRunPayload({ headSha: "short", conclusion: "success", detailsUrl: "https://example.com" }),
    /40-character commit SHA/
  );
  assert.throws(
    () => checkRunPayload({ headSha: "a".repeat(40), conclusion: "neutral", detailsUrl: "https://example.com" }),
    /success or failure/
  );
});

test("native reviews require a strictly later request timestamp", () => {
  const request = { sourceCommentCreatedAt: "2026-08-05T12:00:00Z" };
  assert.equal(isStrictlyAfterCodexReviewRequest("2026-08-05T12:00:01Z", request), true);
  assert.equal(
    isStrictlyAfterCodexReviewRequest("2026-08-05T12:00:00Z", request),
    false,
    "same-second reviews cannot be attributed unambiguously to the latest request"
  );
});

test("Codex no-findings summaries must name the reviewed head", () => {
  const summary = {
    body: `Codex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${headSha.slice(0, 10)}\``,
    created_at: "2026-08-05T12:01:00Z",
    id: "31",
    user: codexUser
  };
  assert.equal(isAcceptableCodexSummaryComment(summary, headSha), true);
  assert.equal(
    isAcceptableCodexSummaryComment(summary, headSha, "2026-08-05T12:00:00Z"),
    true,
    "a current-head summary posted after the request is acceptable"
  );
  assert.equal(
    isAcceptableCodexSummaryComment(summary, headSha, "2026-08-05T12:02:00Z"),
    false,
    "an older summary cannot satisfy a newer review request"
  );
  assert.equal(
    isAcceptableCodexSummaryComment(summary, headSha, "2026-08-05T12:01:00Z", "30"),
    true,
    "a same-second summary posted after the request is acceptable"
  );
  assert.equal(
    isAcceptableCodexSummaryComment(summary, headSha, "2026-08-05T12:01:00Z", "32"),
    false,
    "a same-second summary posted before the request is rejected"
  );
  assert.equal(isAcceptableCodexSummaryComment({ ...summary, body: "Codex Review: Didn't find any major issues." }, headSha), false);
  assert.equal(isAcceptableCodexSummaryComment({ ...summary, body: summary.body.replace(headSha.slice(0, 10), "0000000000") }, headSha), false);
});

test("the latest current-head native Codex result wins", () => {
  const olderPass = {
    id: 1,
    commit_id: headSha,
    state: "COMMENTED",
    submitted_at: "2026-08-05T12:01:00Z",
    user: codexUser
  };
  const newerFail = {
    ...olderPass,
    id: 2,
    submitted_at: "2026-08-05T12:02:00Z"
  };
  assert.equal(latestCodexNativeReviewResult([olderPass, newerFail], [{
    pull_request_review_id: 2,
    body: "P1 regression",
    user: codexUser
  }], headSha), "fail");
  assert.equal(
    latestCodexNativeReviewResult([
      { ...olderPass, submitted_at: "2026-08-05T12:03:00Z" },
      { ...newerFail, submitted_at: "2026-08-05T12:03:00Z" }
    ], [{
      pull_request_review_id: 2,
      body: "P1 regression",
      user: codexUser
    }], headSha),
    "fail",
    "a higher native review ID wins a same-second tie"
  );
});

test("rerun routing accepts only exact trusted Codex evidence", () => {
  assert.equal(shouldRouteCodexReviewRerunEvent({ review: { user: codexUser } }), true);
  assert.equal(
    shouldRouteCodexReviewRerunEvent({
      issue: { pull_request: {} },
      comment: { body: "Codex Review: Didn't find any major issues.", user: codexUser }
    }),
    true
  );
  assert.equal(
    shouldRouteCodexReviewRerunEvent({ review: { user: { login: "fake-codex[bot]" } } }),
    false
  );
});

test("rerun selection is head-bound and waits for active runs before rerunning", () => {
  const failed = {
    id: 30,
    event: "pull_request",
    head_sha: headSha,
    status: "completed",
    conclusion: "failure",
    created_at: "2026-08-05T12:00:00Z"
  };
  assert.deepEqual(selectCodexReviewRun([failed], headSha), { action: "rerun", run: failed });
  const succeeded = { ...failed, conclusion: "success" };
  assert.deepEqual(
    selectCodexReviewRun([succeeded], headSha),
    { action: "rerun", run: succeeded },
    "fresh trusted evidence must re-evaluate a previously successful gate run"
  );
  const active = {
    ...failed,
    id: 31,
    status: "in_progress",
    conclusion: null,
    created_at: "2026-08-05T12:01:00Z"
  };
  assert.deepEqual(
    selectCodexReviewRun([failed, active], headSha),
    { action: "wait_for_active_then_rerun", run: active }
  );
  assert.deepEqual(selectCodexReviewRun([failed], "new-head"), {
    action: "not_found",
    run: null
  });
});

test("rerun helper waits for an active gate before rerunning it", async () => {
  const calls = [];
  const active = {
    id: 42,
    event: "pull_request",
    head_sha: headSha,
    status: "in_progress",
    conclusion: null,
    created_at: "2026-08-05T12:00:00Z"
  };
  let readCount = 0;
  const request = async (_token, _repository, path, options = {}) => {
    calls.push({ path, method: options.method || "GET" });
    if (path.includes("/actions/workflows/codex-review.yml/runs")) {
      readCount += 1;
      return {
        workflow_runs: [readCount === 1 ? active : {
          ...active,
          status: "completed",
          conclusion: "success"
        }]
      };
    }
    return null;
  };

  const result = await rerunCodexReviewForHead({
    token: "token",
    repository: "owner/repo",
    headSha,
    request,
    sleep: async () => {}
  });

  assert.equal(result.action, "rerun");
  assert.equal(calls.filter(({ method }) => method === "GET").length, 2);
  assert.deepEqual(calls.at(-1), {
    path: "/repos/owner/repo/actions/runs/42/rerun",
    method: "POST"
  });
});

test("rerun helper calls the Actions endpoint for a failed head-bound run", async () => {
  const calls = [];
  const request = async (_token, _repository, path, options = {}) => {
    calls.push({ path, method: options.method || "GET" });
    if (path.includes("/actions/workflows/codex-review.yml/runs")) {
      return {
        workflow_runs: [{
          id: 42,
          event: "pull_request",
          head_sha: headSha,
          status: "completed",
          conclusion: "failure",
          created_at: "2026-08-05T12:00:00Z"
        }]
      };
    }
    return null;
  };

  const result = await rerunCodexReviewForHead({
    token: "token",
    repository: "owner/repo",
    headSha,
    request
  });
  assert.equal(result.action, "rerun");
  assert.deepEqual(calls, [
    {
      path: `/repos/owner/repo/actions/workflows/codex-review.yml/runs?event=pull_request&head_sha=${headSha}&per_page=100`,
      method: "GET"
    },
    { path: "/repos/owner/repo/actions/runs/42/rerun", method: "POST" }
  ]);
});

const receiptBody = `<!-- codex-review-receipt:v1 -->

Codex Review: Didn't find any major issues. :rocket:

**Reviewed commit:** \`${headSha.slice(0, 10)}\`

<details> <summary>ℹ️ About Codex in GitHub</summary>
<br/>

[Your team has set up Codex to review pull requests in this repo](https://chatgpt.com/codex/cloud/settings/general). Reviews are triggered when you
- Open a pull request for review
- Mark a draft as ready
- Comment "@codex review".

If Codex has suggestions, it will comment; otherwise it will react with 👍.

Codex can also answer questions or update the PR. Try commenting "@codex address that feedback".
</details>`;
const receiptComment = {
  id: 31, body: receiptBody, user: codexUser,
  created_at: "2026-08-05T12:01:00Z", updated_at: "2026-08-05T12:01:00Z"
};
const structuredBody = `<!-- codex-pull-request-review-summary -->
<!-- codex-review-state:v1 ${JSON.stringify({
  code_review: { commit_sha: headSha, has_any_findings: false, has_unresolved_findings: false, status: "completed" },
  security_review: { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null }
})} -->

## Codex Review Summary`;

test("observed receipt and legacy envelopes require one unambiguous positive verdict and SHA", () => {
  const accept = (body, other = {}) => isAcceptableCodexSummaryComment(
    { ...receiptComment, body, ...other }, headSha, "2026-08-05T12:00:00Z", "10"
  );
  assert.equal(accept(receiptBody), true);
  assert.equal(accept(receiptBody.replace(":rocket:", "Keep it up!")), true);
  assert.equal(accept(receiptBody.replace(headSha.slice(0, 10), headSha)), true);
  assert.equal(accept(receiptBody.replace("<!-- codex-review-receipt:v1 -->\n\n", "")), true);
  const invalid = [
    receiptBody.replace(headSha.slice(0, 10), "0000000000"),
    receiptBody.replace(headSha.slice(0, 10), `${headSha.slice(0, 10)}000000000000000000000000000000`),
    receiptBody.replace(/\*\*Reviewed commit:\*\*[^\n]+/, ""),
    receiptBody.replace("v1", "v2"),
    receiptBody.replace("v1 -->", "v1"),
    `<!-- codex-review-receipt:v1 -->\n${receiptBody}`,
    receiptBody.replace("<details>", `**Reviewed commit:** \`${"0".repeat(10)}\`\n<details>`),
    receiptBody.replace("Didn't find any major issues.", "Found a P2 issue."),
    receiptBody.replace("Didn't find any major issues.", "Review in progress."),
    receiptBody.replace("<details>", "P1: regression remains\n<details>"),
    `${receiptBody}\nCodex Review: Found problems.`,
    receiptBody.replace("<br/>", "<br/>Codex Review: Found problems."),
    receiptBody.replace("<br/>", `**Reviewed commit:** \`${"0".repeat(10)}\``),
    `${receiptBody}\n${structuredBody}`,
    structuredBody,
    "Completed 👍"
  ];
  for (const body of invalid) assert.equal(accept(body), false, body);
  assert.equal(accept(receiptBody, { user: { login: "fake-codex[bot]" } }), false);
  assert.equal(accept(receiptBody, { updated_at: "2026-08-05T11:59:00Z" }), false);
});

test("workflow and runtime route created/edited receipts and existing summary updates identically", () => {
  const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/codex-review-rerun.yml"), "utf8");
  assert.match(workflow, /issue_comment:\s*types: \[created, edited\]/);
  assert.match(workflow, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(workflow, /node scripts\/codex-review-rerun.mjs/);
  assert.match(workflow, /cancel-in-progress: false/);
  const condition = workflow.match(/    if: \|\n([\s\S]+?)    runs-on:/)[1];
  const workflowRoutes = new Function("github", "startsWith", `return (${condition});`);
  for (const action of ["created", "edited"]) {
    for (const body of ["Codex Review: Found a P2 issue.", receiptBody, structuredBody]) {
      for (const login of [codexUser.login, "fake-codex[bot]", "github-actions[bot]", "kiaquila"]) {
        const event = { action, issue: { pull_request: {} }, comment: {
          ...receiptComment, body, user: { login },
          created_at: "2026-08-04T12:00:00Z", updated_at: "2026-08-05T12:01:00Z"
        } };
        const expected = login === codexUser.login;
        assert.equal(shouldRouteCodexReviewRerunEvent(event), expected);
        assert.equal(workflowRoutes({ event, event_name: "issue_comment" }, (s, p) => s.startsWith(p)), expected);
      }
    }
  }
  assert.equal(shouldRouteCodexReviewRerunEvent({ action: "edited", issue: {}, comment: receiptComment }), false);
  for (const user of [codexUser, { login: "fake-codex[bot]" }]) {
    const event = { review: { user }, issue: {}, comment: {} };
    assert.equal(Boolean(workflowRoutes({ event, event_name: "pull_request_review" })), shouldRouteCodexReviewRerunEvent(event));
  }
});

test("summary updates only wake the gate and cannot supply a verdict", () => {
  for (const body of [structuredBody, structuredBody.replace('"completed"', '"in_progress"'),
    structuredBody.replace('"has_any_findings":false', '"has_any_findings":true'),
    structuredBody.replace(headSha, "0".repeat(40)), `${structuredBody}\n${structuredBody}`,
    structuredBody.replace('"code_review":', '"code_review":null,"duplicate":')]) {
    assert.equal(isAcceptableCodexSummaryComment({ ...receiptComment, body }, headSha), false);
  }
});

test("new requests cannot clear native failures or any unresolved Codex thread", () => {
  const evidence = {
    headSha, comments: [receiptComment], reviews: [], reviewComments: [], threads: [],
    requestMarker: { sourceCommentCreatedAt: "2026-08-05T12:00:00Z", sourceCommentId: "10" }
  };
  assert.equal(evaluateCodexReviewEvidence(evidence), "pass");
  assert.equal(evaluateCodexReviewEvidence({ ...evidence, reviews: [{
    id: 21, user: codexUser, commit_id: headSha, state: "CHANGES_REQUESTED",
    submitted_at: "2026-08-05T11:59:00Z"
  }] }), "fail");
  const thread = { isResolved: false, comments: { nodes: [{ author: codexUser, body: "P3 advisory" }] } };
  assert.equal(evaluateCodexReviewEvidence({ ...evidence, threads: [thread] }), "fail");
  assert.equal(evaluateCodexReviewEvidence({ ...evidence, requestMarker: null, threads: [thread] }), "fail");
  assert.equal(evaluateCodexReviewEvidence({ ...evidence, threads: [{ ...thread, isResolved: true }] }), "pass");
  assert.equal(evaluateCodexReviewEvidence({ ...evidence, headSha: "0".repeat(40) }), "pending");
  assert.equal(evaluateCodexReviewEvidence({ ...evidence, comments: [{ ...receiptComment, body: structuredBody }] }), "pending");
});

test("rerun coalesces already evaluated evidence and aborts a push during active wait", async () => {
  for (const active of [false, true]) {
    const calls = [];
    let reads = 0;
    const request = async (_token, _repository, path, options = {}) => {
      calls.push({ path, method: options.method || "GET" });
      if (path.endsWith("/pulls/36")) return { head: { sha: reads > 1 ? "0".repeat(40) : headSha } };
      reads++;
      return { workflow_runs: [{ id: 42, event: "pull_request", head_sha: headSha,
        status: active && reads === 1 ? "in_progress" : "completed",
        run_started_at: "2026-08-05T12:02:00Z", created_at: "2026-08-05T12:00:00Z" }] };
    };
    const result = await rerunCodexReviewForHead({ token: "token", repository: "owner/repo", headSha,
      prNumber: 36, evidenceUpdatedAt: active ? undefined : "2026-08-05T12:01:00Z", request, sleep: async () => {} });
    assert.equal(result.action, active ? "stale" : "already_evaluated");
    assert.equal(calls.some(({ method }) => method === "POST"), false);
  }
  let posts = 0;
  const request = async (_token, _repo, path, options = {}) => {
    if (options.method === "POST") { posts++; return null; }
    if (path.endsWith("/pulls/36")) return { head: { sha: headSha } };
    return { workflow_runs: [{ id: 42, event: "pull_request", head_sha: headSha, status: "completed",
      run_started_at: "2026-08-05T12:01:00Z", created_at: "2026-08-05T12:00:00Z" }] };
  };
  await rerunCodexReviewForHead({ token: "token", repository: "owner/repo", headSha, prNumber: 36,
    evidenceUpdatedAt: "2026-08-05T12:02:00Z", request });
  assert.equal(posts, 1, "an edit after the previous attempt must get a new attempt");
});

// Run the actual entry point against API fixtures, including the last HEAD read.
function runGate({ moveHead = false, requireHeadMatch = true, threadError = false } = {}) {
  const script = `
    let headReads = 0;
    globalThis.fetch = async (url) => {
      let data;
      if (url.endsWith('/pulls/36')) data = { head: { sha: ${JSON.stringify(headSha)} } };
      if (url.endsWith('/pulls/36') && ++headReads > 3 && ${moveHead}) data.head.sha = '0'.repeat(40);
      if (url.includes('/issues/36/comments?')) data = ${JSON.stringify([
        { id: 11, body: markerBody(), created_at: "2026-08-05T12:00:01Z", user: { login: "github-actions[bot]" } },
        receiptComment
      ])};
      if (url.includes('/pulls/36/reviews?') || url.includes('/pulls/36/comments?')) data = [];
      if (url.endsWith('/graphql')) data = ${threadError} ? { errors: [{ message: 'Denied' }] } :
        { data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } } } } } };
      if (!data) throw new Error('Unexpected API: ' + url);
      return { ok: true, json: async () => data };
    };
    await import(${JSON.stringify(pathToFileURL(resolve(repositoryRoot, "scripts/codex-review-gate.mjs")).href)});
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10000,
    env: { ...process.env, GITHUB_TOKEN: "fixture", GITHUB_REPOSITORY: "owner/repo", CODEX_REVIEW_PR_NUMBER: "36",
      CODEX_REVIEW_HEAD_SHA: headSha, CODEX_REVIEW_REQUIRE_HEAD_MATCH: String(requireHeadMatch),
      CODEX_REVIEW_WAIT_MS: "50", CODEX_REVIEW_POLL_MS: "5", CODEX_REVIEW_DEBOUNCE_MS: "0",
      CODEX_REVIEW_BOOTSTRAP: "false", GITHUB_STEP_SUMMARY: "" } });
}

test("actual gate accepts receipt, fails closed on thread errors, and rejects a mid-evaluation push", () => {
  const success = runGate();
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /Codex Review passed/);
  const moved = runGate({ moveHead: true });
  assert.equal(moved.status, 1, moved.stdout);
  assert.match(moved.stderr, /head moved/);
  const denied = runGate({ threadError: true });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /complete review-thread evidence/);
});

test("actual rerun entry point uses an edited summary's update time and fresh API head", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "ks-review-event-"));
  const eventPath = resolve(directory, "event.json");
  try {
    const event = { action: "edited", issue: { number: 36, pull_request: {} }, comment: {
      ...receiptComment, body: structuredBody, created_at: "2026-08-04T12:00:00Z",
      updated_at: "2026-08-05T12:02:00Z"
    } };
    writeFileSync(eventPath, JSON.stringify(event));
    const scriptPath = resolve(repositoryRoot, "scripts/codex-review-rerun.mjs");
    const script = `
      process.argv[1] = ${JSON.stringify(scriptPath)};
      globalThis.fetch = async (url, options) => {
        let data;
        if (url.endsWith('/pulls/36')) data = { head: { sha: ${JSON.stringify(headSha)} } };
        if (url.includes('/actions/workflows/')) {
          if (!url.includes(${JSON.stringify(headSha)})) throw new Error('Wrong head');
          data = { workflow_runs: [{ id: 42, event: 'pull_request', head_sha: ${JSON.stringify(headSha)},
            status: 'completed', run_started_at: '2026-08-05T12:01:00Z', created_at: '2026-08-05T12:00:00Z' }] };
        }
        if (url.endsWith('/actions/runs/42/rerun') && options.method === 'POST') { console.log('RERUN_POST'); data = {}; }
        if (!data) throw new Error('Unexpected API: ' + url);
        return { ok: true, text: async () => JSON.stringify(data) };
      };
      await import(${JSON.stringify(pathToFileURL(scriptPath).href)});
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8", timeout: 10000, env: { ...process.env, GITHUB_TOKEN: "fixture",
        GITHUB_REPOSITORY: "owner/repo", GITHUB_EVENT_PATH: eventPath }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RERUN_POST/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
