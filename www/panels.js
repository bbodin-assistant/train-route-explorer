const aboutButton = document.querySelector("#about-button");
const aboutPanel = document.querySelector("#about-panel");
const toolbarMenus = Array.from(document.querySelectorAll(".toolbar-menu"));
const dataMenu = document.querySelector(".data-menu");
const dataPanel = document.querySelector(".data-panel");
const status = document.querySelector("#cache-status");
const menuPanels = new Map();

const panelStyle = document.createElement("style");
panelStyle.textContent = `
  .floating-drawer {
    position: fixed !important;
    top: calc(var(--header-height) + 8px) !important;
    right: 12px !important;
    bottom: auto !important;
    left: auto !important;
    height: calc(100vh - var(--header-height) - 20px) !important;
    min-height: 420px !important;
    max-height: calc(100vh - var(--header-height) - 20px) !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: 18px !important;
    border: 1px solid #b9c0c3 !important;
    background: #f7f7f3 !important;
    box-shadow: 0 18px 42px rgba(26, 34, 42, 0.24) !important;
    z-index: 70 !important;
    transform: none !important;
  }

  .floating-drawer[hidden] { display: none !important; }

  .floating-drawer.route-settings-panel {
    width: min(620px, calc(100vw - 24px)) !important;
  }

  .floating-drawer.data-panel {
    width: min(520px, calc(100vw - 24px)) !important;
  }

  .floating-drawer .drawer-heading {
    top: -18px !important;
    margin: -18px 0 16px !important;
    padding: 18px 2px 14px !important;
  }

  .floating-drawer.route-settings-panel .option-checklist {
    height: min(300px, 42vh) !important;
  }

  .floating-drawer .time-config-panel {
    gap: 12px !important;
    margin-top: 16px !important;
  }

  .floating-drawer.data-panel .source-panel {
    gap: 20px !important;
  }

  .floating-drawer.data-panel .server-source,
  .floating-drawer.data-panel .upload-source {
    padding: 14px !important;
    border: 1px solid #d3d8d4 !important;
    background: #fff !important;
  }

  .floating-drawer.data-panel .server-source {
    border-bottom: 1px solid #d3d8d4 !important;
  }

  .header-tools .data-menu > summary {
    display: none !important;
  }

  #cache-status {
    min-height: 32px;
    max-width: 132px !important;
    padding: 5px 8px !important;
    border: 1px solid #cfd5d2;
    border-radius: 4px;
    background: #f8f8f5;
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
  }

  #cache-status:hover,
  #cache-status:focus-visible,
  #cache-status[aria-expanded="true"] {
    border-color: #aeb6ba;
    background: #fff;
    box-shadow: 0 1px 2px rgba(24, 32, 42, 0.08);
    outline: none;
  }

  #cache-status[aria-expanded="true"] {
    border-color: #28323c;
    box-shadow: inset 0 0 0 1px #28323c;
  }

  #cache-status-text {
    text-decoration: underline;
    text-decoration-color: #b7bec1;
    text-underline-offset: 2px;
  }

  #cache-status:hover #cache-status-text,
  #cache-status:focus-visible #cache-status-text {
    text-decoration-color: currentColor;
  }

  #cache-status progress {
    left: 8px !important;
    right: 8px !important;
    bottom: 1px !important;
    width: calc(100% - 16px) !important;
  }

  .about-panel {
    position: fixed;
    top: calc(var(--header-height) + 8px);
    right: 12px;
    z-index: 80;
    width: min(380px, calc(100vw - 24px));
    padding: 16px;
    border: 1px solid #b9c0c3;
    border-radius: 6px;
    background: #fffef9;
    color: #26313a;
    box-shadow: 0 16px 38px rgba(26, 34, 42, 0.22);
  }

  .about-panel[hidden] { display: none; }

  .about-panel strong {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .about-panel p {
    margin: 0 0 14px;
    color: #5e6870;
    font-size: 12px;
    line-height: 1.55;
  }

  .about-panel a {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 5px 9px;
    border: 1px solid #c2c8ca;
    border-radius: 4px;
    background: #f8f8f5;
    color: #35404a;
    font-size: 11px;
    font-weight: 750;
    text-decoration: none;
  }

  .about-panel a:hover {
    border-color: #aeb6ba;
    background: #f0f2ef;
  }

  #about-button[aria-expanded="true"] {
    border-color: #28323c;
    background: #28323c;
    color: #fff;
  }

  @supports (height: 100dvh) {
    .floating-drawer {
      height: calc(100dvh - var(--header-height) - 20px) !important;
      max-height: calc(100dvh - var(--header-height) - 20px) !important;
    }
  }

  @media (max-width: 900px) {
    .floating-drawer {
      top: calc(var(--header-height) + 8px) !important;
      right: 8px !important;
      left: 8px !important;
      width: auto !important;
      min-height: 0 !important;
      height: calc(100vh - var(--header-height) - 16px) !important;
      max-height: calc(100vh - var(--header-height) - 16px) !important;
    }

    #cache-status {
      max-width: 30px !important;
      padding-inline: 7px !important;
    }

    .about-panel {
      top: calc(var(--header-height) + 8px);
      right: 8px;
      left: 8px;
      width: auto;
    }

    @supports (height: 100dvh) {
      .floating-drawer {
        height: calc(100dvh - var(--header-height) - 16px) !important;
        max-height: calc(100dvh - var(--header-height) - 16px) !important;
      }
    }
  }
`;
document.head.append(panelStyle);

function detachDrawersFromHeader() {
  for (const menu of toolbarMenus) {
    const panel = menu.querySelector(":scope > .drawer-panel");
    if (!panel) continue;
    menuPanels.set(menu, panel);
    panel.classList.add("floating-drawer");
    panel.hidden = !menu.open;
    document.body.append(panel);
  }
}

function syncMenuPanel(menu) {
  const panel = menuPanels.get(menu);
  if (panel) panel.hidden = !menu.open;
  if (menu === dataMenu && status) {
    status.setAttribute("aria-expanded", String(menu.open));
  }
}

function closeToolbarMenus(exceptMenu = null) {
  for (const menu of toolbarMenus) {
    if (menu !== exceptMenu && menu.open) menu.open = false;
  }
}

function closeAbout() {
  if (!aboutPanel || !aboutButton) return;
  aboutPanel.hidden = true;
  aboutButton.setAttribute("aria-expanded", "false");
}

function toggleAbout() {
  if (!aboutPanel || !aboutButton) return;
  const shouldOpen = aboutPanel.hidden;
  closeToolbarMenus();
  aboutPanel.hidden = !shouldOpen;
  aboutButton.setAttribute("aria-expanded", String(shouldOpen));
}

function toggleDataMenu() {
  if (!dataMenu) return;
  const shouldOpen = !dataMenu.open;
  closeAbout();
  closeToolbarMenus(dataMenu);
  dataMenu.open = shouldOpen;
  syncMenuPanel(dataMenu);
}

function isToolbarMenuInteraction(target) {
  if (!(target instanceof Element)) return false;
  if (status?.contains(target)) return true;
  if (target.closest(".timeline-legend.legend-config-trigger")) return true;

  for (const menu of toolbarMenus) {
    if (menu.contains(target)) return true;
    if (menuPanels.get(menu)?.contains(target)) return true;
  }
  return false;
}

detachDrawersFromHeader();

if (dataPanel && !dataPanel.id) dataPanel.id = "data-source-panel";
if (status) {
  status.setAttribute("role", "button");
  status.tabIndex = 0;
  status.setAttribute("aria-label", "Open timetable data settings");
  status.setAttribute("aria-controls", dataPanel?.id || "data-source-panel");
  status.setAttribute("aria-expanded", String(Boolean(dataMenu?.open)));
  status.title = "Open data settings";
}

aboutButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAbout();
});

aboutPanel?.addEventListener("click", (event) => event.stopPropagation());

status?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDataMenu();
});

status?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggleDataMenu();
});

for (const menu of toolbarMenus) {
  menu.addEventListener("toggle", () => {
    syncMenuPanel(menu);
    if (menu.open) {
      closeAbout();
      closeToolbarMenus(menu);
    }
  });
}

document.addEventListener("click", (event) => {
  closeAbout();
  if (!isToolbarMenuInteraction(event.target)) closeToolbarMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeAbout();
  closeToolbarMenus();
});
