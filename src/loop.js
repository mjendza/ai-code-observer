import * as renderers from "./renderers/index.js";
import * as transports from "./transports/index.js";
import { RateLimited, extract, fetchUsage } from "./usage.js";

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(cfg) {
  if (!cfg.device_host) {
    console.error("DEVICE_HOST is not set. Copy .env.example to .env and fill in DEVICE_HOST, then run `npm start`.");
    process.exit(1);
  }

  const renderer = renderers.get(cfg.mode);
  const transport = transports.get(cfg.transport, { host: cfg.device_host, mode: cfg.mode });

  let loggedOnce = false;
  let lastKey = null;
  let lastPushTs = 0;
  let failStreak = 0;

  let shuttingDown = false;
  const stop = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nbye (${sig})`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  while (!shuttingDown) {
    let sleepFor = cfg.push_interval_sec;
    try {
      const data = await fetchUsage();
      if (!loggedOnce) {
        console.log("API response:", JSON.stringify(data, null, 2));
        loggedOnce = true;
      }

      const { fivePct, fiveReset, weekPct, weekReset } = extract(data);
      const key = `${Math.round(fivePct)},${Math.round(weekPct)}`;
      const now = Date.now() / 1000;

      if (key === lastKey && now - lastPushTs < cfg.force_push_sec) {
        console.log(`${ts()} 5h ${Math.round(fivePct)}%  7d ${Math.round(weekPct)}%  unchanged, skipped`);
      } else {
        const payload = renderer.render(fivePct, fiveReset, weekPct, weekReset);
        const result = await transport.push(payload);
        // Back-compat: older transports returned just the byte count.
        const bytes = typeof result === "object" ? result.bytes : result;
        const filename = typeof result === "object" ? result.filename : "";
        lastKey = key;
        lastPushTs = now;
        const fileTag = filename ? ` as ${filename}` : "";
        console.log(`${ts()} 5h ${Math.round(fivePct)}%  7d ${Math.round(weekPct)}%  pushed ${bytes}B${fileTag} (${cfg.mode})`);
      }
      failStreak = 0;
    } catch (e) {
      if (e instanceof RateLimited) {
        sleepFor = Math.max(e.retryAfter, cfg.push_interval_sec);
        console.log(`${ts()} [warn] 429 rate limited on GET ${e.url}, sleeping ${sleepFor}s`);
      } else {
        failStreak += 1;
        sleepFor = Math.min(cfg.push_interval_sec * Math.pow(2, failStreak - 1), 600);
        const urlTag = e?.url ? ` on GET ${e.url}` : "";
        console.log(`${ts()} [warn] ${e?.name || "Error"}${urlTag}: ${e?.message || e} (retry in ${sleepFor}s)`);
      }
    }

    await sleep(sleepFor * 1000);
  }
}
