const aboutButton = document.querySelector("#about-button");
const aboutPanel = document.querySelector("#about-panel");
const toolbarMenus = Array.from(document.querySelectorAll(".toolbar-menu"));

const panelStyle = document.createElement("style");
panelStyle.textContent = `
  .header-tools .toolbar-menu > .drawer-panel {
    position: fixed !important;
    top: calc(var(--header-height) + 8px) !important;
    right: 12px !important;
    bottom: 12px !important;
    left: auto !important;
    height: auto !important;
    max-height: none !important;
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

  .header-tools .route-settings-menu > .route-settings-panel {
    width: min(620px, calc(100vw - 24px)) !important;
  }

  .header-tools .data-menu > .data-panel {
    width: min(520px, calc(100vw - 24px)) !important;
  }

  .header-tools .drawer-heading {
    top: -18px !important;
    margin: -18px 0 16px !important;
    padding: 18px 2px 14px !important;
  }

  .header-tools .route-settings-panel .option-checklist {
    height: min(300px, 42vh) !important;
  }

  .header-tools .time-config-panel {
    gap: 12px !important;
    margin-top: 16px !important;
  }

  .header-tools .data-panel .source-panel {
    gap: 20px !important;
  }

  .header-tools .data-panel .server-source,
  .header-tools .data-panel .upload-source {
    padding: 14px !important;
    border: 1px solid #d3d8d4 !important;
    background: #fff !important;
  }

  .header-tools .data-panel .server-source {
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

  @media (max-width: 900px) {
    .header-tools .toolbar-menu > .drawer-panel {
      top: calc(var(--header-height) + 8px) !important;
      right: 8px !important;
      bottom: 8px !important;
      left: 8px !important;
      width: auto !important;
      max-width: none !important;
    }

    .about-panel {
      top: calc(var(--header-height) + 8px);
      right: 8px;
      left: 8px;
      width: auto;
    }
  }
`;
document.head.append(panelStyle);

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

aboutButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAbout();
});

aboutPanel?.addEventListener("click", (event) => event.stopPropagation());

for (const menu of toolbarMenus) {
  menu.addEventListener("toggle", () => {
    if (menu.open) closeAbout();
  });
}

document.addEventListener("click", closeAbout);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAbout();
});
