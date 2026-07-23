import init, { build_context, routes_for_day } from "./pkg/train_route_explorer.js";

const CACHE_DB = "train-route-explorer";
const CACHE_STORE = "contexts";
const CACHE_VERSION = "gtfs-context-v1";

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
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CACHE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cacheGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const request = tx.objectStore(CACHE_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function cacheSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put(value, key);
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

async function cacheKey(bytes, meta, config) {
  const sourceHash = meta.hash || await sha256(bytes);
  return JSON.stringify({
    version: CACHE_VERSION,
    source: { ...meta, hash: sourceHash },
    config: buildConfigForCore(config),
  });
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
  const cached = await cacheGet(key);
  if (cached) {
    activeContext = cached;
    activeConfig = config;
    post("ready", { context: activeContext, cached: true });
    return;
  }

  post("progress", { message: "Parsing GTFS and building route context...", progress: 35 });
  activeContext = build_context(archiveBytes, buildConfigForCore(config));
  activeConfig = config;
  post("progress", { message: "Writing browser cache...", progress: 90 });
  await cacheSet(key, activeContext);
  post("ready", { context: activeContext, cached: false });
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
    if (type === "load-bundled") {
      post("progress", { message: "Downloading bundled GTFS archive...", progress: 10 });
      const loaded = await fetchArchive(event.data.url);
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
