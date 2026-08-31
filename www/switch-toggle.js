const timeline = document.querySelector("#routes-time-chart");
const directionTabs = document.querySelector("#route-direction-tabs");

const switchToggleStyle = document.createElement("style");
switchToggleStyle.textContent = `
  .timeline-sticky-head {
    padding-top: 6px !important;
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
