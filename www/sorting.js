const timeline = document.querySelector("#routes-time-chart");

const timelineSortStyle = document.createElement("style");
timelineSortStyle.textContent = `
  .timeline-scale::before { content: none !important; }

  .timeline-sort-controls {
    position: absolute;
    left: calc(-1 * var(--timeline-label-width));
    top: 0;
    width: var(--timeline-label-width);
    height: 100%;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) max-content;
    gap: 9px;
    align-items: center;
    padding: 0 20px 0 5px;
    background: var(--paper);
  }

  .timeline-sort-button {
    min-width: 0;
    border: 0;
    padding: 2px 0;
    background: transparent;
    color: #7c858c;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 0.1em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .timeline-sort-button[data-timeline-sort="time"] { justify-self: start; }
  .timeline-sort-button[data-timeline-sort="duration"] { justify-self: end; }

  .timeline-sort-button:hover,
  .timeline-sort-button.is-active {
    color: #26313a;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .timeline-sort-arrow {
    display: inline-block;
    width: 10px;
    margin-left: 2px;
    color: #6c757c;
    text-align: center;
    letter-spacing: 0;
  }

  @media (max-width: 900px) {
    .timeline-sort-controls {
      padding-right: 14px;
    }
  }
`;
document.head.append(timelineSortStyle);

const sortState = { key: null, direction: null };
const defaultRowsByGrid = new WeakMap();
let enhancementFrame = null;

function rowTimeMinutes(row) {
  const text = row.querySelector(".timeline-label-time")?.textContent.trim() || "";
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
}

function rowDurationMinutes(row) {
  const text = row.querySelector(".timeline-label-duration")?.textContent || "";
  const match = text.match(/(?:(\d+)h)?\s*(\d+)(?:m)?/i);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}

function currentGrid() {
  return timeline?.querySelector(".timeline-grid") || null;
}

function rememberDefaultRows(grid) {
  if (!grid || defaultRowsByGrid.has(grid)) return;
  defaultRowsByGrid.set(grid, Array.from(grid.querySelectorAll(":scope > .timeline-row")));
}

function desiredRows(grid) {
  rememberDefaultRows(grid);
  const defaults = defaultRowsByGrid.get(grid) || [];
  if (!sortState.key || !sortState.direction) return defaults;

  const valueFor = sortState.key === "duration" ? rowDurationMinutes : rowTimeMinutes;
  const multiplier = sortState.direction === "asc" ? 1 : -1;
  const defaultIndex = new Map(defaults.map((row, index) => [row, index]));

  return [...defaults].sort((left, right) => {
    const difference = valueFor(left) - valueFor(right);
    if (difference) return difference * multiplier;
    return (defaultIndex.get(left) - defaultIndex.get(right));
  });
}

function applyTimelineSort() {
  const grid = currentGrid();
  if (!grid) return;
  const wanted = desiredRows(grid);
  const current = Array.from(grid.querySelectorAll(":scope > .timeline-row"));
  const alreadyOrdered = wanted.length === current.length && wanted.every((row, index) => current[index] === row);
  if (!alreadyOrdered) {
    for (const row of wanted) grid.append(row);
  }
  updateSortButtons();
}

function sortArrow(key) {
  if (sortState.key !== key) return "";
  return sortState.direction === "asc" ? "↑" : sortState.direction === "desc" ? "↓" : "";
}

function updateSortButtons() {
  for (const button of timeline?.querySelectorAll("[data-timeline-sort]") || []) {
    const key = button.dataset.timelineSort;
    const active = sortState.key === key && Boolean(sortState.direction);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    const arrow = button.querySelector(".timeline-sort-arrow");
    if (arrow) arrow.textContent = sortArrow(key);
    const directionText = !active ? "default order" : sortState.direction === "asc" ? "ascending" : "descending";
    button.title = `${button.dataset.sortLabel}: ${directionText}`;
  }
}

function cycleSort(key) {
  if (sortState.key !== key || !sortState.direction) {
    sortState.key = key;
    sortState.direction = "asc";
  } else if (sortState.direction === "asc") {
    sortState.direction = "desc";
  } else {
    sortState.key = null;
    sortState.direction = null;
  }
  applyTimelineSort();
}

function installSortControls() {
  if (!timeline) return;
  const scale = timeline.querySelector(".timeline-scale");
  if (!scale || scale.querySelector(":scope > .timeline-sort-controls")) return;

  const controls = document.createElement("div");
  controls.className = "timeline-sort-controls";
  controls.innerHTML = `
    <button type="button" class="timeline-sort-button" data-timeline-sort="time" data-sort-label="Time" aria-pressed="false">
      Time<span class="timeline-sort-arrow" aria-hidden="true"></span>
    </button>
    <span aria-hidden="true"></span>
    <button type="button" class="timeline-sort-button" data-timeline-sort="duration" data-sort-label="Duration" aria-pressed="false">
      Duration<span class="timeline-sort-arrow" aria-hidden="true"></span>
    </button>
  `;
  controls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-timeline-sort]");
    if (button) cycleSort(button.dataset.timelineSort);
  });
  scale.prepend(controls);
  updateSortButtons();
}

function shiftFourOClockTicks() {
  if (!timeline) return;
  const scale = timeline.querySelector(".timeline-scale");
  const gridLines = timeline.querySelector(".timeline-grid-lines");
  if (!scale || !gridLines || scale.dataset.shiftedFromFour === "true") return;

  const labels = Array.from(scale.querySelectorAll(":scope > span"));
  if (!labels.length || labels[0].textContent.trim() !== "04:00") return;

  const lines = Array.from(gridLines.querySelectorAll(":scope > span"));
  const firstPosition = Number.parseFloat(labels[0].style.left);
  const secondPosition = Number.parseFloat(labels[1]?.style.left);
  if (!Number.isFinite(firstPosition) || !Number.isFinite(secondPosition)) return;

  const shift = (secondPosition - firstPosition) / 2;
  labels.forEach((label) => {
    const left = Number.parseFloat(label.style.left);
    const match = label.textContent.trim().match(/^(\d{2}):(\d{2})$/);
    if (!Number.isFinite(left) || !match) return;
    const minutes = Number(match[1]) * 60 + Number(match[2]) + 60;
    label.style.left = `${left + shift}%`;
    label.textContent = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  });
  lines.forEach((line) => {
    const left = Number.parseFloat(line.style.left);
    if (Number.isFinite(left)) line.style.left = `${left + shift}%`;
  });
  scale.dataset.shiftedFromFour = "true";
}

function enhanceTimelineSorting() {
  enhancementFrame = null;
  if (!timeline) return;
  const grid = currentGrid();
  if (grid) rememberDefaultRows(grid);
  installSortControls();
  shiftFourOClockTicks();
  applyTimelineSort();
}

function scheduleEnhancement() {
  if (enhancementFrame !== null) return;
  enhancementFrame = requestAnimationFrame(enhanceTimelineSorting);
}

if (timeline) {
  new MutationObserver(scheduleEnhancement).observe(timeline, { childList: true, subtree: true });
}

scheduleEnhancement();
