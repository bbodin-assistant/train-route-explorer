const routeSettings = document.querySelector(".route-settings-menu");
const dataMenu = document.querySelector(".data-menu");
const routeConfig = document.querySelector("#route-config-controls");
const directionTabs = document.querySelector("#route-direction-tabs");

function selectedStationNames(role) {
  return Array.from(
    document.querySelectorAll(`.station-picker[data-role="${role}"] input[type="checkbox"]:checked`),
    (input) => input.value,
  );
}

function compactStationNames(values) {
  if (!values.length) return "None";
  if (values.length <= 2) return values.join(" / ");
  return `${values[0]} / ${values[1]} +${values.length - 2}`;
}

function updateRouteSummary() {
  for (const value of document.querySelectorAll("[data-route-value]")) {
    value.textContent = compactStationNames(selectedStationNames(value.dataset.routeValue));
  }
}

function syncDirectionPressedState() {
  if (!directionTabs) return;
  for (const button of directionTabs.querySelectorAll("[data-tab]")) {
    button.setAttribute("aria-pressed", String(button.classList.contains("selected")));
  }
}

function openRouteSettings(role) {
  if (!routeSettings) return;
  if (dataMenu) dataMenu.open = false;
  routeSettings.open = true;

  requestAnimationFrame(() => {
    const target = document.querySelector(`.station-picker[data-role="${role}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.classList.add("configuration-target");
    window.setTimeout(() => target.classList.remove("configuration-target"), 900);
  });
}

for (const button of document.querySelectorAll("[data-route-role]")) {
  button.addEventListener("click", () => openRouteSettings(button.dataset.routeRole));
}

for (const menu of document.querySelectorAll(".toolbar-menu")) {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    for (const other of document.querySelectorAll(".toolbar-menu")) {
      if (other !== menu) other.open = false;
    }
  });
}

routeConfig?.addEventListener("change", updateRouteSummary);
directionTabs?.addEventListener("click", () => requestAnimationFrame(syncDirectionPressedState));

if (routeConfig) {
  new MutationObserver(updateRouteSummary).observe(routeConfig, {
    childList: true,
    subtree: true,
  });
}

if (directionTabs) {
  new MutationObserver(syncDirectionPressedState).observe(directionTabs, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class"],
  });
}

updateRouteSummary();
syncDirectionPressedState();
