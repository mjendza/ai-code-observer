import { GeekmagicTransport } from "./geekmagic.js";

export function get(name, opts) {
  if (name === "geekmagic") return new GeekmagicTransport(opts.host, opts.mode);
  throw new Error(`unknown transport: ${JSON.stringify(name)}`);
}
