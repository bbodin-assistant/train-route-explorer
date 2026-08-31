const aboutButton = document.querySelector("#about-button");
const aboutPanel = document.querySelector("#about-panel");
const toolbarMenus = Array.from(document.querySelectorAll(".toolbar-menu"));
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
}

function closeAbout() {
  if (!aboutPanel || !aboutButton) return;
  aboutPanel.hidden = true;
  aboutButton.setAttribute("aria-expanded", "false");
}

function toggleAbout() {
  if (!aboutPanel || !aboutButton) return;
  const shouldOpen = aboutPanel.hidden;
  for (const menu of toolbarMenus) menu.open = false;
  aboutPanel.hidden = !shouldOpen;
  aboutButton.setAttribute("aria-expanded", String(shouldOpen));
}

detachDrawersFromHeader();

aboutButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAbout();
});

aboutPanel?.addEventListener("click", (event) => event.stopPropagation());

for (const menu of toolbarMenus) {
  menu.addEventListener("toggle", () => {
    syncMenuPanel(menu);
    if (menu.open) closeAbout();
  });
}

document.addEventListener("click", closeAbout);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAbout();
});
