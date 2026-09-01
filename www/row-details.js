const timeline = document.querySelector("#routes-time-chart");
const detailLayer = document.querySelector("#train-detail-dismiss-layer");
const detailFrame = document.querySelector("#train-detail-frame");

const rowInteractionStyle = document.createElement("style");
rowInteractionStyle.textContent = `
  .timeline-row {
    min-height: 52px !important;
    cursor: pointer;
    transition: background 120ms ease, box-shadow 120ms ease;
  }

  .timeline-label {
    padding-top: 5px !important;
    padding-bottom: 5px !important;
  }

  .timeline-lane {
    height: 36px !important;
  }

  .timeline-bar {
    top: 6px !important;
    height: 24px !important;
  }

  .timeline-row:focus-visible {
    outline: 2px solid #8aa6b8;
    outline-offset: -2px;
  }

  .timeline-row.is-journey-open {
    background: rgba(246, 196, 69, 0.075);
    box-shadow: inset 3px 0 #d4a51d;
  }

  #train-detail-frame.journey-detail-frame {
    width: 470px;
    max-width: calc(100vw - 32px);
    max-height: 78vh;
    padding: 14px;
  }

  .journey-detail-heading {
    margin-bottom: 4px;
    font-size: 13px;
    font-weight: 850;
    line-height: 1.3;
  }

  .journey-detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    margin-bottom: 14px;
    color: #6f7880;
    font-size: 10px;
    font-weight: 750;
  }

  .journey-detail-meta strong {
    color: #34404a;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }

  .journey-detail-stop {
    min-height: 43px !important;
  }

  .journey-detail-stop i {
    border-color: var(--journey-node-color, #2563eb) !important;
    background: #fff !important;
  }

  .journey-detail-stop i::after {
    height: var(--journey-connector-height, 38px) !important;
    background: var(--journey-line-color, #2563eb) !important;
  }

  .journey-detail-stop strong {
    display: block;
  }

  .journey-detail-note {
    display: block;
    margin-top: 3px;
    color: #758087;
    font-size: 10px;
    font-weight: 650;
    line-height: 1.35;
  }

  .journey-detail-service {
    color: #44515b;
  }

  .journey-detail-transfer-edge {
    min-height: 36px !important;
    color: #8a6514;
  }

  .journey-detail-transfer-edge > span {
    padding-top: 3px;
    color: #8a6514;
    font-size: 10px;
    font-weight: 800;
  }

  .journey-detail-transfer-edge i {
    width: 10px !important;
    height: 10px !important;
    margin-top: 3px !important;
    border: 2px solid #a16207 !important;
    border-radius: 50% !important;
    background: #a16207 !important;
    box-shadow: 0 0 0 2px #fff8df;
  }

  .journey-detail-transfer-edge i::after {
    top: 8px !important;
    width: 2px !important;
    height: var(--journey-connector-height, 24px) !important;
    border: 0 !important;
    background: var(--journey-line-color, #2563eb) !important;
  }

  .journey-detail-transfer-edge strong {
    display: block;
    padding-top: 1px;
    color: #805d11;
    font-size: 11px;
    font-weight: 850;
  }

  .journey-detail-transfer-edge .journey-detail-note {
    margin-top: 1px;
    color: #8a6514;
  }

  @media (max-width: 560px) {
    #train-detail-frame.journey-detail-frame {
      width: calc(100vw - 20px);
      max-width: calc(100vw - 20px);
      padding: 12px;
    }
  }
`;
document.head.append(rowInteractionStyle);

let activeRow = null;
let detailResizeObserver = null;

function decodeLeg(bar) {
  if (!bar?.dataset.detail) return null;
  try {
    return JSON.parse(decodeURIComponent(bar.dataset.detail));
  } catch {
    return null;
  }
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serviceLabel(leg) {
  const type = String(leg?.train_type || "Train").trim();
  const number = String(leg?.train_number || "").trim();
  return number ? `${type} ${number}` : type;
}

function legColor(bar) {
  return bar?.style.getPropertyValue("--train-color")?.trim() || "#2563eb";
}

function stopListForLeg(leg) {
  const directPath = Array.isArray(leg?.path) ? leg.path : [];
  const journeyPath = Array.isArray(leg?.journey_path)
    ? leg.journey_path.filter((stop) => stop?.in_segment !== false)
    : [];
  const source = directPath.length ? directPath : journeyPath;
  const stops = source.map((stop) => ({ ...stop }));

  if (!stops.length || stops[0]?.stop_name !== leg.departure_stop) {
    stops.unshift({
      stop_name: leg.departure_stop,
      departure_time: leg.departure_time,
      arrival_time: leg.departure_time,
    });
  }

  if (stops.at(-1)?.stop_name !== leg.destination_stop) {
    stops.push({
      stop_name: leg.destination_stop,
      arrival_time: leg.arrival_time,
      departure_time: leg.arrival_time,
    });
  }

  if (!stops[0].departure_time) stops[0].departure_time = leg.departure_time;
  if (!stops.at(-1).arrival_time) stops.at(-1).arrival_time = leg.arrival_time;
  return stops;
}

function transferMinutes(previousLeg, nextLeg) {
  const arrival = Number(previousLeg?.arrival_minutes);
  const departure = Number(nextLeg?.departure_minutes);
  if (!Number.isFinite(arrival) || !Number.isFinite(departure)) return null;
  return Math.max(0, departure - arrival);
}

function rowJourneyData(row) {
  const trainBars = Array.from(row.querySelectorAll(".timeline-bar.train[data-detail]"));
  const legs = trainBars
    .map((bar) => ({ leg: decodeLeg(bar), color: legColor(bar) }))
    .filter((entry) => entry.leg);
  if (!legs.length) return null;

  const duration = row.querySelector(".timeline-label-duration")?.textContent.replace(/[()]/g, "").trim() || "—";
  return { legs, duration };
}

function buildJourneyItems(data) {
  const items = [];

  data.legs.forEach((entry, legIndex) => {
    const { leg, color } = entry;
    const stops = stopListForLeg(leg);

    stops.forEach((stop, stopIndex) => {
      const station = String(stop.stop_name || "—");
      const isFirstStop = stopIndex === 0;
      const isLastStop = stopIndex === stops.length - 1;
      const previousItem = items.at(-1);

      if (legIndex > 0 && isFirstStop && previousItem?.station === station && !previousItem.isTransferEdge) {
        const previousLeg = data.legs[legIndex - 1].leg;
        const wait = transferMinutes(previousLeg, leg);

        // Keep the arrival station as its own node, then insert the transfer
        // edge. The current stop is still added below as the departure node
        // for the next train, so an interchange appears on both sides.
        previousItem.lineColor = "#a16207";
        items.push({
          isTransferEdge: true,
          transferWait: wait,
          lineColor: color,
        });
      }

      items.push({
        isTransferEdge: false,
        station,
        // A journey leg starts at departure and ends at arrival. Ignore any
        // through-service times outside the selected leg at those endpoints.
        arrivalTime: isFirstStop ? "" : (stop.arrival_time || (isLastStop ? leg.arrival_time : "")),
        departureTime: isLastStop && !isFirstStop ? "" : (stop.departure_time || (isFirstStop ? leg.departure_time : "")),
        service: isFirstStop ? serviceLabel(leg) : "",
        nodeColor: color,
        lineColor: color,
      });
    });
  });

  return items;
}

function nodeTime(node) {
  const arrival = String(node.arrivalTime || "").trim();
  const departure = String(node.departureTime || "").trim();
  if (arrival && departure && arrival !== departure) return `${arrival} / ${departure}`;
  return departure || arrival || "—";
}

function nodeNote(node) {
  if (node.service) {
    return `<span class="journey-detail-note journey-detail-service">${escapeText(node.service)}</span>`;
  }
  return "";
}

function transferEdgeHtml(edge) {
  const wait = Number.isFinite(edge.transferWait) ? `${edge.transferWait} min` : "Change";

  return `
    <div class="detail-stop journey-detail-transfer-edge" style="--journey-line-color:${escapeText(edge.lineColor)}">
      <span>${escapeText(wait)}</span>
      <i aria-hidden="true"></i>
      <div>
        <strong>Transfer</strong>
      </div>
    </div>
  `;
}

function journeyStopsHtml(items) {
  return items.map((item) => {
    if (item.isTransferEdge) return transferEdgeHtml(item);
    return `
      <div class="detail-stop journey-detail-stop" style="--journey-node-color:${escapeText(item.nodeColor)};--journey-line-color:${escapeText(item.lineColor)}">
        <span>${escapeText(nodeTime(item))}</span>
        <i aria-hidden="true"></i>
        <div>
          <strong>${escapeText(item.station)}</strong>
          ${nodeNote(item)}
        </div>
      </div>
    `;
  }).join("");
}

function syncJourneyConnectorHeights() {
  if (!detailFrame?.classList.contains("journey-detail-frame")) return;
  const graphRows = Array.from(detailFrame.querySelectorAll(".journey-detail-stop, .journey-detail-transfer-edge"));
  graphRows.forEach((row, index) => {
    const marker = row.querySelector("i");
    const nextMarker = graphRows[index + 1]?.querySelector("i");
    if (!marker || !nextMarker) return;
    const markerRect = marker.getBoundingClientRect();
    const nextRect = nextMarker.getBoundingClientRect();
    const connectorStart = row.classList.contains("journey-detail-transfer-edge")
      ? markerRect.bottom
      : markerRect.top + 10;
    const connectorEnd = nextMarker.getBoundingClientRect().top + (nextRect.height / 2);
    row.style.setProperty("--journey-connector-height", `${Math.max(0, connectorEnd - connectorStart)}px`);
  });
}

function clearJourneySelection() {
  if (activeRow) {
    activeRow.classList.remove("is-journey-open");
    activeRow.setAttribute("aria-expanded", "false");
  }
  activeRow = null;
  detailFrame?.classList.remove("journey-detail-frame");
  detailResizeObserver?.disconnect();
  detailResizeObserver = null;
}

function positionJourneyFrame(row) {
  if (!detailFrame) return;
  const rect = row.getBoundingClientRect();
  const left = Math.min(Math.max(16, rect.left + 72), window.innerWidth - detailFrame.offsetWidth - 16);
  detailFrame.style.left = `${left}px`;

  requestAnimationFrame(() => {
    const desiredTop = window.scrollY + rect.top + 26;
    const minimumTop = window.scrollY + 16;
    const maximumTop = window.scrollY + window.innerHeight - detailFrame.offsetHeight - 16;
    detailFrame.style.top = `${Math.max(minimumTop, Math.min(desiredTop, maximumTop))}px`;
  });
}

function showJourneyGraph(row) {
  if (!detailFrame || !detailLayer) return;
  const data = rowJourneyData(row);
  if (!data) return;

  const items = buildJourneyItems(data);
  if (!items.length) return;

  const firstLeg = data.legs[0].leg;
  const lastLeg = data.legs.at(-1).leg;
  const transferCount = Math.max(0, data.legs.length - 1);

  if (activeRow && activeRow !== row) clearJourneySelection();
  activeRow = row;
  row.classList.add("is-journey-open");
  row.setAttribute("aria-expanded", "true");

  detailFrame.classList.add("journey-detail-frame");
  detailFrame.innerHTML = `
    <div class="journey-detail-heading">
      ${escapeText(firstLeg.departure_stop || "—")} ${escapeText(firstLeg.departure_time || "")}
      → ${escapeText(lastLeg.destination_stop || "—")} ${escapeText(lastLeg.arrival_time || "")}
    </div>
    <div class="journey-detail-meta">
      <span>Duration <strong>${escapeText(data.duration)}</strong></span>
      <span>${transferCount ? `${transferCount} change${transferCount === 1 ? "" : "s"}` : "Direct journey"}</span>
    </div>
    <div class="detail-stops journey-detail-stops" aria-label="Full journey graph">
      ${journeyStopsHtml(items)}
    </div>
  `;
  detailFrame.hidden = false;
  detailLayer.hidden = false;
  positionJourneyFrame(row);
  requestAnimationFrame(syncJourneyConnectorHeights);

  detailResizeObserver?.disconnect();
  if (typeof ResizeObserver === "function") {
    detailResizeObserver = new ResizeObserver(() => requestAnimationFrame(syncJourneyConnectorHeights));
    detailResizeObserver.observe(detailFrame);
  }
}

function makeRowsInteractive() {
  for (const row of timeline?.querySelectorAll(".timeline-row") || []) {
    if (row.dataset.rowInteractive === "true") continue;
    row.dataset.rowInteractive = "true";
    row.tabIndex = 0;
    row.setAttribute("aria-expanded", "false");
    row.setAttribute("aria-label", "Trip row. Press Enter for the full journey graph.");
  }
}

function isNestedControl(target) {
  return Boolean(target.closest("button, input, select, textarea, a"));
}

timeline?.addEventListener("click", (event) => {
  const row = event.target.closest(".timeline-row");
  if (!row || isNestedControl(event.target)) {
    if (event.target.closest(".timeline-bar.train")) clearJourneySelection();
    return;
  }
  showJourneyGraph(row);
});

timeline?.addEventListener("keydown", (event) => {
  const row = event.target.closest(".timeline-row");
  if (!row || event.target !== row || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showJourneyGraph(row);
});

detailLayer?.addEventListener("click", clearJourneySelection);

if (timeline) {
  new MutationObserver(() => {
    if (activeRow && !activeRow.isConnected) clearJourneySelection();
    makeRowsInteractive();
  }).observe(timeline, { childList: true, subtree: true });
}

makeRowsInteractive();
