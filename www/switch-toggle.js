const timeline = document.querySelector("#routes-time-chart");
const detailFrame = document.querySelector("#train-detail-frame");

const switchToggleStyle = document.createElement("style");
switchToggleStyle.textContent = `
  .timeline-sticky-head {
    padding-top: 6px !important;
  }

  .tab-buttons button.selected::after {
    content: none !important;
    display: none !important;
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

    .app-header > .day-control {
      width: auto !important;
      max-width: 100%;
      justify-content: center;
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
      grid-template-columns: 108px minmax(0, 1fr);
      z-index: 15;
    }

    .timeline-sticky-meta .timeline-legend {
      min-width: 0 !important;
      margin: 0 !important;
      padding: 3px 6px 3px 10px !important;
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

    .timeline-sticky-meta .timeline-legend-item:first-child {
      margin-left: auto;
    }

    .timeline-day-heading {
      position: sticky !important;
      top: 66px !important;
      left: 0 !important;
      z-index: 13 !important;
    }
  }
`;
document.head.append(switchToggleStyle);

function syncLegendLabels() {
  for (const item of timeline?.querySelectorAll(".timeline-legend-item") || []) {
    const textNode = Array.from(item.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) continue;
    if (textNode.textContent.trim() === "OUIGO Grande Vitesse") {
      textNode.textContent = "TGV OUIGO";
    }
  }
}

function syncClickedTrainColor(event) {
  const bar = event.target.closest(".timeline-bar.train");
  if (!bar || !detailFrame) return;
  const color = bar.style.getPropertyValue("--train-color").trim();
  if (color) detailFrame.style.setProperty("--detail-train-color", color);
}

if (timeline) {
  timeline.addEventListener("click", syncClickedTrainColor, true);
  new MutationObserver(syncLegendLabels).observe(timeline, {
    childList: true,
    subtree: true,
  });
}

syncLegendLabels();