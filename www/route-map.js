import { app } from "./app.js?v=0.16";

const timeView = document.querySelector("#routes-time-chart");
const mapView = document.querySelector("#routes-map");
const viewTabs = document.querySelector("#route-view-tabs");
const directionTabs = document.querySelector("#route-direction-tabs");
const mapStyleControl = document.querySelector("#config-map-style");
const { state } = app;

const MAP_WIDTH = 920;
const MAP_HEIGHT = 620;
const MAP_PADDING = 34;
const MIN_MAP_ZOOM = 1;
const DESKTOP_WHEEL_ZOOM_SENSITIVITY = 0.004;
const DESKTOP_WHEEL_DELTA_LIMIT = 240;
const OSM_TILE_BASE_ZOOM = 6;
const OSM_TILE_MAX_ZOOM = 19;
const OSM_TILE_OVERSCAN = 2;
const OSM_TILE_URL = "https://tile.openstreetmap.org";
const LABEL_PADDING = 2;
const LABEL_SCREEN_FONT_SIZE = 13;
const LABEL_SCREEN_STROKE_WIDTH = 2.5;
const REGULAR_MARKER_SCREEN_RADIUS = 3.2;
const SEARCH_MARKER_SCREEN_RADIUS = 5.2;
const STATION_HIT_SCREEN_RADIUS = 13;
const MARKER_MAX_SCREEN_SCALE = 1.65;
const MARKER_GROWTH_PER_ZOOM_DOUBLING = 0.24;
const MAP_BOUNDS = {
  minLon: -5.8,
  maxLon: 10.2,
  minLat: 41.0,
  maxLat: 51.6,
};

const MAP_STYLE_VALUES = new Set(["standard", "muted", "monochrome", "dark"]);

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

  .route-map-tile {
    pointer-events: none;
    transition: filter 120ms ease, opacity 120ms ease;
  }

  .route-map-view[data-map-style="muted"] .route-map-tile {
    filter: saturate(0.55) contrast(0.94) brightness(1.04);
  }

  .route-map-view[data-map-style="monochrome"] .route-map-tile {
    filter: grayscale(1) contrast(0.96) brightness(1.05);
  }

  .route-map-view[data-map-style="dark"] {
    background: #1d252b;
  }

  .route-map-view[data-map-style="dark"] .route-map-tile {
    filter: invert(0.9) hue-rotate(180deg) saturate(0.55) brightness(0.72) contrast(0.95);
  }

  .route-map-route {
    fill: none;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.78;
    vector-effect: non-scaling-stroke;
    transition: opacity 140ms ease;
  }

  .route-map-route.dimmed {
    opacity: 0.22;
  }

  .route-map-station {
    cursor: pointer;
  }

  .route-map-station-marker {
    fill: #fffef9;
    stroke: #42515d;
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
  }

  .route-map-station-hit {
    fill: transparent;
    stroke: none;
    pointer-events: all;
  }

  .route-map-station.search-station .route-map-station-marker {
    r: 5.2;
    stroke-width: 2.2;
  }

  .route-map-station.departure .route-map-station-marker { fill: #dbeafe; stroke: #2563eb; }
  .route-map-station.via .route-map-station-marker { fill: #fff2bf; stroke: #a16207; }
  .route-map-station.arrival .route-map-station-marker { fill: #dcfce7; stroke: #15803d; }

  .route-map-station.highlighted .route-map-station-marker {
    stroke: #b7791f;
    stroke-width: 3;
  }

  .route-map-station.selected .route-map-station-marker {
    stroke-width: 3.4;
  }

  .route-map-station text {
    fill: #26313a;
    font-size: 10px;
    font-weight: 800;
    paint-order: stroke;
    stroke: #fffef9;
    stroke-width: 3px;
    stroke-linejoin: round;
    opacity: 0;
    pointer-events: none;
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

  .route-map-direction-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(260px, calc(100vw - 56px));
    padding: 2px;
    border: 1px solid #b7bec1;
    border-radius: 999px;
    background: #eef0ed;
  }

  .route-map-direction-switch button {
    min-height: 26px;
    border: 0;
    border-radius: 999px;
    padding: 3px 9px;
    background: transparent;
    color: #677078;
    font-size: 10px;
    font-weight: 750;
    line-height: 1.1;
    white-space: nowrap;
  }

  .route-map-direction-switch button:hover {
    background: rgba(255, 255, 255, 0.55);
  }

  .route-map-direction-switch button.selected {
    background: #1e2832;
    color: #fff;
  }

  #routes-map.station-card-open .route-map-direction-switch {
    display: none;
  }

  .route-map-station-card {
    position: absolute;
    right: 12px;
    bottom: 30px;
    z-index: 5;
    width: min(300px, calc(100% - 24px));
    padding: 11px;
    border: 1px solid #bfc7c4;
    border-radius: 8px;
    background: rgba(255, 254, 249, 0.97);
    box-shadow: 0 8px 28px rgba(24, 32, 42, 0.18);
    color: #39444d;
    backdrop-filter: blur(8px);
  }

  .route-map-station-card[hidden] {
    display: none;
  }

  .route-map-station-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .route-map-station-card h3 {
    margin: 0;
    color: #26313a;
    font-size: 14px;
    line-height: 1.25;
  }

  .route-map-station-card p {
    margin: 4px 0 10px;
    color: #727c84;
    font-size: 10px;
    font-weight: 700;
  }

  .route-map-station-card-close {
    min-width: 28px;
    min-height: 28px;
    border: 0;
    padding: 0;
    background: transparent;
    color: #69757d;
    font-size: 18px;
    line-height: 1;
  }

  .route-map-station-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .route-map-station-actions button {
    min-height: 34px;
    padding: 6px 8px;
    border: 1px solid #c7cdca;
    border-radius: 5px;
    background: #f7f7f3;
    color: #34414a;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.15;
  }

  .route-map-station-actions button:hover:not(:disabled) {
    border-color: #89958f;
    background: #fffef9;
  }

  .route-map-station-actions button:disabled {
    opacity: 0.46;
    cursor: default;
  }

  .route-map-attribution {
    position: absolute;
    right: 6px;
    bottom: 6px;
    z-index: 3;
    padding: 3px 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.88);
    color: #3f4b54;
    font-size: 9px;
    font-weight: 650;
    line-height: 1.2;
    text-decoration: none;
    backdrop-filter: blur(4px);
  }

  .route-map-attribution:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
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

  @media (min-width: 901px) {
    .route-map-canvas {
      cursor: grab;
    }

    .route-map-canvas[data-dragging="true"] {
      cursor: grabbing;
    }
  }

  @media (max-width: 900px) {
    .route-map-view {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    .route-map-canvas {
      min-height: 100%;
      touch-action: none;
      user-select: none;
    }

    .route-map-station-card {
      right: 10px;
      bottom: 26px;
      left: 10px;
      width: auto;
    }

    .route-map-station-actions button {
      min-height: 42px;
      font-size: 11px;
    }
  }
`;
document.head.append(mapStyle);

let viewMode = "time";
let renderFrame = null;
let labelLayoutFrame = null;
let tileRenderFrame = null;
let panFrame = null;
let pendingPan = null;
const activePointers = new Map();
let pinchGesture = null;
let selectedStationName = "";

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lonLatToWorld(lon, lat) {
  const clampedLat = clamp(Number(lat), -85.05112878, 85.05112878);
  const longitude = Number(lon);
  const latitudeRadians = clampedLat * Math.PI / 180;
  const sinLatitude = Math.sin(latitudeRadians);
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI),
  };
}

const MAP_WORLD_BOUNDS = (() => {
  const northWest = lonLatToWorld(MAP_BOUNDS.minLon, MAP_BOUNDS.maxLat);
  const southEast = lonLatToWorld(MAP_BOUNDS.maxLon, MAP_BOUNDS.minLat);
  return {
    minX: northWest.x,
    maxX: southEast.x,
    minY: northWest.y,
    maxY: southEast.y,
  };
})();

function projectWorld(worldX, worldY) {
  const usableWidth = MAP_WIDTH - MAP_PADDING * 2;
  const usableHeight = MAP_HEIGHT - MAP_PADDING * 2;
  return {
    x: MAP_PADDING
      + ((worldX - MAP_WORLD_BOUNDS.minX) / (MAP_WORLD_BOUNDS.maxX - MAP_WORLD_BOUNDS.minX)) * usableWidth,
    y: MAP_PADDING
      + ((worldY - MAP_WORLD_BOUNDS.minY) / (MAP_WORLD_BOUNDS.maxY - MAP_WORLD_BOUNDS.minY)) * usableHeight,
  };
}

function mapPointToWorld(x, y) {
  const usableWidth = MAP_WIDTH - MAP_PADDING * 2;
  const usableHeight = MAP_HEIGHT - MAP_PADDING * 2;
  return {
    x: MAP_WORLD_BOUNDS.minX
      + ((x - MAP_PADDING) / usableWidth) * (MAP_WORLD_BOUNDS.maxX - MAP_WORLD_BOUNDS.minX),
    y: MAP_WORLD_BOUNDS.minY
      + ((y - MAP_PADDING) / usableHeight) * (MAP_WORLD_BOUNDS.maxY - MAP_WORLD_BOUNDS.minY),
  };
}

function project(lon, lat) {
  const world = lonLatToWorld(lon, lat);
  return projectWorld(world.x, world.y);
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
  if (state.config.local_origins.includes(name)) return "departure";
  if (state.config.side_b_destinations.includes(name)) return "arrival";
  if (state.config.connection_stations.includes(name)) return "via";
  return "";
}

function trainColor(type, fallbackIndex) {
  if (TRAIN_TYPE_COLORS[type]) return TRAIN_TYPE_COLORS[type];
  return `hsl(${Math.round((fallbackIndex * 137.508) % 360)} 62% 39%)`;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function currentViewBox(svg) {
  const box = svg?.viewBox?.baseVal;
  if (!box || !box.width || !box.height) {
    return { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function zoomForViewBox(viewBox) {
  return MAP_WIDTH / viewBox.width;
}

function svgDisplayScale(svg, viewBox = currentViewBox(svg)) {
  const rect = svg?.getBoundingClientRect();
  if (!rect?.width || !rect?.height || !viewBox.width || !viewBox.height) return 1;
  return Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
}

function clampViewBox(viewBox) {
  const width = Number.isFinite(viewBox.width) && viewBox.width > 0
    ? Math.min(viewBox.width, MAP_WIDTH)
    : MAP_WIDTH;
  const height = Number.isFinite(viewBox.height) && viewBox.height > 0
    ? Math.min(viewBox.height, MAP_HEIGHT)
    : MAP_HEIGHT;
  return {
    x: clamp(viewBox.x, 0, MAP_WIDTH - width),
    y: clamp(viewBox.y, 0, MAP_HEIGHT - height),
    width,
    height,
  };
}

function rectsOverlap(first, second, padding = LABEL_PADDING) {
  return !(
    first.right + padding <= second.left ||
    first.left >= second.right + padding ||
    first.bottom + padding <= second.top ||
    first.top >= second.bottom + padding
  );
}

function labelCandidates(pointX, displayScale) {
  const preferredSide = pointX > MAP_WIDTH / 2 ? -1 : 1;
  const sides = [preferredSide, -preferredSide];
  const horizontalOffset = 10 / displayScale;
  const upperBaseline = -7 / displayScale;
  const lowerBaseline = 18 / displayScale;

  return [
    { x: sides[0] * horizontalOffset, y: upperBaseline, anchor: sides[0] > 0 ? "start" : "end" },
    { x: sides[0] * horizontalOffset, y: lowerBaseline, anchor: sides[0] > 0 ? "start" : "end" },
    { x: sides[1] * horizontalOffset, y: upperBaseline, anchor: sides[1] > 0 ? "start" : "end" },
    { x: sides[1] * horizontalOffset, y: lowerBaseline, anchor: sides[1] > 0 ? "start" : "end" },
    { x: 0, y: -12 / displayScale, anchor: "middle" },
    { x: 0, y: 22 / displayScale, anchor: "middle" },
  ];
}

function layoutStationLabels() {
  labelLayoutFrame = null;
  const svg = mapView?.querySelector(".route-map-canvas");
  if (!svg || viewMode !== "map") return;

  const svgRect = svg.getBoundingClientRect();
  if (!svgRect.width || !svgRect.height) return;

  const viewBox = currentViewBox(svg);
  const zoom = zoomForViewBox(viewBox);
  const displayScale = svgDisplayScale(svg, viewBox);
  const occupied = [];
  for (const blocker of mapView.querySelectorAll(
    ".route-map-summary, .route-map-station-card:not([hidden])",
  )) {
    const blockerRect = blocker.getBoundingClientRect();
    if (
      blockerRect.right > svgRect.left
      && blockerRect.left < svgRect.right
      && blockerRect.bottom > svgRect.top
      && blockerRect.top < svgRect.bottom
    ) {
      occupied.push(blockerRect);
    }
  }

  const labels = Array.from(svg.querySelectorAll("[data-map-label]"));
  for (const label of labels) {
    label.style.opacity = "0";
    label.style.fontSize = `${(LABEL_SCREEN_FONT_SIZE / displayScale).toFixed(3)}px`;
    label.style.strokeWidth = `${(LABEL_SCREEN_STROKE_WIDTH / displayScale).toFixed(3)}px`;
  }

  labels.sort((left, right) => {
    const leftRole = left.dataset.mapRole ? 0 : 1;
    const rightRole = right.dataset.mapRole ? 0 : 1;
    if (leftRole !== rightRole) return leftRole - rightRole;

    const frequencyDifference =
      Number(right.dataset.mapFrequency || 0) - Number(left.dataset.mapFrequency || 0);
    if (frequencyDifference) return frequencyDifference;

    return (left.textContent || "").length - (right.textContent || "").length;
  });

  let visibleLabels = 0;
  for (const label of labels) {
    const group = label.closest(".route-map-station");
    const pointX = Number(group?.dataset.mapX);
    if (!Number.isFinite(pointX)) continue;

    for (const candidate of labelCandidates(pointX, displayScale)) {
      label.setAttribute("x", candidate.x.toFixed(3));
      label.setAttribute("y", candidate.y.toFixed(3));
      label.setAttribute("text-anchor", candidate.anchor);

      const rect = label.getBoundingClientRect();
      const insideCanvas =
        rect.left >= svgRect.left + LABEL_PADDING &&
        rect.right <= svgRect.right - LABEL_PADDING &&
        rect.top >= svgRect.top + LABEL_PADDING &&
        rect.bottom <= svgRect.bottom - LABEL_PADDING;
      if (!insideCanvas || occupied.some((other) => rectsOverlap(rect, other))) continue;

      label.style.opacity = "1";
      occupied.push(rect);
      visibleLabels += 1;
      break;
    }
  }

  svg.dataset.visibleLabels = String(visibleLabels);
  svg.dataset.labelsLaidOut = "true";
  svg.dataset.zoom = zoom.toFixed(3);
}

function scheduleLabelLayout() {
  if (labelLayoutFrame !== null || viewMode !== "map") return;
  const svg = mapView?.querySelector(".route-map-canvas");
  if (svg) svg.dataset.labelsLaidOut = "false";
  labelLayoutFrame = requestAnimationFrame(layoutStationLabels);
}

function normalizedMapStyle(value) {
  return MAP_STYLE_VALUES.has(value) ? value : "standard";
}

function applyMapStyle(svg, value = state.mapStyle) {
  const style = normalizedMapStyle(value);
  state.mapStyle = style;
  mapView.dataset.mapStyle = style;
  if (svg) svg.dataset.mapStyle = style;
  if (mapStyleControl && mapStyleControl.value !== style) mapStyleControl.value = style;
}

function tileZoomForViewBox(viewBox) {
  const mapZoom = Math.max(1, zoomForViewBox(viewBox));
  return clamp(
    OSM_TILE_BASE_ZOOM + Math.floor(Math.log2(mapZoom)),
    OSM_TILE_BASE_ZOOM,
    OSM_TILE_MAX_ZOOM,
  );
}

function tileRangeForViewBox(viewBox, tileZoom, overscan = 0) {
  const topLeft = mapPointToWorld(viewBox.x, viewBox.y);
  const bottomRight = mapPointToWorld(
    viewBox.x + viewBox.width,
    viewBox.y + viewBox.height,
  );
  const tileCountPerAxis = 2 ** tileZoom;
  return {
    tileCountPerAxis,
    minTileX: clamp(
      Math.floor(topLeft.x * tileCountPerAxis) - overscan,
      0,
      tileCountPerAxis - 1,
    ),
    maxTileX: clamp(
      Math.floor(bottomRight.x * tileCountPerAxis) + overscan,
      0,
      tileCountPerAxis - 1,
    ),
    minTileY: clamp(
      Math.floor(topLeft.y * tileCountPerAxis) - overscan,
      0,
      tileCountPerAxis - 1,
    ),
    maxTileY: clamp(
      Math.floor(bottomRight.y * tileCountPerAxis) + overscan,
      0,
      tileCountPerAxis - 1,
    ),
  };
}

function renderedTilesCoverView(svg, tileZoom, viewRange) {
  if (Number(svg.dataset.tileZoom || 0) !== tileZoom) return false;
  const minTileX = Number(svg.dataset.tileMinX);
  const maxTileX = Number(svg.dataset.tileMaxX);
  const minTileY = Number(svg.dataset.tileMinY);
  const maxTileY = Number(svg.dataset.tileMaxY);
  return (
    Number.isFinite(minTileX)
    && Number.isFinite(maxTileX)
    && Number.isFinite(minTileY)
    && Number.isFinite(maxTileY)
    && viewRange.minTileX >= minTileX
    && viewRange.maxTileX <= maxTileX
    && viewRange.minTileY >= minTileY
    && viewRange.maxTileY <= maxTileY
  );
}

function renderOsmTiles(svg) {
  const tileLayer = svg?.querySelector(".route-map-tiles");
  if (!tileLayer || viewMode !== "map") return;

  const viewBox = currentViewBox(svg);
  const tileZoom = tileZoomForViewBox(viewBox);
  const viewRange = tileRangeForViewBox(viewBox, tileZoom);
  if (renderedTilesCoverView(svg, tileZoom, viewRange)) return;

  const range = tileRangeForViewBox(viewBox, tileZoom, OSM_TILE_OVERSCAN);
  const existingTiles = new Map(
    Array.from(tileLayer.querySelectorAll(".route-map-tile"), (tile) => [
      tile.dataset.tileKey,
      tile,
    ]),
  );
  let tileCount = 0;

  for (let tileY = range.minTileY; tileY <= range.maxTileY; tileY += 1) {
    for (let tileX = range.minTileX; tileX <= range.maxTileX; tileX += 1) {
      const tileKey = `${tileZoom}/${tileX}/${tileY}`;
      const worldTopLeft = {
        x: tileX / range.tileCountPerAxis,
        y: tileY / range.tileCountPerAxis,
      };
      const worldBottomRight = {
        x: (tileX + 1) / range.tileCountPerAxis,
        y: (tileY + 1) / range.tileCountPerAxis,
      };
      const mapTopLeft = projectWorld(worldTopLeft.x, worldTopLeft.y);
      const mapBottomRight = projectWorld(worldBottomRight.x, worldBottomRight.y);
      const width = mapBottomRight.x - mapTopLeft.x;
      const height = mapBottomRight.y - mapTopLeft.y;

      let tile = existingTiles.get(tileKey);
      if (!tile) {
        tile = document.createElementNS("http://www.w3.org/2000/svg", "image");
        tile.classList.add("route-map-tile");
        tile.dataset.tileKey = tileKey;
        tile.setAttribute("href", `${OSM_TILE_URL}/${tileZoom}/${tileX}/${tileY}.png`);
        tile.setAttribute("preserveAspectRatio", "none");
        tileLayer.append(tile);
      }
      tile.setAttribute("x", mapTopLeft.x.toFixed(3));
      tile.setAttribute("y", mapTopLeft.y.toFixed(3));
      tile.setAttribute("width", width.toFixed(3));
      tile.setAttribute("height", height.toFixed(3));
      existingTiles.delete(tileKey);
      tileCount += 1;
    }
  }

  for (const staleTile of existingTiles.values()) staleTile.remove();

  svg.dataset.tileProvider = "OpenStreetMap";
  svg.dataset.tileZoom = String(tileZoom);
  svg.dataset.tileCount = String(tileCount);
  svg.dataset.tileOverscan = String(OSM_TILE_OVERSCAN);
  svg.dataset.tileMinX = String(range.minTileX);
  svg.dataset.tileMaxX = String(range.maxTileX);
  svg.dataset.tileMinY = String(range.minTileY);
  svg.dataset.tileMaxY = String(range.maxTileY);
}

function scheduleTileRender(svg) {
  if (!svg || tileRenderFrame !== null || viewMode !== "map") return;
  tileRenderFrame = requestAnimationFrame(() => {
    tileRenderFrame = null;
    if (!svg.isConnected) return;
    renderOsmTiles(svg);
  });
}

function markerScreenScale(zoom) {
  const growth = 1 + Math.log2(Math.max(1, zoom)) * MARKER_GROWTH_PER_ZOOM_DOUBLING;
  return Math.min(MARKER_MAX_SCREEN_SCALE, growth);
}

function applyMapVisualScale(svg) {
  const viewBox = currentViewBox(svg);
  const zoom = zoomForViewBox(viewBox);
  const displayScale = svgDisplayScale(svg, viewBox);
  const screenScale = markerScreenScale(zoom);
  svg.dataset.markerScale = screenScale.toFixed(3);
  for (const group of svg.querySelectorAll(".route-map-station")) {
    const marker = group.querySelector(".route-map-station-marker");
    const hit = group.querySelector(".route-map-station-hit");
    if (!marker || !hit) continue;
    const screenRadius = group.classList.contains("search-station")
      ? SEARCH_MARKER_SCREEN_RADIUS
      : REGULAR_MARKER_SCREEN_RADIUS;
    marker.style.setProperty(
      "r",
      `${(screenRadius * screenScale / displayScale).toFixed(3)}px`,
    );
    hit.style.setProperty(
      "r",
      `${(STATION_HIT_SCREEN_RADIUS / displayScale).toFixed(3)}px`,
    );
  }
}

function setMapViewBox(
  svg,
  nextViewBox,
  { updateVisualScale = true, updateLabels = true } = {},
) {
  const viewBox = clampViewBox(nextViewBox);
  svg.setAttribute(
    "viewBox",
    `${viewBox.x.toFixed(3)} ${viewBox.y.toFixed(3)} ${viewBox.width.toFixed(3)} ${viewBox.height.toFixed(3)}`,
  );
  svg.dataset.zoom = zoomForViewBox(viewBox).toFixed(3);
  if (updateVisualScale) applyMapVisualScale(svg);
  scheduleTileRender(svg);
  if (updateLabels) scheduleLabelLayout();
}

function clientPointToMap(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  return point.matrixTransform(matrix.inverse());
}

function pointerDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function applyPendingPan(svg) {
  if (!pendingPan || pendingPan.svg !== svg) return;
  const { deltaX, deltaY } = pendingPan;
  pendingPan = null;

  const displayScale = svgDisplayScale(svg);
  if (!displayScale) return;
  const viewBox = currentViewBox(svg);
  setMapViewBox(
    svg,
    {
      ...viewBox,
      x: viewBox.x + deltaX / displayScale,
      y: viewBox.y + deltaY / displayScale,
    },
    { updateVisualScale: false, updateLabels: false },
  );
}

function schedulePan(svg, deltaX, deltaY) {
  if (!deltaX && !deltaY) return;
  if (!pendingPan || pendingPan.svg !== svg) {
    pendingPan = { svg, deltaX: 0, deltaY: 0 };
  }
  pendingPan.deltaX += deltaX;
  pendingPan.deltaY += deltaY;
  if (panFrame !== null) return;

  panFrame = requestAnimationFrame(() => {
    panFrame = null;
    applyPendingPan(svg);
  });
}

function flushPendingPan(svg) {
  if (panFrame !== null) {
    cancelAnimationFrame(panFrame);
    panFrame = null;
  }
  applyPendingPan(svg);
}

function departureRoleForDirection() {
  return "local_origins";
}

function arrivalRoleForDirection() {
  return "side_b_destinations";
}

function stationRoleLabel(name) {
  const role = stationRole(name);
  if (role === "departure") return "Current departure station";
  if (role === "arrival") return "Current arrival station";
  if (role === "via") return "Current via station";
  return "Station on displayed routes";
}

function routePassesStation(route, stationName) {
  if (!stationName) return true;
  try {
    return JSON.parse(decodeURIComponent(route.dataset.mapItineraryStations || "%5B%5D"))
      .includes(stationName);
  } catch (error) {
    return true;
  }
}

function updateRouteSelectionEmphasis(stationName = "") {
  for (const route of mapView?.querySelectorAll(".route-map-route") || []) {
    route.classList.toggle("dimmed", Boolean(stationName) && !routePassesStation(route, stationName));
  }
}

function closeStationCard() {
  selectedStationName = "";
  updateRouteSelectionEmphasis();
  mapView?.classList.remove("station-card-open");
  const card = mapView?.querySelector(".route-map-station-card");
  if (card) card.hidden = true;
  for (const group of mapView?.querySelectorAll(".route-map-station.selected") || []) {
    group.classList.remove("selected");
  }
  scheduleLabelLayout();
}

function showStationCard(name) {
  const card = mapView?.querySelector(".route-map-station-card");
  const svg = mapView?.querySelector(".route-map-canvas");
  if (!card || !svg) return;
  const group = Array.from(svg.querySelectorAll(".route-map-station")).find(
    (candidate) => candidate.dataset.mapName === name,
  );
  if (!group) {
    closeStationCard();
    return;
  }

  selectedStationName = name;
  updateRouteSelectionEmphasis(name);
  mapView.classList.add("station-card-open");
  for (const candidate of svg.querySelectorAll(".route-map-station")) {
    candidate.classList.toggle("selected", candidate === group);
  }

  const frequency = Math.max(1, Number(group.dataset.mapFrequency || 1));
  const heading = card.querySelector("[data-map-station-title]");
  const detail = card.querySelector("[data-map-station-detail]");
  const departureButton = card.querySelector('[data-map-station-action="departure"]');
  const viaButton = card.querySelector('[data-map-station-action="via"]');
  const arrivalButton = card.querySelector('[data-map-station-action="arrival"]');
  const highlightButton = card.querySelector('[data-map-station-action="highlight"]');

  if (heading) heading.textContent = name;
  if (detail) {
    detail.textContent = `${stationRoleLabel(name)} · shown in ${frequency} route leg${frequency === 1 ? "" : "s"}`;
  }

  const departureRole = departureRoleForDirection();
  const arrivalRole = arrivalRoleForDirection();
  if (departureButton) {
    departureButton.disabled = (
      state.config[departureRole]?.length === 1
      && state.config[departureRole][0] === name
    );
  }
  if (arrivalButton) {
    arrivalButton.disabled = (
      state.config[arrivalRole]?.length === 1
      && state.config[arrivalRole][0] === name
    );
  }
  if (viaButton) {
    viaButton.textContent = state.config.connection_stations.includes(name)
      ? "Remove via"
      : "Add via";
  }
  if (highlightButton) {
    highlightButton.textContent = state.highlights.includes(name)
      ? "Unhighlight"
      : "Highlight";
  }

  card.hidden = false;
  scheduleLabelLayout();
}

function refreshStationSelectors() {
  app.renderStationPickers(state.context?.station_names || [], state.config);
}

function applyStationRouteAction(name, action) {
  let role = "";
  if (action === "departure") role = departureRoleForDirection();
  if (action === "arrival") role = arrivalRoleForDirection();

  if (role) {
    if (state.config[role]?.length === 1 && state.config[role][0] === name) return;
    state.config[role] = [name];
  } else if (action === "via") {
    const stations = new Set(state.config.connection_stations || []);
    if (stations.has(name)) {
      stations.delete(name);
    } else {
      stations.add(name);
    }
    state.config.connection_stations = Array.from(stations).sort((left, right) =>
      left.localeCompare(right)
    );
  } else {
    return;
  }

  app.saveSettings();
  refreshStationSelectors();
  app.showRefreshNotice();
  showStationCard(name);
}

function toggleMapStationHighlight(name) {
  const highlights = new Set(state.highlights || []);
  if (highlights.has(name)) {
    highlights.delete(name);
  } else {
    highlights.add(name);
  }
  state.highlights = Array.from(highlights).sort((left, right) => left.localeCompare(right));
  app.saveSettings();
  refreshStationSelectors();

  if (state.settingsDirty || state.refreshInFlight) {
    app.renderRefreshNotice();
  } else {
    app.renderCurrentTab();
  }

  const group = Array.from(mapView?.querySelectorAll(".route-map-station") || []).find(
    (candidate) => candidate.dataset.mapName === name,
  );
  group?.classList.toggle("highlighted", state.highlights.includes(name));
  showStationCard(name);
}

function beginPinch(svg) {
  if (activePointers.size !== 2) {
    pinchGesture = null;
    return;
  }

  const [first, second] = Array.from(activePointers.values());
  if (first.pointerType !== "touch" || second.pointerType !== "touch") {
    pinchGesture = null;
    return;
  }
  const distance = pointerDistance(first, second);
  if (!distance) return;

  const midpoint = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
  const anchor = clientPointToMap(svg, midpoint.x, midpoint.y);
  if (!anchor) return;

  const viewBox = currentViewBox(svg);
  pinchGesture = {
    distance,
    viewBox,
    anchor,
    zoom: zoomForViewBox(viewBox),
  };
}

function installMapInteractions(svg) {
  activePointers.clear();
  pinchGesture = null;
  if (panFrame !== null) cancelAnimationFrame(panFrame);
  panFrame = null;
  pendingPan = null;
  svg.dataset.pinchZoom = "enabled";
  svg.dataset.touchPan = "enabled";
  svg.dataset.desktopPan = "enabled";
  svg.dataset.wheelZoom = "enabled";

  svg.addEventListener("pointerdown", (event) => {
    const isTouch = event.pointerType === "touch";
    const isPrimaryMouse = event.pointerType === "mouse" && event.button === 0;
    if (!isTouch && !isPrimaryMouse) return;

    const station = event.target.closest?.(".route-map-station");
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      stationName: station?.dataset.mapName || "",
      pointerType: event.pointerType,
    });
    svg.dataset.dragging = "true";
    if (activePointers.size === 2) {
      // Once a second pointer joins, neither pointerup should be treated as
      // a station tap, even if only one finger actually moved.
      for (const [pointerId, pointer] of activePointers) {
        pointer.moved = true;
        try {
          svg.setPointerCapture(pointerId);
        } catch {
          // Synthetic browser tests may not have an active native pointer capture target.
        }
      }
      flushPendingPan(svg);
      beginPinch(svg);
    }
  });

  svg.addEventListener("pointermove", (event) => {
    const previous = activePointers.get(event.pointerId);
    if (!previous) return;

    const moved = previous.moved || Math.hypot(
      event.clientX - previous.startX,
      event.clientY - previous.startY,
    ) > 5;
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: previous.startX,
      startY: previous.startY,
      moved,
      stationName: previous.stationName,
      pointerType: previous.pointerType,
    });

    if (activePointers.size === 1) {
      if (moved) {
        try {
          if (!svg.hasPointerCapture(event.pointerId)) {
            svg.setPointerCapture(event.pointerId);
          }
        } catch {
          // Synthetic browser tests may not have an active native pointer capture target.
        }
        schedulePan(svg, previous.x - event.clientX, previous.y - event.clientY);
        event.preventDefault();
      }
      return;
    }

    if (activePointers.size !== 2 || !pinchGesture) return;

    const [first, second] = Array.from(activePointers.values());
    const distance = pointerDistance(first, second);
    if (!distance) return;

    const targetZoom = Math.max(
      MIN_MAP_ZOOM,
      pinchGesture.zoom * (distance / pinchGesture.distance),
    );
    const width = MAP_WIDTH / targetZoom;
    const height = MAP_HEIGHT / targetZoom;
    const anchorFractionX =
      (pinchGesture.anchor.x - pinchGesture.viewBox.x) / pinchGesture.viewBox.width;
    const anchorFractionY =
      (pinchGesture.anchor.y - pinchGesture.viewBox.y) / pinchGesture.viewBox.height;

    setMapViewBox(svg, {
      x: pinchGesture.anchor.x - anchorFractionX * width,
      y: pinchGesture.anchor.y - anchorFractionY * height,
      width,
      height,
    });
    event.preventDefault();
  });

  const endPointer = (event) => {
    const pointer = activePointers.get(event.pointerId);
    const shouldActivateStation = (
      activePointers.size === 1
      && pointer
      && !pointer.moved
      && pointer.stationName
    );

    flushPendingPan(svg);
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchGesture = null;
    if (!activePointers.size) {
      svg.dataset.dragging = "false";
      scheduleTileRender(svg);
      scheduleLabelLayout();
    }

    if (shouldActivateStation) {
      showStationCard(pointer.stationName);
    }
  };
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  svg.addEventListener("wheel", (event) => {
    if (window.innerWidth <= 900) return;

    const viewBox = currentViewBox(svg);
    const anchor = clientPointToMap(svg, event.clientX, event.clientY);
    if (!anchor) return;

    const deltaPixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * window.innerHeight
        : event.deltaY;
    const zoomDelta = clamp(
      deltaPixels,
      -DESKTOP_WHEEL_DELTA_LIMIT,
      DESKTOP_WHEEL_DELTA_LIMIT,
    );
    const targetZoom = Math.max(
      MIN_MAP_ZOOM,
      zoomForViewBox(viewBox) * Math.exp(
        -zoomDelta * DESKTOP_WHEEL_ZOOM_SENSITIVITY,
      ),
    );
    const width = MAP_WIDTH / targetZoom;
    const height = MAP_HEIGHT / targetZoom;
    const anchorFractionX = (anchor.x - viewBox.x) / viewBox.width;
    const anchorFractionY = (anchor.y - viewBox.y) / viewBox.height;

    setMapViewBox(svg, {
      x: anchor.x - anchorFractionX * width,
      y: anchor.y - anchorFractionY * height,
      width,
      height,
    });
    event.preventDefault();
  }, { passive: false });

  setMapViewBox(svg, { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT });
}

function mapDirectionSwitchHtml() {
  const buttons = Array.from(directionTabs?.querySelectorAll("[data-tab]") || []).map((sourceButton) => {
    const selected = sourceButton.dataset.tab === state.selectedTab;
    return `<button type="button" data-map-direction="${escapeText(sourceButton.dataset.tab)}" class="${selected ? "selected" : ""}" aria-pressed="${selected}">${escapeText(sourceButton.textContent.trim())}</button>`;
  }).join("");

  return `<div class="route-map-direction-switch" role="group" aria-label="Journey direction">${buttons}</div>`;
}

function renderMap() {
  if (!mapView || viewMode !== "map") return;

  const itineraries = activeItineraries();
  const directionSwitchHtml = mapDirectionSwitchHtml();
  if (!itineraries.length) {
    mapView.innerHTML = `
      <div class="route-map-summary">
        ${directionSwitchHtml}
        <span>0 routes</span>
      </div>
      <div class="route-map-empty">No matching routes to display on the map.</div>
    `;
    return;
  }

  const stations = new Map();
  const routeSegments = [];
  let fallbackColorIndex = 0;

  for (const itinerary of itineraries) {
    const itineraryStations = new Set([
      itinerary.departure_stop,
      itinerary.destination_stop,
    ].filter(Boolean));
    for (const leg of itinerary.legs || []) {
      const points = pointsForLeg(leg);
      for (const point of points) itineraryStations.add(point.name);
      if (points.length < 1) continue;
      for (const point of points) {
        if (!stations.has(point.name)) stations.set(point.name, { ...point, frequency: 0 });
        stations.get(point.name).frequency += 1;
      }
      if (points.length > 1) {
        routeSegments.push({
          points,
          color: trainColor(String(leg.train_type || "Unknown"), fallbackColorIndex++),
          itineraryStations,
        });
      }
    }
  }

  if (!stations.size) {
    mapView.innerHTML = '<div class="route-map-empty">The returned routes do not contain station coordinates.</div>';
    return;
  }

  const routesHtml = routeSegments.map(({ points, color, itineraryStations }) => {
    const d = points.map((point, index) => {
      const projected = project(point.lon, point.lat);
      return `${index ? "L" : "M"}${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
    }).join(" ");
    const encodedStations = encodeURIComponent(JSON.stringify(Array.from(itineraryStations)));
    return `<path class="route-map-route" data-map-itinerary-stations="${encodedStations}" d="${d}" stroke="${escapeText(color)}" />`;
  }).join("");

  const stationHtml = Array.from(stations.values(), (station) => {
    const point = project(station.lon, station.lat);
    const role = stationRole(station.name);
    const highlighted = state.highlights.includes(station.name);
    const className = [
      "route-map-station",
      role ? "search-station" : "",
      role,
      highlighted ? "highlighted" : "",
      selectedStationName === station.name ? "selected" : "",
    ].filter(Boolean).join(" ");
    return `
      <g
        class="${className}"
        transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"
        data-map-name="${escapeText(station.name)}"
        data-map-frequency="${station.frequency}"
        data-map-x="${point.x.toFixed(3)}"
        data-map-y="${point.y.toFixed(3)}"
        role="button"
        tabindex="0"
        aria-label="Open actions for ${escapeText(station.name)}"
      >
        <circle class="route-map-station-marker" r="${role ? 5.2 : 2.7}"><title>${escapeText(station.name)}</title></circle>
        <circle class="route-map-station-hit" r="13" aria-hidden="true"></circle>
        <text
          data-map-label
          data-map-role="${escapeText(role)}"
          data-map-frequency="${station.frequency}"
          aria-hidden="true"
        >${escapeText(station.name)}</text>
      </g>
    `;
  }).join("");

  mapView.innerHTML = `
    <div class="route-map-summary">
      ${directionSwitchHtml}
      <span>${itineraries.length} route${itineraries.length === 1 ? "" : "s"} · ${stations.size} station${stations.size === 1 ? "" : "s"}</span>
      <span class="route-map-legend" aria-label="Search station roles">
        <span class="departure"><i aria-hidden="true"></i>Departure</span>
        <span class="via"><i aria-hidden="true"></i>Via</span>
        <span class="arrival"><i aria-hidden="true"></i>Arrival</span>
      </span>
    </div>
    <aside class="route-map-station-card" hidden aria-label="Station actions">
      <div class="route-map-station-card-head">
        <div>
          <h3 data-map-station-title></h3>
          <p data-map-station-detail></p>
        </div>
        <button
          type="button"
          class="route-map-station-card-close"
          data-map-station-action="close"
          aria-label="Close station actions"
        >×</button>
      </div>
      <div class="route-map-station-actions">
        <button type="button" data-map-station-action="departure">Depart from here</button>
        <button type="button" data-map-station-action="arrival">Arrive here</button>
        <button type="button" data-map-station-action="via">Add via</button>
        <button type="button" data-map-station-action="highlight">Highlight</button>
      </div>
    </aside>
    <a
      class="route-map-attribution"
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noopener noreferrer"
    >© OpenStreetMap contributors</a>
    <svg class="route-map-canvas" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="OpenStreetMap map showing stations and proposed train routes" preserveAspectRatio="xMidYMid meet">
      <g class="route-map-tiles" aria-hidden="true"></g>
      <g class="route-map-routes">${routesHtml}</g>
      <g class="route-map-stations">${stationHtml}</g>
    </svg>
  `;

  const svg = mapView.querySelector(".route-map-canvas");
  if (svg) {
    applyMapStyle(svg);
    installMapInteractions(svg);
    renderOsmTiles(svg);
  }
  if (selectedStationName && stations.has(selectedStationName)) {
    showStationCard(selectedStationName);
  } else if (selectedStationName) {
    selectedStationName = "";
  }
  scheduleLabelLayout();
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
  setViewMode(viewMode === "map" ? "time" : "map");
});

mapView?.addEventListener("click", (event) => {
  const directionButton = event.target.closest?.("[data-map-direction]");
  if (directionButton) {
    event.preventDefault();
    event.stopPropagation();
    const nextTab = state.selectedTab === "back" ? "out" : "back";
    directionTabs?.querySelector(`[data-tab="${nextTab}"]`)?.click();
    return;
  }

  const action = event.target.closest?.("[data-map-station-action]");
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    const actionName = action.dataset.mapStationAction;
    if (actionName === "close") {
      closeStationCard();
      return;
    }
    if (!selectedStationName) return;
    if (actionName === "highlight") {
      toggleMapStationHighlight(selectedStationName);
      return;
    }
    applyStationRouteAction(selectedStationName, actionName);
    return;
  }

  const station = event.target.closest?.(".route-map-station");
  if (station) {
    showStationCard(station.dataset.mapName || "");
    return;
  }

  if (!event.target.closest?.(".route-map-station-card")) closeStationCard();
});

mapView?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeStationCard();
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  const station = event.target.closest?.(".route-map-station");
  if (!station) return;
  event.preventDefault();
  showStationCard(station.dataset.mapName || "");
});

directionTabs?.addEventListener("click", () => requestAnimationFrame(scheduleRender));

mapStyleControl?.addEventListener("change", () => {
  const svg = mapView?.querySelector(".route-map-canvas");
  applyMapStyle(svg, mapStyleControl.value);
  app.saveSettings();
});

applyMapStyle(mapView?.querySelector(".route-map-canvas"));

if (timeView) {
  new MutationObserver(scheduleRender).observe(timeView, { childList: true, subtree: true });
}

setViewMode("time");
