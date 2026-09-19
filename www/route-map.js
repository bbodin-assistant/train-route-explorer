import { app } from "./app.js?v=0.16";

const timeView = document.querySelector("#routes-time-chart");
const mapView = document.querySelector("#routes-map");
const viewTabs = document.querySelector("#route-view-tabs");
const directionTabs = document.querySelector("#route-direction-tabs");
const { state } = app;

const MAP_WIDTH = 920;
const MAP_HEIGHT = 620;
const MAP_PADDING = 34;
const MAP_BOUNDS = {
  minLon: -5.8,
  maxLon: 10.2,
  minLat: 41.0,
  maxLat: 51.6,
};

const TRAIN_TYPE_COLORS = {
  "TGV INOUI": "#2563eb",
  "OUIGO Grande Vitesse": "#c026d3",
  "OUIGO Train Classique": "#7c3aed",
  "INTERCITÉS": "#ea580c",
  "INTERCITÉS de nuit": "#9333ea",
  "TGV Lyria": "#dc2626",
  "ICE / DB\u2013SNCF": "#0891b2",
  "TER": "#2f855a",
  "Tram-train": "#0f766e",
  "Shuttle": "#a16207",
  "Unknown": "#64748b",
};

const FRANCE_MAINLAND = [
  [-4.8, 48.5], [-4.5, 48.1], [-3.5, 47.7], [-2.6, 47.5], [-2.1, 46.8],
  [-1.2, 46.2], [-1.1, 45.6], [-1.3, 44.7], [-1.7, 43.5], [-1.4, 43.3],
  [-0.7, 43.3], [0.4, 42.7], [1.7, 42.6], [3.1, 42.5], [3.3, 43.0],
  [4.4, 43.4], [5.6, 43.1], [6.3, 43.1], [7.5, 43.7], [7.1, 44.4],
  [6.7, 45.0], [6.8, 45.8], [7.0, 46.5], [6.1, 46.4], [6.0, 47.0],
  [7.6, 47.6], [7.6, 48.5], [7.0, 49.1], [6.3, 49.5], [5.8, 49.5],
  [4.8, 49.9], [3.8, 50.3], [2.5, 50.9], [1.6, 50.9], [1.3, 50.1],
  [0.2, 49.5], [-1.5, 49.7], [-1.9, 49.1], [-1.6, 48.7], [-2.7, 48.8],
  [-3.7, 48.7], [-4.8, 48.5],
];

const FRANCE_CORSICA = [
  [8.55, 42.95], [9.35, 42.95], [9.5, 42.45], [9.35, 41.85],
  [9.15, 41.35], [8.75, 41.45], [8.6, 42.05], [8.55, 42.95],
];

const mapStyle = document.createElement("style");
mapStyle.textContent = `
  .route-map-view {
    position: relative;
    height: calc(100vh - var(--header-height) - var(--toolbar-primary-height) - var(--route-summary-height) - 18px);
    min-height: calc(100vh - var(--header-height) - var(--toolbar-primary-height) - var(--route-summary-height) - 18px);
    overflow: hidden;
    background: #eef1ec;
  }

  .route-map-empty {
    min-height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
    color: #727c84;
    font-size: 13px;
    text-align: center;
  }

  .route-map-canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 430px;
  }

  .route-map-country {
    fill: #fffef9;
    stroke: #aeb8b1;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .route-map-route {
    fill: none;
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.34;
    vector-effect: non-scaling-stroke;
  }

  .route-map-station circle {
    fill: #fffef9;
    stroke: #42515d;
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
  }

  .route-map-station.search-station circle {
    r: 5.2;
    stroke-width: 2.2;
  }

  .route-map-station.departure circle { fill: #dbeafe; stroke: #2563eb; }
  .route-map-station.via circle { fill: #fff2bf; stroke: #a16207; }
  .route-map-station.arrival circle { fill: #dcfce7; stroke: #15803d; }

  .route-map-station text {
    fill: #26313a;
    font-size: 10px;
    font-weight: 800;
    paint-order: stroke;
    stroke: #fffef9;
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .route-map-summary {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px 12px;
    max-width: calc(100% - 24px);
    padding: 8px 10px;
    border: 1px solid #c6ccc7;
    background: rgba(255, 254, 249, 0.92);
    box-shadow: 0 3px 12px rgba(24, 32, 42, 0.08);
    color: #66717a;
    font-size: 10px;
    font-weight: 700;
    backdrop-filter: blur(7px);
  }

  .route-map-summary strong {
    color: #28343e;
    font-size: 11px;
  }

  .route-map-legend {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 10px;
  }

  .route-map-legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .route-map-legend i {
    width: 8px;
    height: 8px;
    border: 2px solid currentColor;
    border-radius: 50%;
    background: #fffef9;
  }

  .route-map-legend .departure { color: #2563eb; }
  .route-map-legend .via { color: #a16207; }
  .route-map-legend .arrival { color: #15803d; }

  @media (max-width: 900px) {
    .route-map-view {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    .route-map-canvas {
      min-height: 100%;
    }
  }
`;
document.head.append(mapStyle);

let viewMode = "time";
let renderFrame = null;

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function project(lon, lat) {
  const usableWidth = MAP_WIDTH - MAP_PADDING * 2;
  const usableHeight = MAP_HEIGHT - MAP_PADDING * 2;
  const x = MAP_PADDING + ((lon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) * usableWidth;
  const y = MAP_PADDING + ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * usableHeight;
  return { x, y };
}

function countryPath(points) {
  return points.map(([lon, lat], index) => {
    const point = project(lon, lat);
    return `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function stopPoint(stop) {
  const lat = Number(stop?.lat);
  const lon = Number(stop?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name: String(stop?.stop_name || "—"),
    lat,
    lon,
  };
}

function pointsForLeg(leg) {
  const direct = Array.isArray(leg?.path) ? leg.path : [];
  const journey = Array.isArray(leg?.journey_path)
    ? leg.journey_path.filter((stop) => stop?.in_segment !== false)
    : [];
  const source = direct.length ? direct : journey;
  const points = [];

  for (const stop of source) {
    const point = stopPoint(stop);
    if (!point) continue;
    const previous = points.at(-1);
    if (previous && previous.name === point.name && previous.lat === point.lat && previous.lon === point.lon) continue;
    points.push(point);
  }
  return points;
}

function activeItineraries() {
  return state.selectedTab === "back"
    ? (state.routes?.returns || [])
    : (state.routes?.outward || []);
}

function stationRole(name) {
  const departureNames = state.selectedTab === "back"
    ? state.config.side_b_destinations
    : state.config.local_origins;
  const arrivalNames = state.selectedTab === "back"
    ? state.config.local_origins
    : state.config.side_b_destinations;

  if (departureNames.includes(name)) return "departure";
  if (arrivalNames.includes(name)) return "arrival";
  if (state.config.connection_stations.includes(name)) return "via";
  return "";
}

function trainColor(type, fallbackIndex) {
  if (TRAIN_TYPE_COLORS[type]) return TRAIN_TYPE_COLORS[type];
  return `hsl(${Math.round((fallbackIndex * 137.508) % 360)} 62% 39%)`;
}

function renderMap() {
  if (!mapView || viewMode !== "map") return;

  const itineraries = activeItineraries();
  if (!itineraries.length) {
    mapView.innerHTML = '<div class="route-map-empty">No matching routes to display on the map.</div>';
    return;
  }

  const stations = new Map();
  const routeSegments = [];
  let fallbackColorIndex = 0;

  for (const itinerary of itineraries) {
    for (const leg of itinerary.legs || []) {
      const points = pointsForLeg(leg);
      if (points.length < 1) continue;
      for (const point of points) {
        if (!stations.has(point.name)) stations.set(point.name, point);
      }
      if (points.length > 1) {
        routeSegments.push({
          points,
          color: trainColor(String(leg.train_type || "Unknown"), fallbackColorIndex++),
        });
      }
    }
  }

  if (!stations.size) {
    mapView.innerHTML = '<div class="route-map-empty">The returned routes do not contain station coordinates.</div>';
    return;
  }

  const routesHtml = routeSegments.map(({ points, color }) => {
    const d = points.map((point, index) => {
      const projected = project(point.lon, point.lat);
      return `${index ? "L" : "M"}${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
    }).join(" ");
    return `<path class="route-map-route" d="${d}" stroke="${escapeText(color)}" />`;
  }).join("");

  const stationHtml = Array.from(stations.values(), (station) => {
    const point = project(station.lon, station.lat);
    const role = stationRole(station.name);
    const className = role ? `route-map-station search-station ${role}` : "route-map-station";
    const anchor = point.x > MAP_WIDTH * 0.7 ? "end" : "start";
    const labelX = anchor === "end" ? -8 : 8;
    const label = role
      ? `<text x="${labelX}" y="-7" text-anchor="${anchor}">${escapeText(station.name)}</text>`
      : "";
    return `
      <g class="${className}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
        <circle r="${role ? 5.2 : 2.7}"><title>${escapeText(station.name)}</title></circle>
        ${label}
      </g>
    `;
  }).join("");

  const directionLabel = state.selectedTab === "back" ? "Arrival \u2192 Departure" : "Departure \u2192 Arrival";
  mapView.innerHTML = `
    <div class="route-map-summary">
      <strong>${escapeText(directionLabel)}</strong>
      <span>${itineraries.length} route${itineraries.length === 1 ? "" : "s"} · ${stations.size} station${stations.size === 1 ? "" : "s"}</span>
      <span class="route-map-legend" aria-label="Search station roles">
        <span class="departure"><i aria-hidden="true"></i>Departure</span>
        <span class="via"><i aria-hidden="true"></i>Via</span>
        <span class="arrival"><i aria-hidden="true"></i>Arrival</span>
      </span>
    </div>
    <svg class="route-map-canvas" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="Map of France showing stations and proposed train routes" preserveAspectRatio="xMidYMid meet">
      <path class="route-map-country" d="${countryPath(FRANCE_MAINLAND)}" />
      <path class="route-map-country" d="${countryPath(FRANCE_CORSICA)}" />
      <g class="route-map-routes">${routesHtml}</g>
      <g class="route-map-stations">${stationHtml}</g>
    </svg>
  `;
}

function scheduleRender() {
  if (renderFrame !== null || viewMode !== "map") return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    renderMap();
  });
}

function setViewMode(mode) {
  viewMode = mode === "map" ? "map" : "time";
  for (const button of viewTabs?.querySelectorAll("[data-view]") || []) {
    const selected = button.dataset.view === viewMode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (timeView) timeView.hidden = viewMode === "map";
  if (mapView) mapView.hidden = viewMode !== "map";
  if (viewMode === "map") renderMap();
}

viewTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setViewMode(button.dataset.view);
});

directionTabs?.addEventListener("click", () => requestAnimationFrame(scheduleRender));

if (timeView) {
  new MutationObserver(scheduleRender).observe(timeView, { childList: true, subtree: true });
}

setViewMode("time");
