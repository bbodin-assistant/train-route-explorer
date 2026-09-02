const detailFrame = document.querySelector("#train-detail-frame");
const detailLayer = document.querySelector("#train-detail-dismiss-layer");

const journeyDetailStyle = document.createElement("style");
journeyDetailStyle.textContent = `
  .journey-detail-stop.journey-detail-key-station strong {
    color: #26313a !important;
    font-weight: 900 !important;
  }

  .journey-detail-stop.journey-detail-key-station > span {
    color: #26313a !important;
    font-weight: 800 !important;
  }

  .journey-detail-stop.journey-detail-intermediate strong {
    color: #747e85 !important;
    font-weight: 550 !important;
  }

  .journey-detail-stop.journey-detail-intermediate > span {
    color: #8a9298 !important;
    font-weight: 600 !important;
  }

  .journey-detail-stop.journey-detail-intermediate .journey-detail-note {
    color: #8a9298 !important;
  }

  /* A transfer is an edge between two station nodes, not another station row.
     Keep it out of normal flow so interchange nodes use the same vertical
     spacing as every other adjacent pair of stations. */
  .journey-detail-transfer-edge {
    display: block !important;
    position: relative !important;
    min-height: 0 !important;
    height: 0 !important;
    overflow: visible !important;
    color: #805d11;
    pointer-events: none;
  }

  .journey-detail-transfer-edge > span {
    position: absolute !important;
    left: 126px !important;
    top: var(--journey-transfer-label-top, -28px) !important;
    z-index: 2;
    padding: 1px 4px !important;
    border-radius: 2px;
    background: #fffef9;
    color: #805d11 !important;
    font-size: 11px !important;
    font-weight: 850 !important;
    line-height: 1.2;
    white-space: nowrap;
  }

  .journey-detail-transfer-edge > div,
  .journey-detail-transfer-edge i,
  .journey-detail-transfer-edge i::after {
    display: none !important;
  }

  /* The station immediately before a transfer owns the brown connector.
     A separate custom property protects this geometry from the generic
     connector-height pass in row-details.js. */
  .journey-detail-stop.journey-detail-before-transfer i::after {
    display: block !important;
    width: 2px !important;
    height: var(--journey-transfer-height, 38px) !important;
    background: #a16207 !important;
  }

  #train-detail-dismiss-layer:not([hidden]) {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(24, 32, 42, 0.24);
  }

  #train-detail-frame:not([hidden]) {
    z-index: 71;
  }

  #train-detail-frame .train-detail-close {
    position: sticky;
    top: 0;
    z-index: 8;
    display: grid;
    place-items: center;
    float: right;
    width: 40px;
    height: 40px;
    margin: -4px -4px 6px 10px;
    padding: 0;
    border: 1px solid #c6cccf;
    border-radius: 999px;
    background: rgba(255, 254, 249, 0.96);
    color: #28323c;
    box-shadow: 0 2px 8px rgba(24, 32, 42, 0.12);
    font-size: 25px;
    font-weight: 500;
    line-height: 1;
    -webkit-tap-highlight-color: transparent;
  }

  #train-detail-frame .train-detail-close:hover {
    background: #f0f2ef;
  }

  #train-detail-frame .train-detail-close:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.35);
    outline-offset: 2px;
  }

  @media (max-width: 560px) {
    #train-detail-dismiss-layer:not([hidden]) {
      background: rgba(24, 32, 42, 0.34);
      backdrop-filter: blur(1px);
    }

    #train-detail-frame:not([hidden]) {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      top: auto !important;
      bottom: 0 !important;
      width: 100vw !important;
      max-width: none !important;
      max-height: min(82dvh, 720px) !important;
      margin: 0 !important;
      padding: 20px 14px max(16px, env(safe-area-inset-bottom)) !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
      border: 1px solid #c6cccf !important;
      border-bottom: 0 !important;
      border-radius: 16px 16px 0 0 !important;
      background: #fffef9 !important;
      box-shadow: 0 -12px 34px rgba(24, 32, 42, 0.24) !important;
      transform: translateY(var(--detail-drag-y, 0px));
      transition: transform 160ms ease-out;
      touch-action: pan-y;
    }

    #train-detail-frame:not([hidden])::before {
      content: "";
      position: absolute;
      top: 7px;
      left: 50%;
      width: 38px;
      height: 4px;
      border-radius: 999px;
      background: #c7cccf;
      transform: translateX(-50%);
    }

    #train-detail-frame.detail-dragging {
      transition: none;
    }

    #train-detail-frame .train-detail-close {
      width: 44px;
      height: 44px;
      margin: -6px -2px 6px 10px;
      background: #fffef9;
      font-size: 27px;
    }
  }
`;
document.head.append(journeyDetailStyle);

let syncFrame = null;
let detailWasOpen = false;
let touchStartX = null;
let touchStartY = null;
let touchDragY = 0;
const mobileDetailMedia = window.matchMedia("(max-width: 560px)");
const DETAIL_HISTORY_KEY = "trainRouteExplorerDetailOpen";

function markStationEmphasis(rows) {
  const stationRows = rows.filter((row) => row.classList.contains("journey-detail-stop"));
  for (const row of stationRows) {
    row.classList.remove("journey-detail-key-station", "journey-detail-intermediate", "journey-detail-before-transfer");
    row.style.removeProperty("--journey-transfer-height");
  }

  stationRows[0]?.classList.add("journey-detail-key-station");
  stationRows.at(-1)?.classList.add("journey-detail-key-station");

  for (const row of rows) {
    if (!row.classList.contains("journey-detail-transfer-edge")) continue;
    const before = row.previousElementSibling;
    const after = row.nextElementSibling;
    if (before?.classList.contains("journey-detail-stop")) {
      before.classList.add("journey-detail-key-station", "journey-detail-before-transfer");
    }
    if (after?.classList.contains("journey-detail-stop")) {
      after.classList.add("journey-detail-key-station");
    }
  }

  for (const row of stationRows) {
    if (!row.classList.contains("journey-detail-key-station")) {
      row.classList.add("journey-detail-intermediate");
    }
  }
}

function syncTransferGeometry(rows) {
  for (const row of rows) {
    if (!row.classList.contains("journey-detail-transfer-edge")) continue;
    const before = row.previousElementSibling;
    const after = row.nextElementSibling;
    const previousMarker = before?.querySelector("i");
    const nextMarker = after?.querySelector("i");
    const label = row.querySelector(":scope > span");
    if (!before || !previousMarker || !nextMarker) continue;

    const previous = previousMarker.getBoundingClientRect();
    const next = nextMarker.getBoundingClientRect();
    const transfer = row.getBoundingClientRect();
    const previousConnectorStart = previous.top + 10;
    const nextCenter = next.top + next.height / 2;
    const connectorHeight = Math.max(2, nextCenter - previousConnectorStart);
    before.style.setProperty("--journey-transfer-height", `${connectorHeight}px`);

    if (label) {
      const labelHeight = label.getBoundingClientRect().height || 13;
      const midpoint = (previous.top + previous.height / 2 + nextCenter) / 2;
      row.style.setProperty(
        "--journey-transfer-label-top",
        `${midpoint - transfer.top - labelHeight / 2}px`,
      );
    }
  }
}

function ensureCloseButton() {
  if (!detailFrame || detailFrame.hidden) return;
  detailFrame.setAttribute("role", "dialog");
  detailFrame.setAttribute("aria-modal", "true");
  detailFrame.setAttribute("aria-label", "Trip details");
  if (detailFrame.querySelector(".train-detail-close")) return;
  detailFrame.insertAdjacentHTML(
    "afterbegin",
    '<button type="button" class="train-detail-close" aria-label="Close trip details" title="Close trip details"><span aria-hidden="true">×</span></button>',
  );
}

function detailIsOpen() {
  return Boolean(detailFrame && !detailFrame.hidden);
}

function currentHistoryIsDetail() {
  return Boolean(history.state?.[DETAIL_HISTORY_KEY]);
}

function pushDetailHistoryEntry() {
  if (!detailIsOpen() || currentHistoryIsDetail()) return;
  const currentState = history.state && typeof history.state === "object" ? history.state : {};
  history.pushState({ ...currentState, [DETAIL_HISTORY_KEY]: true }, "");
}

function dismissThroughExistingHandlers() {
  if (!detailIsOpen()) return;
  if (detailLayer && !detailLayer.hidden) {
    detailLayer.click();
  } else {
    detailFrame.hidden = true;
  }
}

function syncDetailOpenState() {
  if (!detailFrame) return;
  const isOpen = !detailFrame.hidden;

  if (isOpen) {
    ensureCloseButton();
    if (!detailWasOpen) pushDetailHistoryEntry();
  } else {
    resetDragPosition();
    if (detailWasOpen && currentHistoryIsDetail()) history.back();
  }

  detailWasOpen = isOpen;
}

function syncJourneyDetailGraph() {
  syncFrame = null;
  syncDetailOpenState();
  if (!detailFrame?.classList.contains("journey-detail-frame") || detailFrame.hidden) return;
  const rows = Array.from(detailFrame.querySelectorAll(".journey-detail-stop, .journey-detail-transfer-edge"));
  if (!rows.length) return;
  markStationEmphasis(rows);
  syncTransferGeometry(rows);
}

function scheduleSync() {
  if (syncFrame !== null) return;
  syncFrame = requestAnimationFrame(syncJourneyDetailGraph);
}

function resetDragPosition() {
  if (!detailFrame) return;
  detailFrame.classList.remove("detail-dragging");
  detailFrame.style.removeProperty("--detail-drag-y");
  touchStartX = null;
  touchStartY = null;
  touchDragY = 0;
}

function beginTouchDrag(event) {
  if (!detailIsOpen() || !mobileDetailMedia.matches || detailFrame.scrollTop > 0 || event.touches.length !== 1) return;
  const touch = event.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchDragY = 0;
}

function updateTouchDrag(event) {
  if (touchStartY === null || touchStartX === null || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const deltaY = touch.clientY - touchStartY;
  const deltaX = touch.clientX - touchStartX;
  if (deltaY <= 0 || Math.abs(deltaX) > deltaY || detailFrame.scrollTop > 0) return;

  touchDragY = Math.min(deltaY, 240);
  if (touchDragY < 8) return;
  detailFrame.classList.add("detail-dragging");
  detailFrame.style.setProperty("--detail-drag-y", `${touchDragY}px`);
  event.preventDefault();
}

function finishTouchDrag() {
  if (touchStartY === null) return;
  const shouldDismiss = touchDragY >= 88;
  resetDragPosition();
  if (shouldDismiss) dismissThroughExistingHandlers();
}

if (detailFrame) {
  new MutationObserver(scheduleSync).observe(detailFrame, {
    attributes: true,
    attributeFilter: ["hidden", "class"],
    childList: true,
    subtree: true,
  });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(scheduleSync).observe(detailFrame);
  }
  detailFrame.addEventListener("click", (event) => {
    if (!event.target.closest(".train-detail-close")) return;
    dismissThroughExistingHandlers();
  });
  detailFrame.addEventListener("touchstart", beginTouchDrag, { passive: true });
  detailFrame.addEventListener("touchmove", updateTouchDrag, { passive: false });
  detailFrame.addEventListener("touchend", finishTouchDrag, { passive: true });
  detailFrame.addEventListener("touchcancel", resetDragPosition, { passive: true });
  window.addEventListener("resize", scheduleSync);
  syncDetailOpenState();
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !detailIsOpen()) return;
  event.preventDefault();
  dismissThroughExistingHandlers();
});

window.addEventListener("popstate", () => {
  if (detailIsOpen() && !currentHistoryIsDetail()) {
    dismissThroughExistingHandlers();
  }
});
