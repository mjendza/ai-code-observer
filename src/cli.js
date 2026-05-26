import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";

import * as config from "./config.js";
import { AuthError, getAccessToken } from "./auth.js";
import { extract, fetchUsage } from "./usage.js";
import * as renderers from "./renderers/index.js";
import * as transports from "./transports/index.js";
import * as loop from "./loop.js";

const VERSION = "0.2.0";
const ENV_HINT = "Set DEVICE_HOST in .env (see .env.example) and run via `npm start`.";

async function cmdRun(opts) {
  const cfg = config.load();
  if (opts?.mode) cfg.mode = opts.mode;
  await loop.run(cfg);
}

async function cmdCheck() {
  let org = "";
  try {
    ({ org } = await getAccessToken());
    console.log(`auth:   ok (org=${org})`);
  } catch (e) {
    console.error(`auth:   FAIL — ${e instanceof AuthError ? e.message : (e?.message || e)}`);
    process.exit(2);
  }

  try {
    const data = await fetchUsage();
    const five = data?.five_hour?.utilization;
    const week = data?.seven_day?.utilization;
    console.log(`usage:  ok (5h=${five}%, 7d=${week}%)`);
  } catch (e) {
    console.error(`usage:  FAIL — ${e?.message || e}`);
    process.exit(2);
  }

  const cfg = config.load();
  console.log(`config: from environment`);
  console.log(`        device=${cfg.device_host || "(unset)"} mode=${cfg.mode} interval=${cfg.push_interval_sec}s force=${cfg.force_push_sec}s`);
}

async function cmdDumpFrame(opts) {
  const cfg = config.load();
  const mode = opts.mode || cfg.mode;
  const renderer = renderers.get(mode);
  const five = Number(opts.five ?? 42);
  const week = Number(opts.week ?? 75);
  const payload = renderer.render(five, "in 1h 30m", week, "Mon 9:00 AM");
  const out = path.resolve(opts.out || "frame.jpg");
  fs.writeFileSync(out, payload);
  console.log(`wrote ${payload.length}B → ${out} (mode=${mode}, 5h=${five}%, 7d=${week}%)`);
}

async function cmdSnapshot(opts) {
  const cfg = config.load();
  const mode = opts.mode || cfg.mode;
  const renderer = renderers.get(mode);

  const data = await fetchUsage();
  const { fivePct, fiveReset, weekPct, weekReset } = extract(data);
  const payload = renderer.render(fivePct, fiveReset, weekPct, weekReset);

  const out = path.resolve(opts.out || "frame.jpg");
  fs.writeFileSync(out, payload);
  console.log(
    `wrote ${payload.length}B → ${out} ` +
    `(mode=${mode}, 5h=${Math.round(fivePct)}% resets ${fiveReset}, ` +
    `7d=${Math.round(weekPct)}% resets ${weekReset})`,
  );
}

async function cmdPush(opts) {
  const cfg = config.load();
  const mode = opts.mode || cfg.mode;
  if (!cfg.device_host) {
    console.error(`device_host is not set. ${ENV_HINT}`);
    process.exit(1);
  }
  const renderer = renderers.get(mode);
  const transport = transports.get(cfg.transport, { host: cfg.device_host, mode });

  let fivePct, fiveReset, weekPct, weekReset;
  if (opts.fake) {
    fivePct = Number(opts.five ?? 42);
    weekPct = Number(opts.week ?? 75);
    fiveReset = "in 1h 30m";
    weekReset = "Mon 9:00 AM";
  } else {
    const data = await fetchUsage();
    ({ fivePct, fiveReset, weekPct, weekReset } = extract(data));
  }

  const payload = renderer.render(fivePct, fiveReset, weekPct, weekReset);
  const result = await transport.push(payload);
  const bytes = typeof result === "object" ? result.bytes : result;
  const filename = typeof result === "object" ? result.filename : "";
  console.log(`pushed ${bytes}B as ${filename} (mode=${mode}, 5h=${Math.round(fivePct)}%, 7d=${Math.round(weekPct)}%)`);
}

function notSupported() {
  console.log("service install is not supported in this build. Run `claude-meter run` from a terminal.");
}

export async function main() {
  const program = new Command();
  program
    .name("claude-meter")
    .description("Push Claude Code usage to a tiny screen.")
    .version(VERSION);

  program.command("run")
    .description("Run the push loop in the foreground")
    .option("--mode <mode>", "gif80 | photo240 (default: from MODE in .env)")
    .action(cmdRun);

  program.command("check")
    .description("Verify auth + API + config")
    .action(cmdCheck);

  program.command("dump-frame")
    .description("Render one frame to disk for inspection")
    .option("--mode <mode>", "gif80 | photo240 (default: from MODE in .env)")
    .option("--five <pct>", "5h percentage (default 42)")
    .option("--week <pct>", "7d percentage (default 75)")
    .option("--out <path>", "output file (default frame.jpg)")
    .action(cmdDumpFrame);

  program.command("snapshot")
    .description("Fetch live usage and render one frame to disk — no device upload")
    .option("--mode <mode>", "gif80 | photo240 (default: from MODE in .env)")
    .option("--out <path>", "output file (default frame.jpg)")
    .action(cmdSnapshot);

  program.command("push")
    .description("Render one frame and upload it to the device — no loop")
    .option("--mode <mode>", "gif80 | photo240 (default: from MODE in .env)")
    .option("--fake", "skip the usage API and use fake values")
    .option("--five <pct>", "5h percentage when --fake is set (default 42)")
    .option("--week <pct>", "7d percentage when --fake is set (default 75)")
    .action(cmdPush);

  program.command("install-service")
    .description("(stub) service install is not supported in this build")
    .action(notSupported);
  program.command("uninstall-service")
    .description("(stub) service install is not supported in this build")
    .action(notSupported);
  program.command("service-status")
    .description("(stub) service install is not supported in this build")
    .action(notSupported);

  await program.parseAsync(process.argv);
}
