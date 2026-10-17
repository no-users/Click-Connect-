/**
 * driveSync.js
 * ------------------------------------------------------------
 * Loaded into background.js via importScripts(). Handles:
 *   - Signing in to Google (chrome.identity)
 *   - Finding/creating/updating ONE backup file in the signed-in
 *     account's Google Drive (no folders needed) — the SAME file is
 *     always updated in place (never a fresh file each time), so
 *     Drive never accumulates old copies.
 *   - Every 5 minutes (driven by a chrome.alarms tick in
 *     background.js): PULL any newer backup from Drive and merge it
 *     in, then PUSH the local data if it changed.
 *
 * The merge logic (mergeStorageData / mergeDocsStorage /
 * NEVER_IMPORT_KEYS / DOCS_STORAGE_KEY) is copied verbatim from
 * importExport.js's already-tested "Import Backup" logic — same
 * safety guarantees (nothing ever deleted, documents merged
 * per-customer, device-specific settings like the PIN never
 * transferred), just triggered automatically here instead of by a
 * manual file pick.
 *
 * Different-Gmail setup: this file doesn't need to know or care
 * whether every computer signs in with the same Google account. As
 * long as each computer's signed-in account can see the backup file
 * (its own, or shared with "Editor" access from Drive's normal Share
 * dialog), the same code works either way.
 *
 * Sign-in works the SAME way in Chrome, Edge, and Firefox — it uses
 * chrome.identity.launchWebAuthFlow() (a standard OAuth2 web login
 * window), not chrome.identity.getAuthToken(). getAuthToken() only
 * works in actual Google Chrome (it relies on being signed into
 * Chrome itself with a Google account) — it does NOT work in Edge or
 * Firefox, which is why this file avoids it entirely.
 * ------------------------------------------------------------
 */

const EXT_API = typeof browser !== "undefined" ? browser : chrome;

// Paste the "Web application"-type OAuth Client ID here (see the
// setup guide — NOT a "Chrome Extension"-type client ID, since
// launchWebAuthFlow needs a normal web redirect-based client).
const GOOGLE_CLIENT_ID = "998949280865-a3h176q18d6rkv4ckkes7ejl04buflgr.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

const BACKUP_FILE_NAME = "digital-saathi-cloud-backup.json";
const SYNC_ENABLED_KEY = "saathiCloudBackupEnabled";
const LAST_SYNCED_AT_KEY = "saathiLastSyncedAt";
const LAST_BACKUP_SIGNATURE_KEY = "saathiLastBackupSignature";
const LAST_PULLED_MODIFIED_KEY = "saathiLastPulledModifiedTime";
const DRIVE_FILE_ID_KEY = "saathiDriveBackupFileId";
const LAST_SYNC_ERROR_KEY = "saathiLastSyncError";
const TOKEN_KEY = "saathiGoogleAccessToken";
const TOKEN_EXPIRES_AT_KEY = "saathiGoogleTokenExpiresAt";

// ---- Merge logic (copied from importExport.js — see that file for
// the full reasoning/comments behind each rule) ----------------------
const NEVER_IMPORT_KEYS = new Set(["saathiAppPin"]);
const DOCS_STORAGE_KEY = "saathiDocStoreByProfile";

function mergeDocsStorage(existingDocs, incomingDocs) {
  const merged = { ...(existingDocs || {}) };
  Object.keys(incomingDocs || {}).forEach((profileId) => {
    if (!merged[profileId]) {
      merged[profileId] = incomingDocs[profileId];
    } else {
      merged[profileId] = { ...incomingDocs[profileId], ...merged[profileId] };
    }
  });
  return merged;
}

function mergeStorageData(existing, incoming) {
  const merged = { ...existing };
  Object.keys(incoming).forEach((key) => {
    if (NEVER_IMPORT_KEYS.has(key)) return;
    const incomingVal = incoming[key];
    const existingVal = existing[key];

    if (key === DOCS_STORAGE_KEY && typeof incomingVal === "object" && incomingVal !== null) {
      merged[key] = mergeDocsStorage(existingVal, incomingVal);
    } else if (Array.isArray(incomingVal) && Array.isArray(existingVal)) {
      const seen = new Set(existingVal.map((item) => JSON.stringify(item)));
      const combined = [...existingVal];
      incomingVal.forEach((item) => {
        const sig = JSON.stringify(item);
        if (!seen.has(sig)) {
          combined.push(item);
          seen.add(sig);
        }
      });
      merged[key] = combined;
    } else if (existingVal === undefined) {
      merged[key] = incomingVal;
    }
  });
  return merged;
}

// ---- Small helpers ---------------------------------------------------

function cheapHash(str) {
  // Not cryptographic — just enough to cheaply notice "did the data
  // change since our last backup" without re-uploading every 5
  // minutes when nothing happened.
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function storageKeysToBackUp() {
  // Everything except our own sync bookkeeping keys — no point
  // backing up "when did we last sync" as if it were customer data,
  // and it would make every tick look "changed" forever.
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (all) => {
      const copy = { ...all };
      delete copy[SYNC_ENABLED_KEY];
      delete copy[LAST_SYNCED_AT_KEY];
      delete copy[LAST_BACKUP_SIGNATURE_KEY];
      delete copy[LAST_PULLED_MODIFIED_KEY];
      delete copy[DRIVE_FILE_ID_KEY];
      delete copy[LAST_SYNC_ERROR_KEY];
      resolve(copy);
    });
  });
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function getRedirectUrl() {
  return EXT_API.identity.getRedirectURL();
}

function parseTokenFromRedirect(redirectUrl) {
  const hashIndex = redirectUrl.indexOf("#");
  const hash = hashIndex >= 0 ? redirectUrl.slice(hashIndex + 1) : "";
  const params = new URLSearchParams(hash);
  const token = params.get("access_token");
  const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
  return { token, expiresIn };
}

function launchAuth(interactive) {
  return new Promise((resolve, reject) => {
    const redirectUri = getRedirectUrl();
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      "&response_type=token" +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(DRIVE_SCOPE)}` +
      `&prompt=${interactive ? "consent select_account" : "none"}`;

    EXT_API.identity.launchWebAuthFlow({ url: authUrl, interactive: !!interactive }, (redirectUrl) => {
      if (EXT_API.runtime.lastError || !redirectUrl) {
        reject(EXT_API.runtime.lastError || new Error("Sign-in was cancelled or failed"));
        return;
      }
      const { token, expiresIn } = parseTokenFromRedirect(redirectUrl);
      if (!token) {
        reject(new Error("Google se token nahi mila"));
        return;
      }
      resolve({ token, expiresIn });
    });
  });
}

async function getValidToken(interactive) {
  const cached = await storageGet([TOKEN_KEY, TOKEN_EXPIRES_AT_KEY]);
  if (cached[TOKEN_KEY] && cached[TOKEN_EXPIRES_AT_KEY] && Date.now() < cached[TOKEN_EXPIRES_AT_KEY] - 60000) {
    return cached[TOKEN_KEY];
  }
  const { token, expiresIn } = await launchAuth(interactive);
  await storageSet({ [TOKEN_KEY]: token, [TOKEN_EXPIRES_AT_KEY]: Date.now() + expiresIn * 1000 });
  return token;
}

async function driveFetch(token, url, options) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options && options.headers), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive API ${res.status}: ${text}`);
  }
  return res;
}

async function findBackupFile(token) {
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const res = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive`
  );
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

async function uploadBackup(token, existingFileId, dataObj) {
  const metadata = { name: BACKUP_FILE_NAME, mimeType: "application/json" };
  const boundary = "saathi-" + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(dataObj)}\r\n--${boundary}--`;

  // PATCH on an existing file ID = update the SAME file in place
  // (no new file, no old copies left behind). POST only the very
  // first time, when no file exists yet.
  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  const method = existingFileId ? "PATCH" : "POST";

  const res = await driveFetch(token, url, {
    method,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.json();
}

async function downloadBackup(token, fileId) {
  const res = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return res.json();
}

// ---- Main sync tick ---------------------------------------------------

async function runCloudSync() {
  const flags = await storageGet([SYNC_ENABLED_KEY]);
  if (!flags[SYNC_ENABLED_KEY]) return; // feature is OFF

  let token;
  try {
    token = await getValidToken(false); // silent — first-time sign-in happens from the popup toggle
  } catch (e) {
    await storageSet({ [LAST_SYNC_ERROR_KEY]: "Sign-in expired — popup se dobara ON karein." });
    return;
  }

  try {
    const remote = await findBackupFile(token);
    const state = await storageGet([LAST_PULLED_MODIFIED_KEY, LAST_BACKUP_SIGNATURE_KEY, DRIVE_FILE_ID_KEY]);

    // 1) PULL — a newer backup than what we last saw means another
    // computer uploaded since we last checked. Merge it in.
    if (remote && remote.modifiedTime !== state[LAST_PULLED_MODIFIED_KEY]) {
      const remoteParsed = await downloadBackup(token, remote.id);
      const incoming = remoteParsed && remoteParsed.data ? remoteParsed.data : remoteParsed;
      if (incoming && typeof incoming === "object") {
        const existing = await storageKeysToBackUp();
        const merged = mergeStorageData(existing, incoming);
        await storageSet(merged);
      }
      await storageSet({ [LAST_PULLED_MODIFIED_KEY]: remote.modifiedTime });
    }

    // 2) PUSH — only if our data actually changed since the last
    // backup we made (cheap-hash comparison), so a quiet 5-minute
    // tick with nothing new doesn't re-upload for no reason.
    const currentData = await storageKeysToBackUp();
    const currentSignature = cheapHash(JSON.stringify(currentData));
    if (currentSignature !== state[LAST_BACKUP_SIGNATURE_KEY]) {
      const payload = { app: "Digital Saathi", exportedAt: new Date().toISOString(), data: currentData };
      const fileId = (remote && remote.id) || state[DRIVE_FILE_ID_KEY] || null;
      const uploaded = await uploadBackup(token, fileId, payload);
      await storageSet({
        [DRIVE_FILE_ID_KEY]: uploaded.id,
        [LAST_BACKUP_SIGNATURE_KEY]: currentSignature,
        [LAST_SYNCED_AT_KEY]: Date.now(),
        [LAST_PULLED_MODIFIED_KEY]: uploaded.modifiedTime || (new Date()).toISOString(),
        [LAST_SYNC_ERROR_KEY]: null,
      });
    } else {
      await storageSet({ [LAST_SYNCED_AT_KEY]: Date.now(), [LAST_SYNC_ERROR_KEY]: null });
    }
  } catch (e) {
    await storageSet({ [LAST_SYNC_ERROR_KEY]: String((e && e.message) || e) });
  }
}

// Called from the popup when the operator flips "Cloud Backup" ON —
// does the one-time interactive Google sign-in, then runs an
// immediate sync so it doesn't feel like nothing happened.
async function enableCloudBackup() {
  await getValidToken(true); // interactive — shows Google's normal sign-in/consent window
  await storageSet({ [SYNC_ENABLED_KEY]: true });
  await runCloudSync();
}

async function disableCloudBackup() {
  await storageSet({ [SYNC_ENABLED_KEY]: false });
}

self.SaathiCloudSync = { runCloudSync, enableCloudBackup, disableCloudBackup, getRedirectUrl };
