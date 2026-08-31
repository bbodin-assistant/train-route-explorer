import init, { build_context, routes_for_day } from "./pkg/train_route_explorer.js";

const CACHE_DB = "train-route-explorer";
const DB_VERSION = 2;
const CONTEXT_STORE = "contexts";
const SOURCE_STORE = "sources";
const LAST_SOURCE_KEY = "__last_source__";
const CACHE_VERSION = "gtfs-context-v4";

let wasmReady = false;
let archiveBytes = null;
let sourceMeta = null;
let activeContext = null;
let activeConfig = null;

async function ensureWasm() {
  if (!wasmReady) {
    await init();
    wasmReady = true;
  }
}

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CONTEXT_STORE)) {
        request.result.createObjectStore(CONTEXT_STORE);
      }
      if (!request.result.objectStoreNames.contains(SOURCE_STORE)) {
        request.result.createObjectStore(SOURCE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeGet(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function storeSet(storeName, key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function normalizedConfig(config) {
  const list = (value) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  const minTransfer = Math.max(0, Number(config.min_transfer_minutes ?? 10));
  const maxTransfer = Math.max(minTransfer, Number(config.max_transfer_minutes ?? 120));
  return {
    local_origins: list(config.local_origins),
    connection_stations: list(config.connection_stations),
    side_b_destinations: list(config.side_b_destinations),
    train_types: list(config.train_types),
    min_transfer_minutes: minTransfer,
    max_transfer_minutes: maxTransfer,
    max_transfer_count: Math.max(0, Number(config.max_transfer_count ?? 2)),
    max_journey_duration_minutes: Math.max(0, Number(config.max_journey_duration_minutes ?? 1440)),
  };
}

function buildConfigForCore(config) {
  return {
    local_origins: config.local_origins,
    connection_stations: config.connection_stations,
    side_b_destinations: config.side_b_destinations,
    train_types: config.train_types,
    max_transfer_count: config.max_transfer_count,
  };
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureSourceHash(bytes, meta) {
  if (meta.hash) return meta.hash;
  meta.hash = await sha256(bytes);
  return meta.hash;
}

async function cacheKey(bytes, meta, config) {
  const sourceHash = await ensureSourceHash(bytes, meta);
  const { sourceKey, ...cacheMeta } = meta;
  return JSON.stringify({
    version: CACHE_VERSION,
    source: { ...cacheMeta, hash: sourceHash },
    config: buildConfigForCore(config),
  });
}

function sourceKeyForBundled(url) {
  return `bundled:${url}`;
}

function sourceRecordBytes(record) {
  if (record.bytes instanceof Uint8Array) return record.bytes;
  return new Uint8Array(record.bytes);
}

async function loadStoredSource(sourceKey) {
  const record = await storeGet(SOURCE_STORE, sourceKey);
  if (!record || !record.bytes || !record.meta) return null;
  return {
    bytes: sourceRecordBytes(record),
    meta: { ...record.meta, sourceKey },
    stored: true,
  };
}

async function loadLastStoredSource() {
  const pointer = await storeGet(SOURCE_STORE, LAST_SOURCE_KEY);
  if (!pointer?.sourceKey) return null;
  return loadStoredSource(pointer.sourceKey);
}

async function storeSource(bytes, meta) {
  const hash = await ensureSourceHash(bytes, meta);
  const sourceKey = meta.sourceKey || (meta.kind === "bundled" ? sourceKeyForBundled(meta.url) : `upload:${hash}`);
  const storedMeta = {
    ...meta,
    hash,
    sourceKey,
    size: bytes.byteLength,
  };
  await storeSet(SOURCE_STORE, sourceKey, {
    bytes,
    meta: storedMeta,
    storedAt: new Date().toISOString(),
  });
  await storeSet(SOURCE_STORE, LAST_SOURCE_KEY, { sourceKey });
  return storedMeta;
}

async function fetchArchive(url) {
  let response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(`Cannot fetch ${url}. The remote server may not allow browser downloads from this site. Download it locally to www/data/gtfs.zip and use "Download GTFS from server".`);
  }
  if (!response.ok) {
    throw new Error(`Cannot fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    meta: {
      kind: "bundled",
      url,
      sourceKey: sourceKeyForBundled(url),
      size: buffer.byteLength,
      lastModified: response.headers.get("last-modified") || "",
    },
  };
}

async function buildOrLoadContext(config) {
  if (!archiveBytes || !sourceMeta) {
    throw new Error("Load a GTFS archive first.");
  }
  const key = await cacheKey(archiveBytes, sourceMeta, config);
  post("progress", { message: "Checking browser cache...", progress: 5 });
  const cached = await storeGet(CONTEXT_STORE, key);
  if (cached) {
    activeContext = cached;
    activeConfig = config;
    sourceMeta = await storeSource(archiveBytes, sourceMeta);
    post("ready", { context: activeContext, cached: true, source: sourceMeta });
    return;
  }

  post("progress", { message: "Parsing GTFS and building route context...", progress: 35 });
  activeContext = build_context(archiveBytes, buildConfigForCore(config));
  activeConfig = config;
  post("progress", { message: "Writing browser cache...", progress: 90 });
  await storeSet(CONTEXT_STORE, key, activeContext);
  sourceMeta = await storeSource(archiveBytes, sourceMeta);
  post("ready", { context: activeContext, cached: false, source: sourceMeta });
}

function computeRoutes(day, overrides = {}) {
  if (!activeContext || !activeConfig) {
    throw new Error("Route context is not ready.");
  }
  const config = { ...activeConfig, ...overrides };
  const request = {
    selected_day: day || null,
    min_transfer_minutes: config.min_transfer_minutes,
    max_transfer_minutes: config.max_transfer_minutes,
    max_transfer_count: config.max_transfer_count,
    max_journey_duration_minutes: config.max_journey_duration_minutes,
  };
  return routes_for_day(activeContext, request);
}

self.onmessage = async (event) => {
  const { type } = event.data;
  try {
    await ensureWasm();
    if (type === "load-last-source") {
      post("progress", { message: "Checking browser storage for a saved GTFS archive...", progress: 5 });
      const stored = await loadLastStoredSource();
      if (!stored) {
        post("no-source");
        return;
      }
      archiveBytes = stored.bytes;
      sourceMeta = stored.meta;
      post("progress", { message: "Loading saved GTFS archive from browser storage...", progress: 12 });
      await buildOrLoadContext(normalizedConfig(event.data.config));
      return;
    }
    if (type === "load-bundled") {
      const stored = await loadStoredSource(sourceKeyForBundled(event.data.url));
      const loaded = stored || await (async () => {
        post("progress", { message: "Downloading bundled GTFS archive...", progress: 10 });
        return fetchArchive(event.data.url);
      })();
      if (stored) {
        post("progress", { message: "Loading bundled GTFS archive from browser storage...", progress: 10 });
      }
      archiveBytes = loaded.bytes;
      sourceMeta = loaded.meta;
      await buildOrLoadContext(normalizedConfig(event.data.config));
      return;
    }
    if (type === "load-upload") {
      post("progress", { message: "Reading uploaded GTFS archive...", progress: 10 });
      archiveBytes = new Uint8Array(event.data.buffer);
      sourceMeta = {
        kind: "upload",
        name: event.data.name,
        size: archiveBytes.byteLength,
        lastModified: event.data.lastModified || 0,
      };
      await buildOrLoadContext(normalizedConfig(event.data.config));
      return;
    }
    if (type === "apply-config") {
      await buildOrLoadContext(normalizedConfig(event.data.config));
      return;
    }
    if (type === "routes") {
      const result = computeRoutes(event.data.day, event.data.overrides || {});
      post("routes", { result });
      return;
    }
  } catch (error) {
    post("error", { message: error && error.message ? error.message : String(error) });
  }
};
