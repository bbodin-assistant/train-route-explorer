export function createTimeline({
  AUTO_REFRESH_DELAY_MS,
  TRAIN_TYPE_COLORS,
  clockLabel,
  els,
  escapeHtml,
  minutesToDuration,
  readConfig,
  saveSettings,
  setBusy,
  state,
  worker,
}) {
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

  function timelineDayLabel(day) {
    const match = String(day || "").match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return day;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  function renderTimeline(itineraries, days = []) {
    if (!itineraries.length && !days.length) {
      els.timeline.innerHTML = `<div class="timeline-empty">No matching connections for this day.</div>`;
      return;
    }
    const { start, end, ticks } = timelineWindow(itineraries);
    const chartDuration = end - start;
    const trainTypeColors = timelineTrainTypeColors(itineraries);
    const medianDuration = medianTripDuration(itineraries);
    const rowForItinerary = (itinerary) => {
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
        <div class="timeline-row" data-day="${escapeHtml(itinerary.date)}">
          <div class="timeline-label">${timelineLabel(itinerary, medianDuration)}</div>
          <div class="timeline-lane">${bars}</div>
        </div>
      `;
    };
    const grouped = new Map(days.map((day) => [day, []]));
    for (const itinerary of itineraries) {
      if (!grouped.has(itinerary.date)) grouped.set(itinerary.date, []);
      grouped.get(itinerary.date).push(itinerary);
    }
    const rows = Array.from(grouped, ([day, dayItineraries]) => `
      <section class="timeline-day-group" data-day="${escapeHtml(day)}">
        <h3 class="timeline-day-heading">${escapeHtml(timelineDayLabel(day))}</h3>
        ${dayItineraries.length
          ? dayItineraries.map(rowForItinerary).join("")
          : '<div class="timeline-day-empty">No matching connections.</div>'}
      </section>
    `).join("");
    const legend = Array.from(trainTypeColors, ([type, color]) => `
      <span class="timeline-legend-item"><i class="timeline-legend-swatch" style="background:${color}"></i>${escapeHtml(type)}</span>
    `).join("");
    const position = (minute) => ((minute - start) / chartDuration) * 100;
    const canLoadMore = Boolean(days.length && days.at(-1) < (state.availableDays?.at(-1) || ""));
    els.timeline.innerHTML = `
      <div class="timeline-legend" aria-label="Train type color legend">${legend}</div>
      <div class="timeline-scale">${ticks.map((minute) => `<span style="left:${position(minute)}%">${clockLabel(minute)}</span>`).join("")}</div>
      <div class="timeline-grid">
        <div class="timeline-grid-lines" aria-hidden="true">${ticks.map((minute) => `<span style="left:${position(minute)}%"></span>`).join("")}</div>
      ${rows}
    </div>
    <div class="timeline-load-more"><button id="timeline-load-more" type="button"${state.routeRequestInFlight || !canLoadMore ? " disabled" : ""}>${canLoadMore ? "Load 3 more days" : "No more days"}</button></div>
  `;
  }

  function renderCurrentTab() {
    if (state.selectedTab === "back") {
      renderTimeline(state.routes.returns || [], state.routes.days || []);
    } else {
      renderTimeline(state.routes.outward || [], state.routes.days || []);
    }
  }

  function renderRoutes(result) {
    state.routes = result;
    renderCurrentTab();
  }


  return {
    renderCurrentTab,
    renderRefreshNotice,
    renderRoutes,
    scheduleRouteRefresh,
    setTimelinePlaceholder,
    showRefreshNotice,
  };
}
