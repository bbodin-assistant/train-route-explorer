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

  .journey-detail-transfer-edge {
    min-height: 43px !important;
    position: relative;
  }

  .journey-detail-transfer-edge > span {
    grid-column: 3 !important;
    grid-row: 1 !important;
    align-self: center !important;
    justify-self: start !important;
    padding: 0 !important;
    color: #805d11 !important;
    font-size: 11px !important;
    font-weight: 850 !important;
  }

  .journey-detail-transfer-edge > div {
    display: none !important;
  }

  .journey-detail-transfer-edge i {
    grid-column: 2 !important;
    grid-row: 1 !important;
    align-self: start !important;
    justify-self: center !important;
    width: 2px !important;
    height: 2px;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #a16207 !important;
    box-shadow: none !important;
    transform-origin: top center;
  }

  .journey-detail-transfer-edge i::after {
    display: none !important;
  }

  .journey-detail-stop.journey-detail-before-transfer i::after {
    display: none !important;
  }
`;
document.head.append(journeyDetailStyle);

let syncFrame = null;

function markStationEmphasis(rows) {
  const stationRows = rows.filter((row) => row.classList.contains("journey-detail-stop"));
  for (const row of stationRows) {
    row.classList.remove("journey-detail-key-station", "journey-detail-intermediate", "journey-detail-before-transfer");
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

function stretchTransferEdges(rows) {
  for (const row of rows) {
    if (!row.classList.contains("journey-detail-transfer-edge")) continue;
    const line = row.querySelector("i");
    const previousMarker = row.previousElementSibling?.querySelector("i");
    const nextMarker = row.nextElementSibling?.querySelector("i");
    if (!line || !previousMarker || !nextMarker) continue;

    line.style.height = "2px";
    line.style.transform = "none";

    const base = line.getBoundingClientRect();
    const previous = previousMarker.getBoundingClientRect();
    const next = nextMarker.getBoundingClientRect();
    const previousCenter = previous.top + previous.height / 2;
    const nextCenter = next.top + next.height / 2;
    const height = Math.max(2, nextCenter - previousCenter);
    const offset = previousCenter - base.top;

    line.style.height = `${height}px`;
    line.style.transform = `translateY(${offset}px)`;
  }
}

function syncJourneyDetailGraph() {
  syncFrame = null;
  if (!detailFrame?.classList.contains("journey-detail-frame") || detailFrame.hidden) return;
  const rows = Array.from(detailFrame.querySelectorAll(".journey-detail-stop, .journey-detail-transfer-edge"));
  if (!rows.length) return;
  markStationEmphasis(rows);
  stretchTransferEdges(rows);
}

function scheduleSync() {
  if (syncFrame !== null) return;
  syncFrame = requestAnimationFrame(syncJourneyDetailGraph);
}

if (detailFrame) {
  new MutationObserver(scheduleSync).observe(detailFrame, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"],
  });
  window.addEventListener("resize", scheduleSync);
}
