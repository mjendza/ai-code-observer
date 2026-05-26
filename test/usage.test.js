import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extract, formatReset, RateLimited } from "../src/usage.js";

test("extract() parses a well-formed usage payload", () => {
  const sample = {
    five_hour: { utilization: 42, resets_at: "2099-01-01T00:00:00Z" },
    seven_day: { utilization: 75, resets_at: "2099-01-08T00:00:00Z" },
  };
  const out = extract(sample);
  assert.equal(out.fivePct, 42);
  assert.equal(out.weekPct, 75);
  assert.equal(typeof out.fiveReset, "string");
  assert.equal(typeof out.weekReset, "string");
  assert.notEqual(out.fiveReset, "unknown");
  assert.notEqual(out.weekReset, "unknown");
});

test("extract() tolerates missing fields", () => {
  assert.deepEqual(extract({}), {
    fivePct: 0,
    fiveReset: "unknown",
    weekPct: 0,
    weekReset: "unknown",
  });
  assert.deepEqual(extract(null), {
    fivePct: 0,
    fiveReset: "unknown",
    weekPct: 0,
    weekReset: "unknown",
  });
});

test("extract() coerces string percentages to numbers", () => {
  const out = extract({
    five_hour: { utilization: "12.5", resets_at: "" },
    seven_day: { utilization: "88", resets_at: "" },
  });
  assert.equal(out.fivePct, 12.5);
  assert.equal(out.weekPct, 88);
});

test("formatReset() handles empty and invalid inputs", () => {
  assert.equal(formatReset(""), "unknown");
  assert.equal(formatReset(null), "unknown");
  assert.equal(formatReset("not-a-date"), "unknown");
});

test("formatReset() reports 'soon' for past timestamps", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(formatReset(past), "soon");
});

test("formatReset() renders minutes for < 1 hour out", () => {
  const future = new Date(Date.now() + 30 * 60_000).toISOString();
  assert.match(formatReset(future), /^in \d+m$/);
});

test("formatReset() renders hours for < 1 day out", () => {
  const future = new Date(Date.now() + 3 * 3600_000 + 15 * 60_000).toISOString();
  assert.match(formatReset(future), /^in \d+h( \d+m)?$/);
});

test("RateLimited error carries retryAfter", () => {
  const err = new RateLimited(42);
  assert.equal(err.name, "RateLimited");
  assert.equal(err.retryAfter, 42);
  assert.match(err.message, /retry after 42s/);
});

// Acceptance test for the full "access to usage" pipeline:
// loads credentials, builds an authenticated request to the usage
// endpoint, and parses the response. Stubs global fetch so it runs
// offline and never leaks real tokens.
//
// Note: auth.js prefers Windows Credential Manager (via keytar) over the
// file fallback. On machines where Claude Code is signed in, the real
// token is used; otherwise the synthetic file is used. Either way, we
// only assert that some bearer token was attached — the contract under
// test is the request shape and response parsing, not token sourcing.
test("fetchUsage() reads credentials, calls usage endpoint, parses response", async (t) => {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "claude-meter-test-"));
  const claudeDir = path.join(tmp, ".claude");
  await fs.promises.mkdir(claudeDir, { recursive: true });
  const creds = {
    organizationUuid: "test-org",
    claudeAiOauth: {
      accessToken: "fake-token",
      refreshToken: "fake-refresh",
      expiresAt: Date.now() + 3600_000,
    },
  };
  await fs.promises.writeFile(
    path.join(claudeDir, ".credentials.json"),
    JSON.stringify(creds),
  );

  const oldUserProfile = process.env.USERPROFILE;
  const oldHome = process.env.HOME;
  process.env.USERPROFILE = tmp;
  process.env.HOME = tmp;

  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return new Response(
      JSON.stringify({
        five_hour: {
          utilization: 33,
          resets_at: new Date(Date.now() + 3600_000).toISOString(),
        },
        seven_day: {
          utilization: 66,
          resets_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  t.after(async () => {
    globalThis.fetch = oldFetch;
    if (oldUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUserProfile;
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  // Fresh import so auth.js re-resolves CRED_FILE under the new HOME.
  // The query string forces Node's ESM loader to create a new cache entry.
  const usageMod = await import(`../src/usage.js?fresh=${Date.now()}`);
  const data = await usageMod.fetchUsage();

  assert.equal(data.five_hour.utilization, 33);
  assert.equal(data.seven_day.utilization, 66);

  assert.equal(calls.length, 1, "exactly one HTTP call expected");
  assert.match(calls[0].url, /api\.anthropic\.com\/api\/oauth\/usage$/);
  assert.match(
    calls[0].opts.headers.Authorization,
    /^Bearer \S+$/,
    "Authorization header must carry a bearer token",
  );
  assert.equal(calls[0].opts.headers["anthropic-beta"], "oauth-2025-04-20");

  const parsed = extract(data);
  assert.equal(parsed.fivePct, 33);
  assert.equal(parsed.weekPct, 66);
});
