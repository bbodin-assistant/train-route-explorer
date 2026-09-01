const detailFrame = document.querySelector("#train-detail-frame");

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
`;
document.head.append(journeyDetailStyle);

let syncFrame = null;

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

function syncJourneyDetailGraph() {
  syncFrame = null;
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

if (detailFrame) {
  new MutationObserver(scheduleSync).observe(detailFrame, {
    childList: true,
    subtree: true,
  });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(scheduleSync).observe(detailFrame);
  }
  window.addEventListener("resize", scheduleSync);
}
