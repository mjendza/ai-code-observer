
import FormData from "form-data";
import net from "node:net";

const GIF_INDEX_SIZE = 2400;
const GIF_FRAME_COUNT = 33;
const RECORD_MAGIC = 0x01ff;

export class GeekmagicTransport {
  constructor(host, mode) {
    let h = host;
    if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
    this.base = h.replace(/\/$/, "");
    this.mode = mode;
  }

  async push(payload) {
    let body, filename, url, field, referer;
    if (this.mode === "gif80") {
      body = buildGifContainer(payload, GIF_FRAME_COUNT);
      filename = "gif.jpg";
      url = `${this.base}/upload`;
      field = "imageFile";
      referer = null;
    } else if (this.mode === "photo240") {
      body = payload;
      filename = "snapshot.jpg";
      url = `${this.base}/photo/upload`;
      field = "file";
      referer = `${this.base}/photo`;
    } else {
      throw new Error(`unsupported mode for geekmagic: ${JSON.stringify(this.mode)}`);
    }

    const form = new FormData();
    form.append(field, body, { filename, contentType: "image/jpeg" });

    await postForm(url, form, 5000, referer);
    return { bytes: body.length, filename };
  }
}

export function buildGifContainer(frame, count = GIF_FRAME_COUNT) {
  const fSize = frame.length;
  const idx = Buffer.alloc(GIF_INDEX_SIZE);

  // Record 0: u16 magic, u16 frameCount, u32 offset(=0), u32 size
  idx.writeUInt16LE(RECORD_MAGIC, 0);
  idx.writeUInt16LE(count, 2);
  idx.writeUInt32LE(0, 4);
  idx.writeUInt32LE(fSize, 8);

  for (let k = 1; k < count; k++) {
    const off = fSize + GIF_INDEX_SIZE + (k - 1) * fSize;
    const base = k * 12;
    idx.writeUInt16LE(RECORD_MAGIC, base);
    idx.writeUInt16LE(k, base + 2);
    idx.writeUInt32LE(off, base + 4);
    idx.writeUInt32LE(fSize, base + 8);
  }

  const tail = Buffer.alloc(fSize * (count - 1));
  for (let k = 0; k < count - 1; k++) frame.copy(tail, k * fSize);

  return Buffer.concat([frame, idx, tail]);
}

function getFormLength(form) {
  return new Promise((resolve, reject) => {
    form.getLength((err, length) => (err ? reject(err) : resolve(length)));
  });
}

async function postForm(url, form, timeoutMs, referer) {
  // The GeekMagic firmware misbehaves in two ways: it doesn't support
  // chunked request bodies (we must send Content-Length), and its
  // *responses* are also malformed ("Invalid character in chunk size"),
  // which trips Node's HTTP parser even with insecureHTTPParser. To work
  // around both we speak raw TCP: build a fixed-size HTTP/1.1 POST by
  // hand and read only the status line back, ignoring any garbage body framing.
  const length = await getFormLength(form);
  const u = new URL(url);
  const port = Number(u.port) || 80;
  const formHeaders = form.getHeaders();
  const requestHead =
    `POST ${u.pathname + u.search} HTTP/1.1\r\n` +
    `Host: ${u.hostname}${u.port ? ":" + u.port : ""}\r\n` +
    `Content-Type: ${formHeaders["content-type"]}\r\n` +
    `Content-Length: ${length}\r\n` +
    (referer ? `Referer: ${referer}\r\n` : "") +
    `Accept: */*\r\n` +
    `Connection: close\r\n` +
    `\r\n`;

  console.log(`>>> POST ${url}`);
  for (const line of requestHead.split("\r\n")) {
    if (line) console.log(`>>> ${line}`);
  }
  console.log(`>>> [body ${length}B multipart]`);

  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: u.hostname, port });
    sock.setTimeout(timeoutMs);

    let buf = Buffer.alloc(0);
    let statusCode = null;
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (buf.length > 0) {
        const text = buf.toString("utf8").replace(/\r/g, "");
        for (const line of text.split("\n")) {
          if (line) console.log(`<<< ${line}`);
        }
      }
      sock.destroy();
      err ? reject(err) : resolve();
    };

    sock.on("connect", () => {
      sock.write(requestHead);
      // Keep the socket open after the form ends so we can read the response.
      form.pipe(sock, { end: false });
      form.on("error", done);
    });
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (statusCode !== null) return;
      const eol = buf.indexOf("\r\n");
      if (eol < 0) return;
      const statusLine = buf.subarray(0, eol).toString("ascii");
      const m = /^HTTP\/\d\.\d\s+(\d{3})/.exec(statusLine);
      if (!m) return done(new Error(`bad status line from ${url}: ${statusLine}`));
      statusCode = Number(m[1]);
    });
    sock.on("timeout", () => done(new Error(`request to ${url} timed out`)));
    sock.on("error", done);
    sock.on("close", () => {
      if (settled) return;
      if (statusCode === null) return done(new Error(`connection closed before response from ${url}`));
      if (statusCode >= 200 && statusCode < 300) done();
      else done(new Error(`HTTP ${statusCode} from ${url}`));
    });
  });
}
