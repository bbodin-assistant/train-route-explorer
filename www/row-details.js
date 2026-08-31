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
    height: 38px !important;
    background: var(--journey-line-color, #2563eb) !important;
  }

  .journey-detail-stop.transfer i {
    border-color: #a16207 !important;
    background: #fff8df !important;
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

  .journey-detail-transfer {
    color: #8a6514;
    font-weight: 800;
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

function buildJourneyNodes(data) {
  const nodes = [];

  data.legs.forEach((entry, legIndex) => {
    const { leg, color } = entry;
    const stops = stopListForLeg(leg);

    stops.forEach((stop, stopIndex) => {
      const station = String(stop.stop_name || "—");
      const isFirstStop = stopIndex === 0;
      const isLastStop = stopIndex === stops.length - 1;
      const previousNode = nodes.at(-1);

      if (legIndex > 0 && isFirstStop && previousNode?.station === station) {
        const previousLeg = data.legs[legIndex - 1].leg;
        const wait = transferMinutes(previousLeg, leg);
        previousNode.departureTime = stop.departure_time || leg.departure_time || previousNode.departureTime;
        previousNode.isTransfer = true;
        previousNode.transferWait = wait;
        previousNode.nextService = serviceLabel(leg);
        previousNode.lineColor = color;
        return;
      }

      nodes.push({
        station,
        arrivalTime: stop.arrival_time || (isLastStop ? leg.arrival_time : ""),
        departureTime: stop.departure_time || (isFirstStop ? leg.departure_time : ""),
        isTransfer: false,
        transferWait: null,
        service: isFirstStop ? serviceLabel(leg) : "",
        nextService: "",
        nodeColor: color,
        lineColor: color,
      });
    });
  });

  return nodes;
}

function nodeTime(node) {
  const arrival = String(node.arrivalTime || "").trim();
  const departure = String(node.departureTime || "").trim();
  if (arrival && departure && arrival !== departure) return `${arrival} / ${departure}`;
  return departure || arrival || "—";
}

function nodeNote(node) {
  if (node.isTransfer) {
    const wait = Number.isFinite(node.transferWait) ? `${node.transferWait} min` : "change";
    const next = node.nextService ? ` · ${escapeText(node.nextService)}` : "";
    return `<span class="journey-detail-note journey-detail-transfer">Change ${escapeText(wait)}${next}</span>`;
  }
  if (node.service) {
    return `<span class="journey-detail-note journey-detail-service">${escapeText(node.service)}</span>`;
  }
  return "";
}

function journeyStopsHtml(nodes) {
  return nodes.map((node) => `
    <div class="detail-stop journey-detail-stop${node.isTransfer ? " transfer" : ""}" style="--journey-node-color:${escapeText(node.nodeColor)};--journey-line-color:${escapeText(node.lineColor)}">
      <span>${escapeText(nodeTime(node))}</span>
      <i aria-hidden="true"></i>
      <div>
        <strong>${escapeText(node.station)}</strong>
        ${nodeNote(node)}
      </div>
    </div>
  `).join("");
}

function clearJourneySelection() {
  if (activeRow) {
    activeRow.classList.remove("is-journey-open");
    activeRow.setAttribute("aria-expanded", "false");
  }
  activeRow = null;
  detailFrame?.classList.remove("journey-detail-frame");
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

  const nodes = buildJourneyNodes(data);
  if (!nodes.length) return;

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
      ${journeyStopsHtml(nodes)}
    </div>
  `;
  detailFrame.hidden = false;
  detailLayer.hidden = false;
  positionJourneyFrame(row);
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
