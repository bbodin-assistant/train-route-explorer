const timeline = document.querySelector("#routes-time-chart");
const directionTabs = document.querySelector("#route-direction-tabs");
const detailFrame = document.querySelector("#train-detail-frame");

const switchToggleStyle = document.createElement("style");
switchToggleStyle.textContent = `
  .timeline-sticky-head {
    padding-top: 6px !important;
  }

  #train-detail-frame:not(.journey-detail-frame) .detail-stop:not(.context) i {
    border-color: var(--detail-train-color, #2563eb);
  }

  #train-detail-frame:not(.journey-detail-frame) .detail-stop:not(.context) i::after {
    background: var(--detail-train-color, #2563eb);
  }

  @media (max-width: 900px) {
    .route-settings-menu summary::after {
      content: none !important;
      display: none !important;
    }

    main {
      height: calc(100vh - var(--header-height));
      height: calc(100dvh - var(--header-height));
      display: flex;
      flex-direction: column;
    }

    .timetable-shell {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .timetable-toolbar {
      flex: 0 0 auto;
    }

    .timeline {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    .timeline-empty {
      min-height: 100%;
    }

    .timeline-load-more {
      position: sticky;
      left: 0;
      width: calc(100vw - 16px);
      min-width: 0;
      justify-content: center;
    }

    .timeline-sticky-meta {
      position: sticky;
      left: 0;
      width: calc(100vw - 16px);
      min-width: 0;
      grid-template-columns: 150px minmax(0, 1fr);
      z-index: 15;
    }

    .timeline-sticky-meta .timeline-legend {
      min-width: 0 !important;
      margin: 0 !important;
      padding: 3px 6px 3px 8px !important;
      justify-content: flex-start;
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .timeline-sticky-meta .timeline-legend::-webkit-scrollbar {
      display: none;
    }

    .timeline-sticky-meta .timeline-legend-item {
      flex: 0 0 auto;
    }
  }
`;
document.head.append(switchToggleStyle);

function installDirectionToggle() {
  const switchElement = timeline?.querySelector(".timeline-direction-switch");
  if (!switchElement || switchElement.dataset.toggleBehavior === "true") return;

  switchElement.dataset.toggleBehavior = "true";
  switchElement.title = "Toggle journey direction";
  switchElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-proxy-tab]");
    if (!button || !directionTabs) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const activeTab = directionTabs.querySelector("[data-tab].selected")?.dataset.tab || "out";
    const nextTab = activeTab === "out" ? "back" : "out";
    directionTabs.querySelector(`[data-tab="${nextTab}"]`)?.click();
  }, true);
}

function syncClickedTrainColor(event) {
  const bar = event.target.closest(".timeline-bar.train");
  if (!bar || !detailFrame) return;
  const color = bar.style.getPropertyValue("--train-color").trim();
  if (color) detailFrame.style.setProperty("--detail-train-color", color);
}

if (timeline) {
  timeline.addEventListener("click", syncClickedTrainColor, true);
  new MutationObserver(installDirectionToggle).observe(timeline, {
    childList: true,
    subtree: true,
  });
}

installDirectionToggle();
