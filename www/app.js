import { createTimeline } from "./timeline.js";
import { routeConfigSummary, routeDebug } from "./route-debug.js";

const DEFAULT_CONFIG = {
  local_origins: ["Saujon", "Saintes"],
  connection_stations: ["Bordeaux Saint-Jean", "Poitiers", "Angoulême"],
  side_b_destinations: [
    "Paris Montparnasse Hall 1 - 2",
    "Massy TGV",
    "Paris Est",
    "Paris Gare du Nord",
    "Paris Saint-Lazare",
    "Paris Montparnasse Vaugirard",
    "Paris Austerlitz",
    "Paris Gare de Lyon Hall 1 - 2",
  ],
  train_types: [],
  min_transfer_minutes: 10,
  max_transfer_minutes: 120,
  max_transfer_count: 2,
  max_journey_duration_minutes: 1440,
};
const SERVER_GTFS_URL = "./data/gtfs.zip";
const SETTINGS_STORAGE_KEY = "train-route-explorer-settings-v1";
const AUTO_REFRESH_DELAY_MS = 300;
const ROUTE_DAY_COUNT = 1;
const ROUTE_PROTOCOL_VERSION = 5;
const TRAIN_TYPE_COLORS = {
  "TGV INOUI": "#2563eb",
  "OUIGO Grande Vitesse": "#c026d3",
  "OUIGO Train Classique": "#7c3aed",
  "INTERCITÉS": "#ea580c",
  "INTERCITÉS de nuit": "#9333ea",
  "TGV Lyria": "#dc2626",
  "ICE / DB–SNCF": "#0891b2",
  "TER": "#2f855a",
  "Tram-train": "#0f766e",
  "Shuttle": "#a16207",
  "Unknown": "#64748b",
};

function listSetting(value, fallback = []) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).sort() : [...fallback];
}

function numericSetting(value, fallback, min = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, number) : fallback;
}

function normalizeStoredConfig(config = {}) {
  const minTransfer = numericSetting(config.min_transfer_minutes, DEFAULT_CONFIG.min_transfer_minutes);
  const maxTransfer = numericSetting(config.max_transfer_minutes, DEFAULT_CONFIG.max_transfer_minutes, minTransfer);
  return {
    local_origins: listSetting(config.local_origins, DEFAULT_CONFIG.local_origins),
    connection_stations: listSetting(config.connection_stations, DEFAULT_CONFIG.connection_stations),
    side_b_destinations: listSetting(config.side_b_destinations, DEFAULT_CONFIG.side_b_destinations),
    train_types: listSetting(config.train_types, DEFAULT_CONFIG.train_types),
    min_transfer_minutes: minTransfer,
    max_transfer_minutes: Math.max(minTransfer, maxTransfer),
    max_transfer_count: numericSetting(config.max_transfer_count, DEFAULT_CONFIG.max_transfer_count),
    max_journey_duration_minutes: numericSetting(config.max_journey_duration_minutes, DEFAULT_CONFIG.max_journey_duration_minutes),
  };
}

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { found: false, config: structuredClone(DEFAULT_CONFIG) };
    const saved = JSON.parse(raw);
    return {
      found: true,
      config: normalizeStoredConfig(saved.config),
      selectedTab: saved.selectedTab === "back" ? "back" : "out",
      selectedDay: String(saved.selectedDay || "") || null,
      highlights: listSetting(saved.highlights),
    };
  } catch (error) {
    return { found: false, config: structuredClone(DEFAULT_CONFIG) };
  }
}

const storedSettings = loadStoredSettings();

const state = {
  config: storedSettings.config,
  context: null,
  routes: { outward: [], returns: [], selected_day: null },
  selectedTab: storedSettings.selectedTab || "out",
  highlights: storedSettings.highlights || [],
  highlightsInitialized: storedSettings.found,
  availableDays: [],
  selectedDay: storedSettings.selectedDay || null,
  settingsDirty: false,
  refreshInFlight: false,
  routeRequestInFlight: false,
  routeRequestId: 0,
  routeRequestMode: "replace",
  routeRequestBaseRoutes: null,
  refreshTimer: null,
};

const worker = new Worker(`./worker.js?route-protocol=${ROUTE_PROTOCOL_VERSION}`, { type: "module" });

const $ = (selector) => document.querySelector(selector);

const els = {
  status: $("#cache-status"),
  statusText: $("#cache-status-text"),
  progress: $("#cache-progress"),
  bundledBtn: $("#load-bundled"),
  uploadInput: $("#gtfs-upload"),
  uploadBtn: $("#load-upload"),
  localOrigins: $("#config-local-origins"),
  connectionStations: $("#config-connection-stations"),
  sideBDestinations: $("#config-side-b-destinations"),
  stationFilters: Array.from(document.querySelectorAll(".station-filter")),
  trainTypeFilter: $("#train-type-filter"),
  trainTypes: $("#config-train-types"),
  minTransfer: $("#config-min-transfer"),
  maxTransfer: $("#config-max-transfer"),
  maxTransferCount: $("#config-max-transfer-count"),
  maxDuration: $("#config-max-duration"),
  dayCalendar: $("#day-calendar"),
  previousDayBtn: $("#previous-day-button"),
  todayBtn: $("#today-button"),
  nextDayBtn: $("#next-day-button"),
  tabs: $("#route-direction-tabs"),
  timeline: $("#routes-time-chart"),
  detailLayer: $("#train-detail-dismiss-layer"),
  detailFrame: $("#train-detail-frame"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function minutesToDuration(minutes) {
  const value = Number(minutes || 0);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}m`;
}

function clockLabel(minute) {
  const hours = Math.floor(minute / 60) % 24;
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function readConfig() {
  const minTransfer = Math.max(0, Number(els.minTransfer.value || 0));
  const maxTransfer = Math.max(minTransfer, Number(els.maxTransfer.value || minTransfer));
  return {
    local_origins: state.config.local_origins,
    connection_stations: state.config.connection_stations,
    side_b_destinations: state.config.side_b_destinations,
    train_types: state.config.train_types,
    min_transfer_minutes: minTransfer,
    max_transfer_minutes: maxTransfer,
    max_transfer_count: Math.max(0, Number(els.maxTransferCount.value || 0)),
    max_journey_duration_minutes: Math.max(0, Number(els.maxDuration.value || 0)),
  };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      config: state.config,
      selectedTab: state.selectedTab,
      selectedDay: state.selectedDay,
      highlights: state.highlights,
    }));
  } catch (error) {
    // Browser storage can be full or disabled; the app should still work for the current session.
  }
}

function writeConfig(config) {
  renderStationPickers([], config);
  els.minTransfer.value = config.min_transfer_minutes;
  els.maxTransfer.value = config.max_transfer_minutes;
  els.maxTransferCount.value = config.max_transfer_count;
  els.maxDuration.value = config.max_journey_duration_minutes;
}

function setStatus(message, progress = 0, tone = "loading") {
  els.status.className = `status ${tone}`;
  els.statusText.textContent = message;
  els.progress.value = String(progress);
}

function setBusy(isBusy) {
  els.bundledBtn.disabled = isBusy;
  els.uploadBtn.disabled = isBusy;
  const dateUnavailable = isBusy || !state.context;
  els.dayCalendar.disabled = dateUnavailable;
  els.todayBtn.disabled = dateUnavailable;
  const selectedIndex = state.availableDays.indexOf(state.selectedDay);
  els.previousDayBtn.disabled = dateUnavailable || selectedIndex <= 0;
  els.nextDayBtn.disabled = dateUnavailable || selectedIndex < 0 || selectedIndex >= state.availableDays.length - 1;
}

function gtfsToIsoDate(day) {
  const text = String(day || "");
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : "";
}

function isoToGtfsDate(day) {
  return String(day || "").replaceAll("-", "");
}

function stationContainer(role) {
  if (role === "local_origins") return els.localOrigins;
  if (role === "connection_stations") return els.connectionStations;
  return els.sideBDestinations;
}

function selectedSet(config, role) {
  return new Set(config?.[role] || state.config[role] || []);
}

function sortedFilteredOptions(options, selected, filterText = "") {
  const normalizedFilter = filterText.trim().toLowerCase();
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return [...new Set(options)]
    .filter((option) => !normalizedFilter || option.toLowerCase().includes(normalizedFilter))
    .sort((left, right) => {
      const leftSelected = selected.has(left);
      const rightSelected = selected.has(right);
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
      return collator.compare(left, right);
    });
}

function renderCheckboxList(container, options, selected, filterText, showHighlightStars = false) {
  const visibleOptions = sortedFilteredOptions(options, selected, filterText);
  container.innerHTML = visibleOptions.map((option) => {
    const checked = selected.has(option) ? "checked" : "";
    const highlighted = state.highlights.includes(option);
    const star = showHighlightStars
      ? `<button class="highlight-star" type="button" data-highlight-station="${escapeHtml(option)}" aria-pressed="${highlighted}" aria-label="${highlighted ? "Remove highlight from" : "Highlight"} ${escapeHtml(option)}" title="${highlighted ? "Remove highlight" : "Highlight station"}">★</button>`
      : "";
    return `
      <div class="station-choice">
        <label class="station-choice-toggle" title="${escapeHtml(option)}">
          <input type="checkbox" value="${escapeHtml(option)}" ${checked} />
          <span>${escapeHtml(option)}</span>
        </label>
        ${star}
      </div>
    `;
  }).join("");
}

function renderStationPicker(role, stations, config, filterText = "") {
  const container = stationContainer(role);
  const selected = selectedSet(config, role);
  renderCheckboxList(container, stations.length ? stations : Array.from(selected), selected, filterText, true);
}

function renderStationPickers(stations, config = state.config) {
  for (const role of ["local_origins", "connection_stations", "side_b_destinations"]) {
    const filter = document.querySelector(`.station-filter[data-role="${role}"]`);
    renderStationPicker(role, stations, config, filter?.value || "");
  }
}

function syncStationState(role, input) {
  const selected = new Set(state.config[role] || []);
  if (input.checked) {
    selected.add(input.value);
  } else {
    selected.delete(input.value);
  }
  state.config[role] = Array.from(selected).sort();
}

function syncSetValue(values, input) {
  const selected = new Set(values);
  if (input.checked) {
    selected.add(input.value);
  } else {
    selected.delete(input.value);
  }
  return Array.from(selected).sort();
}

function renderTrainTypePicker(types, filterText = "") {
  renderCheckboxList(els.trainTypes, types, new Set(state.config.train_types), filterText);
}

function stationGroupLabel(stations) {
  const values = stations.filter(Boolean);
  if (values.length <= 2) return values.join("/");
  return `${values[0]}/${values[1]} +${values.length - 2}`;
}

function directionLabels() {
  const departure = stationGroupLabel(state.config.local_origins);
  const arrival = stationGroupLabel(state.config.side_b_destinations);
  return {
    out: `${departure} to ${arrival}`,
    back: `${arrival} to ${departure}`,
  };
}

function todayGtfsDate() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function defaultDay(days) {
  if (!days.length) return "";
  const today = todayGtfsDate();
  return days.includes(today) ? today : days[0];
}

function populateContextControls(context) {
  state.availableDays = Array.from(new Set((context.available_days || []).map(String))).sort();
  state.selectedDay = state.availableDays.includes(state.selectedDay) ? state.selectedDay : defaultDay(state.availableDays);
  routeDebug("app", "context controls populated", {
    availableDayCount: state.availableDays.length,
    firstAvailableDay: state.availableDays[0] || null,
    lastAvailableDay: state.availableDays.at(-1) || null,
    selectedDay: state.selectedDay,
  });
  els.dayCalendar.min = gtfsToIsoDate(context.available_days[0] || "");
  els.dayCalendar.max = gtfsToIsoDate(context.available_days[context.available_days.length - 1] || "");
  els.dayCalendar.value = gtfsToIsoDate(state.selectedDay);
  els.dayCalendar.title = context.available_days.length
    ? `Available service days: ${context.available_days.map(gtfsToIsoDate).join(", ")}`
    : "No available service days";

  const availableTypes = new Set(context.train_types || []);
  const storedTypesAreCurrent = state.config.train_types.length
    && state.config.train_types.every((type) => availableTypes.has(type));
  const selectedTypes = new Set(storedTypesAreCurrent ? state.config.train_types : context.train_types);
  state.config.train_types = Array.from(selectedTypes).sort();
  if (!state.highlightsInitialized) {
    if (state.config.local_origins.length) {
      state.highlights = [state.config.local_origins[0]];
    }
    state.highlightsInitialized = true;
  }
  const availableStations = new Set(context.station_names || []);
  state.highlights = state.highlights.filter((station) => availableStations.has(station));
  renderTrainTypePicker(context.train_types || [], els.trainTypeFilter.value);
  renderStationPickers(context.station_names || [], state.config);
  saveSettings();
}

function visibleRouteDays(startOffset = 0, count = ROUTE_DAY_COUNT) {
  if (!state.availableDays.includes(state.selectedDay)) return [];
  const match = state.selectedDay.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return [];
  const selected = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Array.from({ length: count }, (_, offset) => {
    const day = new Date(selected);
    day.setDate(day.getDate() + startOffset + offset);
    return `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
  });
}

function requestRoutes(preserveTimeline = false) {
  if (!state.context) return;
  state.routeRequestInFlight = true;
  state.routeRequestMode = "replace";
  state.routeRequestBaseRoutes = null;
  state.routeRequestId += 1;
  const requestId = state.routeRequestId;
  const days = visibleRouteDays();
  const overrides = readConfig();
  routeDebug("app", "route request posted", {
    requestId,
    selectedDay: state.selectedDay,
    days,
    preserveTimeline,
    config: routeConfigSummary(overrides),
  });
  for (const delay of [10_000, 30_000, 120_000]) {
    window.setTimeout(() => {
      if (state.routeRequestInFlight && state.routeRequestId === requestId) {
        routeDebug("app", "route request still running", { requestId, elapsedMs: delay, days });
      }
    }, delay);
  }
  setBusy(true);
  if (!preserveTimeline) {
    setTimelinePlaceholder("Loading selected days...");
  }
  worker.postMessage({
    type: "routes",
    protocolVersion: ROUTE_PROTOCOL_VERSION,
    requestId,
    selectedDay: state.selectedDay,
    days,
    overrides,
  });
}

const {
  renderCurrentTab,
  renderRefreshNotice,
  renderRoutes,
  scheduleRouteRefresh,
  setTimelinePlaceholder,
  showRefreshNotice,
} = createTimeline({
  AUTO_REFRESH_DELAY_MS,
  TRAIN_TYPE_COLORS,
  clockLabel,
  els,
  escapeHtml,
  minutesToDuration,
  readConfig,
  saveSettings,
  setBusy,
  state,
  worker,
});
function syncSelectedTabButtons() {
  for (const button of els.tabs.querySelectorAll("[data-tab]")) {
    button.classList.toggle("selected", button.dataset.tab === state.selectedTab);
  }
}

function showDetail(leg, event) {
  const stops = leg.journey_path || leg.path || [];
  const train = leg.train_number ? `${leg.train_type} ${leg.train_number}` : leg.train_type;
  const corridor = leg.route_name
    ? `<div class="detail-route">Corridor: ${escapeHtml(leg.route_name)}</div>`
    : "";
  els.detailFrame.innerHTML = `
    <div class="detail-title">${escapeHtml(train)} | ${escapeHtml(leg.departure_stop)} ${escapeHtml(leg.departure_time)} -> ${escapeHtml(leg.destination_stop)} ${escapeHtml(leg.arrival_time)}</div>
    ${corridor}
    <div class="detail-stops">
      ${stops.map((stop) => {
        const time = stop.arrival_time && stop.departure_time && stop.arrival_time !== stop.departure_time
          ? `${stop.arrival_time} / ${stop.departure_time}`
          : (stop.departure_time || stop.arrival_time);
        return `<div class="detail-stop ${stop.in_segment ? "active" : "context"}"><span>${escapeHtml(time)}</span><i></i><strong>${escapeHtml(stop.stop_name)}</strong></div>`;
      }).join("")}
    </div>
  `;
  els.detailFrame.hidden = false;
  els.detailLayer.hidden = false;
  const rect = event.target.getBoundingClientRect();
  els.detailFrame.style.left = `${Math.min(Math.max(16, rect.left + 18), window.innerWidth - 420)}px`;
  els.detailFrame.style.top = `${Math.max(16, rect.top + window.scrollY + 34)}px`;
}

function hideDetail() {
  els.detailFrame.hidden = true;
  els.detailLayer.hidden = true;
}

export const app = {
  ROUTE_PROTOCOL_VERSION,
  SERVER_GTFS_URL,
  els,
  gtfsToIsoDate,
  hideDetail,
  isoToGtfsDate,
  populateContextControls,
  readConfig,
  routeDebug,
  renderCurrentTab,
  renderRefreshNotice,
  renderRoutes,
  renderStationPicker,
  renderStationPickers,
  renderTrainTypePicker,
  requestRoutes,
  saveSettings,
  scheduleRouteRefresh,
  setBusy,
  setStatus,
  setTimelinePlaceholder,
  showDetail,
  showRefreshNotice,
  state,
  syncSelectedTabButtons,
  syncSetValue,
  syncStationState,
  todayGtfsDate,
  visibleRouteDays,
  worker,
  writeConfig,
};

import("./app-events.js");
