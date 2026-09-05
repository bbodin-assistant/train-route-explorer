const status = document.querySelector("#cache-status");

const uiPolishStyle = document.createElement("style");
uiPolishStyle.textContent = `
  .header-tools #cache-status,
  .header-tools .route-settings-menu > summary,
  .header-tools #about-button {
    width: 72px !important;
    min-width: 72px !important;
    max-width: 72px !important;
    height: 32px !important;
    min-height: 32px !important;
    padding: 0 8px !important;
    box-sizing: border-box !important;
  }

  .header-tools .route-settings-menu > summary,
  .header-tools #about-button {
    align-items: center !important;
    justify-content: center !important;
    text-align: center;
  }

  .header-tools #cache-status {
    display: grid !important;
    grid-template-columns: 8px max-content !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
  }

  #cache-status-text {
    display: none !important;
  }

  #cache-status::after {
    content: "Idle";
    color: #6d7680;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
  }

  #cache-status.ready::after { content: "Ready"; color: #23633a; }
  #cache-status.loading::after { content: "Loading"; color: #8a5d0d; font-size: 9px; }
  #cache-status.error::after { content: "Error"; color: #9f2d2d; }

  .time-config-panel label:has(#config-max-transfer-count) .input-with-unit,
  .time-config-panel label:has(#config-max-duration-hours) .input-with-unit {
    grid-template-columns: 64px max-content !important;
    justify-content: start;
  }

  #config-max-transfer-count,
  #config-max-duration-hours {
    width: 64px !important;
    max-width: 64px !important;
  }

  @media (max-width: 900px) {
    .header-tools #cache-status,
    .header-tools .route-settings-menu > summary,
    .header-tools #about-button {
      width: 58px !important;
      min-width: 58px !important;
      max-width: 58px !important;
      height: 30px !important;
      min-height: 30px !important;
      padding: 0 5px !important;
    }

    .header-tools #cache-status {
      grid-template-columns: 8px max-content !important;
      gap: 4px !important;
    }

    #cache-status::after,
    #cache-status.ready::after,
    #cache-status.error::after {
      font-size: 9px;
    }

    #cache-status.loading::after { font-size: 8px; }
  }
`;
document.head.append(uiPolishStyle);

function statusWord() {
  if (status?.classList.contains("ready")) return "Ready";
  if (status?.classList.contains("loading")) return "Loading";
  if (status?.classList.contains("error")) return "Error";
  return "Idle";
}

function syncStatusAccessibility() {
  if (!status) return;
  const word = statusWord();
  status.dataset.statusWord = word;
  status.setAttribute("aria-label", `Data ${word.toLowerCase()}. Open timetable data settings`);
}

if (status) {
  new MutationObserver(syncStatusAccessibility).observe(status, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncStatusAccessibility();
}
