const timeline = document.querySelector("#routes-time-chart");

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

  .timeline-row.is-expanded {
    background: rgba(246, 196, 69, 0.075);
    box-shadow: inset 3px 0 #d4a51d;
  }

  .timeline-row-summary {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1.2fr);
    gap: 10px 16px;
    align-items: center;
    padding: 8px 14px 10px;
    border-top: 1px solid #e5e7e3;
    background: rgba(255, 254, 249, 0.96);
    color: #39434b;
    cursor: default;
  }

  .timeline-row-summary[hidden] { display: none; }

  .trip-summary-endpoint {
    min-width: 0;
  }

  .trip-summary-endpoint:last-child {
    text-align: right;
  }

  .trip-summary-kicker {
    display: block;
    margin-bottom: 2px;
    color: #8a9296;
    font-size: 8px;
    font-weight: 850;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .trip-summary-time {
    margin-right: 7px;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    font-weight: 850;
    font-variant-numeric: tabular-nums;
  }

  .trip-summary-station {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 650;
  }

  .trip-summary-middle {
    min-width: 130px;
    text-align: center;
  }

  .trip-summary-duration {
    display: block;
    margin-bottom: 3px;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    font-weight: 850;
  }

  .trip-summary-transfer-count {
    color: #7a8389;
    font-size: 9px;
    font-weight: 700;
  }

  .trip-summary-steps {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    padding-top: 1px;
  }

  .trip-summary-leg,
  .trip-summary-transfer {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 3px 6px;
    border: 1px solid #d9ddda;
    border-radius: 3px;
    background: #fff;
    font-size: 9px;
    font-weight: 750;
    white-space: nowrap;
  }

  .trip-summary-leg strong {
    margin-left: 4px;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-weight: 850;
  }

  .trip-summary-transfer {
    border-style: dashed;
    color: #7b7060;
    background: #fbf8ef;
  }

  @media (max-width: 700px) {
    .timeline-row-summary {
      grid-template-columns: 1fr 1fr;
    }

    .trip-summary-middle {
      grid-column: 1 / -1;
      grid-row: 2;
      text-align: left;
    }

    .trip-summary-endpoint:last-child {
      text-align: right;
    }

    .trip-summary-steps {
      grid-row: 3;
    }
  }
`;
document.head.append(rowInteractionStyle);

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

function rowJourneyData(row) {
  const trainBars = Array.from(row.querySelectorAll(".timeline-bar.train"));
  const legs = trainBars.map(decodeLeg).filter(Boolean);
  if (!legs.length) return null;

  const transferBars = Array.from(row.querySelectorAll(".timeline-bar.transfer"));
  const duration = row.querySelector(".timeline-label-duration")?.textContent.replace(/[()]/g, "").trim() || "—";

  return { legs, transferBars, duration };
}

function serviceLabel(leg) {
  const type = String(leg.train_type || "Train").trim();
  const number = String(leg.train_number || "").trim();
  return { type, number };
}

function summarySteps(data) {
  return data.legs.map((leg, index) => {
    const service = serviceLabel(leg);
    const legChip = `<span class="trip-summary-leg">${escapeText(service.type)}${service.number ? `<strong>${escapeText(service.number)}</strong>` : ""}</span>`;
    const transfer = data.transferBars[index];
    if (!transfer) return legChip;
    const station = leg.destination_stop || "transfer";
    const wait = transfer.textContent.trim() || "transfer";
    return `${legChip}<span class="trip-summary-transfer">${escapeText(wait)} at ${escapeText(station)}</span>`;
  }).join("");
}

function buildSummary(row) {
  const data = rowJourneyData(row);
  if (!data) return null;

  const first = data.legs[0];
  const last = data.legs.at(-1);
  const transfers = Math.max(0, data.legs.length - 1);
  const summary = document.createElement("div");
  summary.className = "timeline-row-summary";
  summary.hidden = true;
  summary.addEventListener("click", (event) => event.stopPropagation());
  summary.innerHTML = `
    <div class="trip-summary-endpoint">
      <span class="trip-summary-kicker">Departure</span>
      <span class="trip-summary-time">${escapeText(first.departure_time || "—")}</span>
      <span class="trip-summary-station">${escapeText(first.departure_stop || "—")}</span>
    </div>
    <div class="trip-summary-middle">
      <span class="trip-summary-duration">${escapeText(data.duration)}</span>
      <span class="trip-summary-transfer-count">${transfers ? `${transfers} transfer${transfers === 1 ? "" : "s"}` : "Direct journey"}</span>
    </div>
    <div class="trip-summary-endpoint">
      <span class="trip-summary-kicker">Arrival</span>
      <span class="trip-summary-time">${escapeText(last.arrival_time || "—")}</span>
      <span class="trip-summary-station">${escapeText(last.destination_stop || "—")}</span>
    </div>
    <div class="trip-summary-steps" aria-label="Journey services">${summarySteps(data)}</div>
  `;
  row.append(summary);
  return summary;
}

function closeOtherRows(exceptRow) {
  for (const row of timeline?.querySelectorAll(".timeline-row.is-expanded") || []) {
    if (row === exceptRow) continue;
    row.classList.remove("is-expanded");
    row.setAttribute("aria-expanded", "false");
    const summary = row.querySelector(":scope > .timeline-row-summary");
    if (summary) summary.hidden = true;
  }
}

function toggleRow(row) {
  let summary = row.querySelector(":scope > .timeline-row-summary");
  if (!summary) summary = buildSummary(row);
  if (!summary) return;

  const opening = summary.hidden;
  closeOtherRows(opening ? row : null);
  summary.hidden = !opening;
  row.classList.toggle("is-expanded", opening);
  row.setAttribute("aria-expanded", String(opening));
}

function makeRowsInteractive() {
  for (const row of timeline?.querySelectorAll(".timeline-row") || []) {
    if (row.dataset.rowInteractive === "true") continue;
    row.dataset.rowInteractive = "true";
    row.tabIndex = 0;
    row.setAttribute("aria-expanded", "false");
    row.setAttribute("aria-label", "Trip row. Press Enter for journey summary.");
  }
}

function isNestedControl(target) {
  return Boolean(target.closest("button, input, select, textarea, a, .timeline-row-summary"));
}

timeline?.addEventListener("click", (event) => {
  const row = event.target.closest(".timeline-row");
  if (!row || isNestedControl(event.target)) return;
  toggleRow(row);
});

timeline?.addEventListener("keydown", (event) => {
  const row = event.target.closest(".timeline-row");
  if (!row || event.target !== row || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  toggleRow(row);
});

if (timeline) {
  new MutationObserver(makeRowsInteractive).observe(timeline, { childList: true, subtree: true });
}

makeRowsInteractive();
