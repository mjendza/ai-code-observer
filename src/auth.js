import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const SCOPE = "user:inference user:file_upload user:profile";

const CRED_SERVICE = "Claude Code-credentials";
const CRED_FILE = path.join(os.homedir(), ".claude", ".credentials.json");

const EXPIRY_HEADROOM_MS = 60_000;

let _cache = null;

async function _readKeytar() {
  let keytar;
  try {
    ({ default: keytar } = await import("keytar"));
  } catch {
    return null;
  }
  try {
    const account = os.userInfo().username;
    const raw = await keytar.getPassword(CRED_SERVICE, account);
    if (!raw) return null;
    return { source: "keytar", account, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function _readFile() {
  if (!fs.existsSync(CRED_FILE)) return null;
  try {
    return { source: "file", data: JSON.parse(fs.readFileSync(CRED_FILE, "utf8")) };
  } catch {
    return null;
  }
}

async function _writeBack(creds) {
  if (creds.source === "file") {
    try {
      fs.writeFileSync(CRED_FILE, JSON.stringify(creds.data));
      try { fs.chmodSync(CRED_FILE, 0o600); } catch { /* windows: no-op */ }
    } catch (e) {
      console.warn(`[warn] could not persist refreshed token: ${e.message}`);
    }
    return;
  }
  if (creds.source === "keytar") {
    try {
      const { default: keytar } = await import("keytar");
      await keytar.setPassword(CRED_SERVICE, creds.account, JSON.stringify(creds.data));
    } catch (e) {
      console.warn(`[warn] could not persist refreshed token to keychain: ${e.message}`);
    }
  }
}

async function _refresh(refreshToken) {
  const body = {
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
    scope: SCOPE,
    expires_in: 28800,
  };
  const ctrl = AbortSignal.timeout(10_000);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: ctrl,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AuthError(`token refresh failed: HTTP ${resp.status} ${text}`);
  }
  return await resp.json();
}

async function _resolve() {
  const creds = (await _readKeytar()) || _readFile();
  if (!creds) {
    throw new AuthError(
      `No Claude Code credentials found. Looked in Windows Credential Manager (service "${CRED_SERVICE}") and ${CRED_FILE}. Run \`claude\` and sign in first.`,
    );
  }
  const oauth = creds.data?.claudeAiOauth || {};
  const access = oauth.accessToken || "";
  const refresh = oauth.refreshToken || "";
  const expiresAt = Number(oauth.expiresAt || 0);
  const org = creds.data?.organizationUuid || "";

  if (access && Date.now() < expiresAt - EXPIRY_HEADROOM_MS) {
    return { access, org, creds };
  }

  if (!refresh) {
    throw new AuthError("access token expired and no refresh token found. Run `claude` and sign in again.");
  }

  const result = await _refresh(refresh);
  const newAccess = result.access_token || "";
  if (!newAccess) throw new AuthError(`refresh response missing access_token: ${JSON.stringify(result)}`);

  const expiresIn = Number(result.expires_in || 28800);
  const updated = {
    ...creds.data,
    claudeAiOauth: {
      ...oauth,
      accessToken: newAccess,
      refreshToken: result.refresh_token || refresh,
      expiresAt: Date.now() + expiresIn * 1000,
    },
  };
  const newCreds = { ...creds, data: updated };
  await _writeBack(newCreds);
  return { access: newAccess, org: updated.organizationUuid || org, creds: newCreds };
}

export async function getAccessToken() {
  if (_cache && Date.now() < _cache.expiresAt - EXPIRY_HEADROOM_MS) {
    return { token: _cache.token, org: _cache.org };
  }
  const { access, org, creds } = await _resolve();
  const expiresAt = Number(creds.data?.claudeAiOauth?.expiresAt || Date.now() + 28800_000);
  _cache = { token: access, org, expiresAt };
  return { token: access, org };
}

export function invalidateCachedToken() {
  _cache = null;
}

export async function forceRefreshAccessToken() {
  const creds = (await _readKeytar()) || _readFile();
  if (!creds) {
    throw new AuthError(
      `No Claude Code credentials found. Looked in Windows Credential Manager (service "${CRED_SERVICE}") and ${CRED_FILE}. Run \`claude\` and sign in first.`,
    );
  }
  const oauth = creds.data?.claudeAiOauth || {};
  const refresh = oauth.refreshToken || "";
  if (!refresh) throw new AuthError("no refresh token found. Run `claude` and sign in again.");

  const result = await _refresh(refresh);
  const newAccess = result.access_token || "";
  if (!newAccess) throw new AuthError(`refresh response missing access_token: ${JSON.stringify(result)}`);

  const expiresIn = Number(result.expires_in || 28800);
  const expiresAt = Date.now() + expiresIn * 1000;
  const updated = {
    ...creds.data,
    claudeAiOauth: {
      ...oauth,
      accessToken: newAccess,
      refreshToken: result.refresh_token || refresh,
      expiresAt,
    },
  };
  await _writeBack({ ...creds, data: updated });
  const org = updated.organizationUuid || creds.data?.organizationUuid || "";
  _cache = { token: newAccess, org, expiresAt };
  return { token: newAccess, org };
}
