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
  refreshTimer: null,
};

const worker = new Worker("./worker.js", { type: "module" });

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
  todayBtn: $("#today-button"),
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
  for (const element of [
    els.bundledBtn,
    els.uploadBtn,
    els.dayCalendar,
    els.todayBtn,
  ]) {
    element.disabled = isBusy || ([els.dayCalendar, els.todayBtn].includes(element) && !state.context);
  }
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
  state.availableDays = context.available_days || [];
  state.selectedDay = state.availableDays.includes(state.selectedDay) ? state.selectedDay : defaultDay(state.availableDays);
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

function requestRoutes(preserveTimeline = false) {
  if (!state.context) return;
  state.routeRequestInFlight = true;
  setBusy(true);
  if (!preserveTimeline) {
    setTimelinePlaceholder("Loading selected day...");
  }
  worker.postMessage({
    type: "routes",
    day: state.selectedDay || null,
    overrides: readConfig(),
  });
}

function routeStations(itinerary) {
  const stations = new Set([itinerary.departure_stop, itinerary.destination_stop]);
  for (const leg of itinerary.legs || []) {
    stations.add(leg.departure_stop);
    stations.add(leg.destination_stop);
    for (const point of leg.path || []) stations.add(point.stop_name);
  }
  return stations;
}

function timelineLabel(itinerary, medianDuration) {
  const names = [itinerary.departure_stop, ...(itinerary.legs || []).map((leg) => leg.destination_stop)];
  const duration = minutesToDuration(itinerary.total_duration_minutes);
  const durationMinutes = Number(itinerary.total_duration_minutes || 0);
  const durationColor = durationMinutes < medianDuration
    ? "#15803d"
    : durationMinutes > medianDuration
      ? "#b91c1c"
      : "#a16207";
  const highlights = new Set(state.highlights);
  const stations = routeStations(itinerary);
  const matched = highlights.size > 0 && Array.from(highlights).every((station) => stations.has(station));
  const hasStarredStation = highlights.size > 0 && Array.from(highlights).some((station) => stations.has(station));
  const via = names.slice(1, -1);
  return `
    <span class="timeline-label-main${matched ? " highlighted" : ""}">
      <span class="timeline-label-time">${clockLabel(itinerary.departure_minutes)}</span>
      <span class="timeline-label-route"${hasStarredStation ? ' style="font-weight:800"' : ""}>${escapeHtml(names[0])} → ${escapeHtml(names.at(-1))}</span>
      <span class="timeline-label-duration" style="color:${durationColor}">(<strong>${escapeHtml(duration)}</strong>)</span>
    </span>
    ${via.length ? `<span class="timeline-label-via">via ${via.map(escapeHtml).join(", ")}</span>` : ""}
  `;
}

function medianTripDuration(itineraries) {
  const durations = itineraries
    .map((itinerary) => Number(itinerary.total_duration_minutes))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!durations.length) return 0;
  const middle = Math.floor(durations.length / 2);
  return durations.length % 2
    ? durations[middle]
    : (durations[middle - 1] + durations[middle]) / 2;
}

function trainTypeClass(type) {
  return String(type || "train").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function timelineTrainTypeColors(itineraries) {
  const colors = new Map();
  let fallbackIndex = 0;
  for (const itinerary of itineraries) {
    for (const leg of itinerary.legs || []) {
      const type = String(leg.train_type || "Unknown");
      if (colors.has(type)) continue;
      const color = TRAIN_TYPE_COLORS[type]
        || `hsl(${Math.round((fallbackIndex++ * 137.508) % 360)} 68% 40%)`;
      colors.set(type, color);
    }
  }
  return colors;
}

function timelineWindow(itineraries) {
  const legs = itineraries.flatMap((itinerary) => itinerary.legs || []);
  const earliestDeparture = Math.min(...legs.map((leg) => Number(leg.departure_minutes)));
  const start = Number.isFinite(earliestDeparture) && earliestDeparture >= 240 ? 240 : 0;
  const end = 1440;
  const ticks = [];
  for (let minute = start; minute <= end; minute += 120) {
    if (minute !== 1440) ticks.push(minute);
  }
  return { start, end, ticks };
}

function setTimelinePlaceholder(message) {
  els.timeline.innerHTML = `<div class="timeline-empty">${escapeHtml(message)}</div>`;
}

function renderRefreshNotice() {
  els.timeline.innerHTML = `
    <div class="timeline-empty refresh-notice" role="status" aria-live="polite">
      <span class="route-refresh-spinner" aria-hidden="true"></span>
      <span>Route settings changed. Refreshing routes automatically…</span>
    </div>
  `;
}

function showRefreshNotice() {
  state.config = readConfig();
  saveSettings();
  if (!state.context) return;
  state.settingsDirty = true;
  state.routes = { outward: [], returns: [], selected_day: state.selectedDay };
  renderRefreshNotice();
  scheduleRouteRefresh();
}

function scheduleRouteRefresh() {
  if (state.refreshTimer !== null) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }
  if (!state.context || state.refreshInFlight || state.routeRequestInFlight) return;
  state.refreshTimer = window.setTimeout(refreshRoutes, AUTO_REFRESH_DELAY_MS);
}

function refreshRoutes() {
  state.refreshTimer = null;
  if (!state.context || state.refreshInFlight || !state.settingsDirty) return;
  state.settingsDirty = false;
  state.refreshInFlight = true;
  state.config = readConfig();
  saveSettings();
  setBusy(true);
  worker.postMessage({ type: "apply-config", config: state.config });
}

function renderTimeline(itineraries) {
  if (!itineraries.length) {
    els.timeline.innerHTML = `<div class="timeline-empty">No matching connections for this day.</div>`;
    return;
  }
  const { start, end, ticks } = timelineWindow(itineraries);
  const chartDuration = end - start;
  const trainTypeColors = timelineTrainTypeColors(itineraries);
  const medianDuration = medianTripDuration(itineraries);
  const rows = itineraries.map((itinerary) => {
    const segments = [];
    itinerary.legs.forEach((leg, legIndex) => {
      segments.push({
        kind: "train",
        label: leg.train_number || "—",
        start: leg.departure_minutes,
        end: leg.arrival_minutes,
        trainType: leg.train_type || "Unknown",
        detail: leg,
      });
      if (itinerary.transfers[legIndex]) {
        const transfer = itinerary.transfers[legIndex];
        segments.push({
          kind: "transfer",
          label: minutesToDuration(transfer.wait_minutes),
          start: transfer.arrival_minutes,
          end: transfer.departure_minutes,
        });
      }
    });
    const bars = segments.map((segment) => {
      const left = ((segment.start - start) / chartDuration) * 100;
      const width = Math.max(0.3, ((segment.end - segment.start) / chartDuration) * 100);
      const detail = segment.detail ? encodeURIComponent(JSON.stringify(segment.detail)) : "";
      const trainColor = segment.trainType ? trainTypeColors.get(segment.trainType) : "";
      const colorStyle = trainColor ? `--train-color:${trainColor};` : "";
      const title = segment.trainType
        ? ` title="${escapeHtml(`${segment.trainType} ${segment.label}`)}"`
        : "";
      return `<button class="timeline-bar ${segment.kind} ${segment.trainType ? trainTypeClass(segment.trainType) : ""}" data-detail="${detail}"${title} style="${colorStyle}left:${left}%;width:${width}%">${escapeHtml(segment.label)}</button>`;
    }).join("");
    return `
      <div class="timeline-row">
        <div class="timeline-label">${timelineLabel(itinerary, medianDuration)}</div>
        <div class="timeline-lane">${bars}</div>
      </div>
    `;
  }).join("");
  const legend = Array.from(trainTypeColors, ([type, color]) => `
    <span class="timeline-legend-item"><i class="timeline-legend-swatch" style="background:${color}"></i>${escapeHtml(type)}</span>
  `).join("");
  const position = (minute) => ((minute - start) / chartDuration) * 100;
  els.timeline.innerHTML = `
    <div class="timeline-legend" aria-label="Train type color legend">${legend}</div>
    <div class="timeline-scale">${ticks.map((minute) => `<span style="left:${position(minute)}%">${clockLabel(minute)}</span>`).join("")}</div>
    <div class="timeline-grid">
      <div class="timeline-grid-lines" aria-hidden="true">${ticks.map((minute) => `<span style="left:${position(minute)}%"></span>`).join("")}</div>
      ${rows}
    </div>
  `;
}

function renderCurrentTab() {
  if (state.selectedTab === "back") {
    renderTimeline(state.routes.returns || []);
  } else {
    renderTimeline(state.routes.outward || []);
  }
}

function renderRoutes(result) {
  state.routes = result;
  renderCurrentTab();
}

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

worker.onmessage = (event) => {
  const { type } = event.data;
  if (type === "progress") {
    setBusy(true);
    setStatus(event.data.message, event.data.progress, "loading");
    return;
  }
  if (type === "ready") {
    state.context = event.data.context;
    populateContextControls(state.context);
    setStatus(`Cache ready${event.data.cached ? " from browser cache" : ""}. GTFS service dates: ${state.context.coverage.label}.`, 100, "ready");
    if (state.settingsDirty) {
      state.refreshInFlight = false;
      scheduleRouteRefresh();
      return;
    }
    requestRoutes(state.refreshInFlight);
    return;
  }
  if (type === "routes") {
    state.routeRequestInFlight = false;
    state.refreshInFlight = false;
    if (state.settingsDirty) {
      scheduleRouteRefresh();
      return;
    }
    renderRoutes(event.data.result);
    setBusy(false);
    return;
  }
  if (type === "no-source") {
    setTimelinePlaceholder("Load a GTFS archive to build routes.");
    setStatus("Waiting for GTFS archive.", 0, "idle");
    setBusy(false);
    return;
  }
  if (type === "error") {
    if (state.refreshTimer !== null) {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }
    state.refreshInFlight = false;
    state.routeRequestInFlight = false;
    state.settingsDirty = false;
    if (els.timeline.querySelector(".route-refresh-spinner")) {
      setTimelinePlaceholder("Unable to refresh routes. Check the error above.");
    }
    setStatus(event.data.message, 0, "error");
    setBusy(false);
  }
};

els.bundledBtn.addEventListener("click", () => {
  state.config = readConfig();
  saveSettings();
  setBusy(true);
  worker.postMessage({ type: "load-bundled", url: SERVER_GTFS_URL, config: state.config });
});

els.uploadBtn.addEventListener("click", async () => {
  const file = els.uploadInput.files[0];
  if (!file) {
    setStatus("Choose a GTFS zip file first.", 0, "error");
    return;
  }
  state.config = readConfig();
  saveSettings();
  setBusy(true);
  const buffer = await file.arrayBuffer();
  worker.postMessage(
    { type: "load-upload", buffer, name: file.name, lastModified: file.lastModified, config: state.config },
    [buffer],
  );
});

els.dayCalendar.addEventListener("change", () => {
  const selected = isoToGtfsDate(els.dayCalendar.value);
  if (!state.availableDays.includes(selected)) {
    setStatus("No service matching route settings for the selected calendar day.", 0, "error");
    els.dayCalendar.value = gtfsToIsoDate(state.selectedDay);
    return;
  }
  state.selectedDay = selected;
  saveSettings();
  if (state.settingsDirty) {
    showRefreshNotice();
    return;
  }
  requestRoutes();
});
els.todayBtn.addEventListener("click", () => {
  const today = todayGtfsDate();
  if (!state.availableDays.includes(today)) {
    setStatus("No service matching route settings is available today.", 0, "error");
    return;
  }
  els.dayCalendar.value = gtfsToIsoDate(today);
  els.dayCalendar.dispatchEvent(new Event("change", { bubbles: true }));
});
els.tabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  state.selectedTab = tab.dataset.tab;
  syncSelectedTabButtons();
  saveSettings();
  if (state.settingsDirty || state.refreshInFlight) {
    renderRefreshNotice();
  } else {
    renderCurrentTab();
  }
});
els.timeline.addEventListener("click", (event) => {
  const bar = event.target.closest(".timeline-bar.train");
  if (!bar || !bar.dataset.detail) return;
  showDetail(JSON.parse(decodeURIComponent(bar.dataset.detail)), event);
});
els.detailLayer.addEventListener("click", hideDetail);
for (const filter of els.stationFilters) {
  filter.addEventListener("input", () => {
    renderStationPicker(filter.dataset.role, state.context?.station_names || [], state.config, filter.value);
  });
}
els.trainTypeFilter.addEventListener("input", () => {
  renderTrainTypePicker(state.context?.train_types || [], els.trainTypeFilter.value);
});
els.trainTypes.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement) {
    state.config.train_types = syncSetValue(state.config.train_types, event.target);
    saveSettings();
    renderTrainTypePicker(state.context?.train_types || [], els.trainTypeFilter.value);
    showRefreshNotice();
  }
});
for (const [role, container] of [
  ["local_origins", els.localOrigins],
  ["connection_stations", els.connectionStations],
  ["side_b_destinations", els.sideBDestinations],
]) {
  container.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement) {
      syncStationState(role, event.target);
      saveSettings();
      renderStationPicker(role, state.context?.station_names || [], state.config, document.querySelector(`.station-filter[data-role="${role}"]`)?.value || "");
      showRefreshNotice();
    }
  });
  container.addEventListener("click", (event) => {
    const star = event.target.closest("[data-highlight-station]");
    if (!star) return;
    const station = star.dataset.highlightStation;
    const highlights = new Set(state.highlights);
    if (highlights.has(station)) {
      highlights.delete(station);
    } else {
      highlights.add(station);
    }
    state.highlights = Array.from(highlights).sort();
    saveSettings();
    renderStationPickers(state.context?.station_names || [], state.config);
    if (state.settingsDirty || state.refreshInFlight) {
      renderRefreshNotice();
    } else {
      renderCurrentTab();
    }
  });
}
for (const input of [els.minTransfer, els.maxTransfer, els.maxTransferCount, els.maxDuration]) {
  input.addEventListener("change", showRefreshNotice);
}

writeConfig(state.config);
syncSelectedTabButtons();
saveSettings();
setTimelinePlaceholder("Checking browser storage for a saved GTFS archive...");
setStatus("Checking browser storage for a saved GTFS archive.", 5, "loading");
setBusy(true);
worker.postMessage({ type: "load-last-source", config: state.config });