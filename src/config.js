export const DEFAULTS = Object.freeze({
  device_host: "",
  mode: "photo240",
  transport: "geekmagic",
  push_interval_sec: 60,
  force_push_sec: 0,
});

function num(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number, got ${JSON.stringify(v)}`);
  return n;
}

export function load() {
  return {
    device_host: process.env.DEVICE_HOST || DEFAULTS.device_host,
    mode: process.env.MODE || DEFAULTS.mode,
    transport: process.env.TRANSPORT || DEFAULTS.transport,
    push_interval_sec: num("PUSH_INTERVAL_SEC", DEFAULTS.push_interval_sec),
    force_push_sec: num("FORCE_PUSH_SEC", DEFAULTS.force_push_sec),
  };
}
