const timeline = document.querySelector("#routes-time-chart");
const routeSettings = document.querySelector(".route-settings-menu");
const routeSettingsPanel = document.querySelector(".route-settings-panel");
const trainTypePicker = document.querySelector('.option-picker[data-role="train_types"]');
const trainTypeFilter = document.querySelector("#train-type-filter");

const legendConfigStyle = document.createElement("style");
legendConfigStyle.textContent = `
  .timeline-legend.legend-config-trigger {
    position: relative;
    padding-right: 28px !important;
    border-radius: 4px;
    cursor: pointer;
    transition: background 120ms ease, box-shadow 120ms ease;
  }

  .timeline-legend.legend-config-trigger::after {
    content: "▾";
    position: absolute;
    top: 50%;
    right: 9px;
    color: #7a848b;
    font-size: 10px;
    transform: translateY(-50%);
    transition: transform 120ms ease;
  }

  .timeline-legend.legend-config-trigger:hover,
  .timeline-legend.legend-config-trigger:focus-visible,
  .timeline-legend.legend-config-trigger[aria-expanded="true"] {
    background: #f1f3ef !important;
    box-shadow: inset 0 0 0 1px #d4d9d5;
    outline: none;
  }

  .timeline-legend.legend-config-trigger[aria-expanded="true"]::after {
    transform: translateY(-50%) rotate(180deg);
  }

  .route-settings-panel .option-picker[data-role="train_types"].legend-config-focus {
    border-color: #9fa8ad !important;
    background: #fff !important;
    box-shadow: 0 0 0 2px rgba(73, 88, 99, 0.08);
  }
`;
document.head.append(legendConfigStyle);

if (routeSettingsPanel && !routeSettingsPanel.id) {
  routeSettingsPanel.id = "train-type-settings-panel";
}

let focusTimer = null;

function currentLegends() {
  return Array.from(timeline?.querySelectorAll(".timeline-legend") || []);
}

function syncLegendState() {
  const expanded = Boolean(routeSettings?.open);
  for (const legend of currentLegends()) {
    legend.setAttribute("aria-expanded", String(expanded));
  }
}

function focusTrainTypeConfig() {
  if (!trainTypePicker) return;
  trainTypePicker.classList.add("legend-config-focus");
  trainTypePicker.scrollIntoView({ block: "nearest" });
  requestAnimationFrame(() => trainTypeFilter?.focus({ preventScroll: true }));

  if (focusTimer !== null) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    trainTypePicker.classList.remove("legend-config-focus");
    focusTimer = null;
  }, 900);
}

function toggleTrainTypeSettings() {
  if (!routeSettings) return;
  const shouldOpen = !routeSettings.open;
  routeSettings.open = shouldOpen;
  syncLegendState();
  if (shouldOpen) requestAnimationFrame(focusTrainTypeConfig);
}

function installLegendConfigTrigger() {
  for (const legend of currentLegends()) {
    if (legend.dataset.trainTypeConfigReady === "true") continue;
    legend.dataset.trainTypeConfigReady = "true";
    legend.classList.add("legend-config-trigger");
    legend.setAttribute("role", "button");
    legend.tabIndex = 0;
    legend.setAttribute("aria-label", "Train type legend. Open train type settings.");
    if (routeSettingsPanel?.id) legend.setAttribute("aria-controls", routeSettingsPanel.id);
    legend.setAttribute("aria-expanded", String(Boolean(routeSettings?.open)));
    legend.title = "Configure train types";

    legend.addEventListener("click", (event) => {
      event.preventDefault();
      toggleTrainTypeSettings();
    });

    legend.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleTrainTypeSettings();
    });
  }
}

let installFrame = null;
function scheduleLegendInstall() {
  if (installFrame !== null) return;
  installFrame = requestAnimationFrame(() => {
    installFrame = null;
    installLegendConfigTrigger();
    syncLegendState();
  });
}

routeSettings?.addEventListener("toggle", () => {
  syncLegendState();
  if (routeSettings.open && document.activeElement?.closest(".timeline-legend")) {
    requestAnimationFrame(focusTrainTypeConfig);
  }
});

if (timeline) {
  new MutationObserver(scheduleLegendInstall).observe(timeline, {
    childList: true,
    subtree: true,
  });
}

scheduleLegendInstall();
