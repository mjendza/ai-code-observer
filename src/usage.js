import { getAccessToken, invalidateCachedToken, forceRefreshAccessToken } from "./auth.js";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const BETA = "oauth-2025-04-20";

export class RateLimited extends Error {
  constructor(retryAfter, url) {
    super(`rate limited, retry after ${retryAfter}s`);
    this.name = "RateLimited";
    this.retryAfter = retryAfter;
    this.url = url;
  }
}

export { USAGE_URL };

function parseRetryAfter(value) {
  if (!value) return 60;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  const ts = Date.parse(value);
  if (!Number.isNaN(ts)) {
    const delta = Math.floor((ts - Date.now()) / 1000);
    return delta >= 1 ? delta : 1;
  }
  return 60;
}

async function _get(token) {
  const resp = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": BETA,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (resp.ok) return await resp.json();
  const retryAfter = resp.headers.get("retry-after");
  const err = new Error(`HTTP ${resp.status} ${USAGE_URL}`);
  err.status = resp.status;
  err.retryAfter = retryAfter;
  err.url = USAGE_URL;
  throw err;
}

export async function fetchUsage() {
  let { token } = await getAccessToken();
  try {
    return await _get(token);
  } catch (e) {
    if (e.status === 429) {
      console.log(`[info] 429 received, force-refreshing Claude Code OAuth token`);
      try {
        ({ token } = await forceRefreshAccessToken());
      } catch (refreshErr) {
        console.log(`[warn] token refresh failed during 429 handling: ${refreshErr.message}`);
        throw new RateLimited(parseRetryAfter(e.retryAfter), USAGE_URL);
      }
      try {
        return await _get(token);
      } catch (e2) {
        if (e2.status === 429) throw new RateLimited(parseRetryAfter(e2.retryAfter), USAGE_URL);
        throw e2;
      }
    }
    if (e.status === 401 || e.status === 403) {
      invalidateCachedToken();
      ({ token } = await getAccessToken());
      try {
        return await _get(token);
      } catch (e2) {
        if (e2.status === 429) throw new RateLimited(parseRetryAfter(e2.retryAfter), USAGE_URL);
        throw e2;
      }
    }
    throw e;
  }
}

export function formatReset(resetsAtStr) {
  if (!resetsAtStr) return "unknown";
  const ts = Date.parse(resetsAtStr);
  if (Number.isNaN(ts)) return "unknown";
  const secs = Math.floor((ts - Date.now()) / 1000);
  if (secs <= 0) return "soon";
  if (secs < 3600) return `in ${Math.floor(secs / 60)}m`;
  if (secs < 86400) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return m ? `in ${h}h ${m}m` : `in ${h}h`;
  }
  const d = new Date(ts);
  const wd = d.toLocaleString("en-US", { weekday: "short" });
  let hour = d.getHours();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${wd} ${hour}:${minute} ${ampm}`;
}

export function extract(data) {
  const five = data?.five_hour || {};
  const week = data?.seven_day || {};
  return {
    fivePct: Number(five.utilization || 0),
    fiveReset: formatReset(five.resets_at || ""),
    weekPct: Number(week.utilization || 0),
    weekReset: formatReset(week.resets_at || ""),
  };
}
