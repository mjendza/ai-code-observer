# claude-meter

At-a-glance Claude Code usage on a tiny screen. Pulls live 5-hour and
weekly percentages from Anthropic's OAuth usage endpoint and pushes
them to a [Geekmagic SmallTV](https://geekmagic.com/) clock over
your LAN.

Numbers match the Claude app's **Settings → Usage** exactly — both
come from the same `/api/oauth/usage` endpoint the desktop app uses.

Node.js implementation targeting **Windows**. Runs in the foreground
from a terminal.

---

## How it works

```
       ┌────────────────────┐
       │  Claude Code CLI   │   (you're already signed in)
       │  Credential Mgr or │
       │  ~/.claude/.creds  │
       └─────────┬──────────┘
                 │ reused (no separate login)
                 ▼
       ┌────────────────────┐           ┌─────────────────────────┐
       │claude-code-observer│──GET──────▶ /api/oauth/usage        │
       │    push loop       │◀─────────── {five_hour, seven_day}  │
       └─────────┬──────────┘           └─────────────────────────┘
                 │ render to JPEG (Skia canvas + vendored encoder)
                 ▼
       ┌────────────────────┐
       │  GeeKmagic clock   │   on your Wi-Fi
       └────────────────────┘
```

Token refresh is automatic. When the access token is within 60 seconds
of expiry, claude-meter exchanges the refresh token against
`/v1/oauth/token` and writes the new pair back to the same store
where it came from.

---

## Requirements

- **Windows 10/11.** Tested on Windows 11.
- **Node.js 20.6+** (Node 22 LTS recommended). The `npm start` script
  uses Node's built-in `--env-file=.env`, which requires Node 20.6 or
  newer. Install from <https://nodejs.org>.
- **[Claude Code](https://claude.com/claude-code) CLI installed and
  signed in.** claude-meter reuses its OAuth tokens — there's no
  separate login. Either Windows Credential Manager
  (`Claude Code-credentials`) or `%USERPROFILE%\.claude\.credentials.json`
  works; claude-meter checks both in that order.
- **A GeeKmagic SmallTV clock** on the same Wi-Fi network. Tested
  against v2 firmware.

Native dependencies (`@napi-rs/canvas`, `keytar`) ship prebuilt for
win32-x64 — no MSVC build chain needed.

---

## Install

```powershell
git clone https://github.com/<you>/claude-meter.git
cd claude-meter
npm install
copy .env.example .env
notepad .env   # set DEVICE_HOST to the clock's IP
```

`npm install` pulls deps and runs the native prebuild scripts for
`@napi-rs/canvas` and `keytar` — no separate installer is needed.

---

## Configure

Configuration is loaded from a `.env` file in the project root. `npm
start` reads it via Node's built-in `--env-file=.env`.

| Variable             | Default      | Meaning |
| -------------------- | ------------ | ------- |
| `DEVICE_HOST`        | *(required)* | IP or hostname of the clock. |
| `MODE`               | `photo240`   | `gif80` or `photo240`. See "Display modes" below. |
| `TRANSPORT`          | `geekmagic`  | Only `geekmagic` is implemented today. |
| `PUSH_INTERVAL_SEC`  | `60`         | Seconds between fetches. Below ~30s tends to trip Anthropic's rate limiter; claude-meter honors `Retry-After` automatically but lighter polling is cleaner. |
| `FORCE_PUSH_SEC`     | `0`          | When > 0, skip the upload while percentages are unchanged for this many seconds. Default `0` means always re-render and push every cycle so the reset-countdown text stays fresh. |

Example `.env`:

```ini
DEVICE_HOST=192.168.1.50
MODE=photo240
PUSH_INTERVAL_SEC=60
FORCE_PUSH_SEC=0
```

### Display modes

- **`gif80`** — 80×80 JPEG that lives in the device's Customization-GIF
  slot. Shown alongside the stock clock + weather. Good for
  "ambient" display. The frame is encoded with firmware-specific
  quantization tables and JFIF density bytes; mismatched output is
  silently rejected by the device.
- **`photo240`** — full-screen 240×240 usage card with reset
  countdowns. Requires Photo mode enabled on the clock:
  *Settings → Photo*, `photo-switch` **ON**, `file1-switch` **ON**,
  `file2-switch`…`file5-switch` **OFF**.

Both modes push a single JPEG; `gif80` wraps it in the firmware's
custom 33-frame container so it survives the Customization-GIF
validator.

---

## Verify

```powershell
node bin\claude-code-observer.js check
```

Prints three lines:

- `auth: ok (org=…)` — Claude Code token works.
- `usage: ok (5h=N%, 7d=N%)` — API responded.
- `config: from environment` + `device=… mode=… interval=…s force=…s` — effective config loaded from `.env`.

Exit code is non-zero if any step fails.

`npm run check` wraps the same command with `--env-file=.env` so the
values from your `.env` are used.

---

## Run

```powershell
npm start
```

or, if you've already loaded the env vars into your shell some other
way:

```powershell
node bin\claude-code-observer.js run
```

This is a foreground process. Leave the terminal open; press
**Ctrl+C** to stop. On error the loop logs and retries with
exponential backoff (capped at 600s). 429s honor `Retry-After`.

### Optional: run hidden at logon

If you want it to start automatically without opening a window,
register a Task Scheduler task that runs
`node D:\path\to\claude-meter\bin\claude-code-observer.js run` at logon. The
installer does NOT do this for you in this build.

---

## Debug

Render one frame to disk without pushing to the device:

```powershell
node bin\claude-code-observer.js dump-frame --mode gif80 --five 42 --week 75 --out test.jpg
```

Open `test.jpg` in any image viewer to confirm the layout.

---

## CLI reference

```
claude-meter [--version]
             { run | check | dump-frame | snapshot | push |
               install-service | uninstall-service | service-status }
```

| Command             | Purpose                                                 |
|---------------------|---------------------------------------------------------|
| `run`               | Run the push loop in the foreground.                    |
| `check`             | Verify auth + API + config (one-shot).                  |
| `dump-frame`        | Render one frame to disk for inspection.                |
| `snapshot`          | Fetch live usage and render one frame to disk.          |
| `push`              | Render one frame and upload it to the device — no loop. |

All commands except `dump-frame` need the env vars from `.env` to be in
scope. The easiest way is `npm start` (or `npm run check`); to invoke
the binary directly, prefix it with Node's flag, e.g.
`node --env-file=.env bin\claude-code-observer.js push --fake`.

---

## Privacy

claude-meter talks to exactly two places:

- `api.anthropic.com` — for the usage endpoint and token refresh, using
  *your* Claude Code OAuth tokens.
- The clock's IP on your LAN — for the JPEG upload.

No telemetry, no analytics, no third-party services, no phone-home.
Tokens never leave your machine except to Anthropic.

---

## Troubleshooting

**`auth: FAIL — No Claude Code credentials found`**
Run `claude` and sign in, then retry `node bin\claude-code-observer.js check`.

**`[warn] 429 rate limited, sleeping Ns` in logs**
Anthropic rate-limited the usage endpoint. claude-meter honors the
`Retry-After` header automatically, so occasional 429s are harmless.
If they're frequent, raise `--push-interval` (default is 60s).

**Clock shows the old image, byte count looks right**
Geekmagic's firmware silently rejects malformed uploads with HTTP 200
but keeps the previous content on screen. Make sure Photo mode is
configured correctly for `photo240` (see *Display modes* above). For
`gif80`, double-check that no proxy is rewriting the JPEG.

**Clock IP changed / I moved networks**
Edit `DEVICE_HOST` in `.env` and restart the `run` process to pick up
the new value (env vars load once at startup).

---

## Development

```
src/
├── cli.js              # commander subcommands
├── config.js           # env-only config loader (reads process.env)
├── auth.js             # keytar then .credentials.json fallback
├── usage.js            # /api/oauth/usage + RateLimited handling
├── loop.js             # fetch → render → push → dedup → sleep
├── renderers/
│   ├── palette.js      # colors + bar_color
│   ├── font.js         # font registration (assets/DejaVuSans-Bold.ttf)
│   ├── gif80.js        # 80×80 JPEG with firmware qtables/APP0
│   ├── photo240.js     # 240×240 JPEG (standard encode)
│   └── index.js
├── transports/
│   ├── geekmagic.js    # multipart POST /upload + 33-frame container
│   └── index.js
└── vendor/
    └── jpeg-encoder.js # adapted jpeg-js encoder, 4:2:0 + custom qtables
```

Re-run `npm install` after pulling new code.

---

## License

MIT. See [LICENSE](LICENSE).
