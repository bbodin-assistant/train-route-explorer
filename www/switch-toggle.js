const timeline = document.querySelector("#routes-time-chart");
const directionTabs = document.querySelector("#route-direction-tabs");

const switchToggleStyle = document.createElement("style");
switchToggleStyle.textContent = `
  .timeline-sticky-head {
    padding-top: 6px !important;
  }

  @media (max-width: 900px) {
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

if (timeline) {
  new MutationObserver(installDirectionToggle).observe(timeline, {
    childList: true,
    subtree: true,
  });
}

installDirectionToggle();
