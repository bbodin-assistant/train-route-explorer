const timeline = document.querySelector("#routes-time-chart");
const STORAGE_KEY = "train-route-explorer-refresh-durations-v1";
const MAX_SAMPLES = 5;
const FIRST_RUN_LOW_SECONDS = 5;
const FIRST_RUN_HIGH_SECONDS = 20;

const refreshWaitStyle = document.createElement("style");
refreshWaitStyle.textContent = `
  .refresh-notice .refresh-wait-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
    text-align: left;
  }

  .refresh-notice .refresh-wait-title {
    color: #39444d;
    font-size: 12px;
    font-weight: 800;
  }

  .refresh-notice .refresh-wait-meta {
    color: #747e85;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
`;
document.head.append(refreshWaitStyle);

let activeNotice = null;
let refreshStartedAt = 0;
let refreshTimer = null;

function storedDurations() {
  try {
    const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(values)
      ? values.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value < 300).slice(-MAX_SAMPLES)
      : [];
  } catch {
    return [];
  }
}

function storeDuration(seconds) {
  const samples = [...storedDurations(), seconds].slice(-MAX_SAMPLES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Storage may be unavailable; estimates simply remain first-run estimates.
  }
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function learnedEstimate() {
  const value = median(storedDurations());
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : null;
}

function elapsedSeconds() {
  if (!refreshStartedAt) return 0;
  return Math.max(0, Math.floor((performance.now() - refreshStartedAt) / 1000));
}

function waitMessage(elapsed) {
  const estimate = learnedEstimate();
  if (estimate === null) {
    if (elapsed <= FIRST_RUN_HIGH_SECONDS) {
      return `First estimate: usually ${FIRST_RUN_LOW_SECONDS}–${FIRST_RUN_HIGH_SECONDS} s · ${elapsed} s elapsed`;
    }
    return `Still working · ${elapsed} s elapsed · first refresh can take longer`;
  }

  const remaining = Math.max(0, estimate - elapsed);
  if (remaining > 0) {
    return `About ${remaining} s remaining · ${elapsed} s elapsed · based on recent refreshes`;
  }
  return `Still working · ${elapsed} s elapsed · recent refreshes took about ${estimate} s`;
}

function updateNotice() {
  if (!activeNotice?.isConnected) return;
  const meta = activeNotice.querySelector(".refresh-wait-meta");
  if (meta) meta.textContent = waitMessage(elapsedSeconds());
}

function startNotice(notice) {
  if (activeNotice === notice) return;
  if (refreshTimer !== null) window.clearInterval(refreshTimer);

  activeNotice = notice;
  refreshStartedAt = performance.now();
  notice.dataset.waitEstimate = "true";
  notice.innerHTML = `
    <span class="route-refresh-spinner" aria-hidden="true"></span>
    <span class="refresh-wait-copy">
      <span class="refresh-wait-title">Route settings changed. Refreshing routes automatically…</span>
      <span class="refresh-wait-meta">${waitMessage(0)}</span>
    </span>
  `;
  refreshTimer = window.setInterval(updateNotice, 1000);
}

function finishNotice(successful) {
  if (!activeNotice) return;
  if (successful && refreshStartedAt) {
    const duration = Math.max(1, (performance.now() - refreshStartedAt) / 1000);
    storeDuration(Math.round(duration * 10) / 10);
  }
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  refreshTimer = null;
  activeNotice = null;
  refreshStartedAt = 0;
}

function syncRefreshNotice() {
  if (!timeline) return;
  const notice = timeline.querySelector(".refresh-notice");
  if (notice) {
    startNotice(notice);
    return;
  }

  if (activeNotice) {
    const successful = Boolean(timeline.querySelector(".timeline-day-group, #timeline-load-more"));
    finishNotice(successful);
  }
}

if (timeline) {
  new MutationObserver(syncRefreshNotice).observe(timeline, {
    childList: true,
    subtree: true,
  });
  syncRefreshNotice();
}
