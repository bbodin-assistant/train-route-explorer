import { app } from "./app.js";

const stationPickers = Array.from(document.querySelectorAll('.station-picker[data-role]'));
const routeSummary = document.querySelector('.route-summary');

const stationActionStyle = document.createElement('style');
stationActionStyle.textContent = `
  .station-picker-actions {
    display: flex;
    justify-content: flex-end;
    margin: -2px 0 6px;
  }

  .station-unselect-all {
    min-height: 24px;
    border: 0;
    padding: 2px 4px;
    background: transparent;
    color: #68737a;
    font-size: 10px;
    font-weight: 750;
    text-decoration: underline;
    text-decoration-color: #c5cbca;
    text-underline-offset: 3px;
  }

  .station-unselect-all:hover:not(:disabled) {
    background: transparent;
    color: #26313a;
    text-decoration-color: #8f989d;
  }

  .station-unselect-all:disabled {
    opacity: 0.42;
    cursor: default;
    text-decoration: none;
  }

  .route-selector-actions {
    position: sticky;
    bottom: -8px;
    z-index: 3;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 8px -8px -8px;
    padding: 9px 8px 8px;
    border-top: 1px solid #d9ddda;
    background: #fffef9;
  }

  .route-selector-actions button {
    min-height: 34px;
    font-size: 11px;
    font-weight: 800;
  }

  .route-selector-cancel {
    border-color: #c5cbc8;
    background: #f7f7f3;
    color: #59636a;
  }

  .route-selector-apply {
    border-color: #27323c;
    background: #27323c;
    color: #fff;
  }

  .route-selector-apply:hover:not(:disabled) {
    background: #18222b;
    color: #fff;
  }

  @media (max-width: 900px) {
    .route-selector-actions button {
      min-height: 42px;
      font-size: 12px;
    }
  }
`;
document.head.append(stationActionStyle);

let activeStationEdit = null;
let highlightRenderTimer = null;

function checkedStations(picker) {
  return picker.querySelectorAll('.station-checklist input[type="checkbox"]:checked');
}

function syncUnselectButton(picker) {
  const button = picker.querySelector('.station-unselect-all');
  if (!button) return;
  button.disabled = checkedStations(picker).length === 0;
}

function clearStationFilter(picker) {
  const filter = picker.querySelector('.station-filter');
  if (!filter || !filter.value) return;
  filter.value = '';
  filter.dispatchEvent(new Event('input', { bubbles: true }));
}

function unselectAll(picker, button) {
  clearStationFilter(picker);
  button.disabled = true;

  let safety = 0;
  while (safety < 1000) {
    const selected = picker.querySelector('.station-checklist input[type="checkbox"]:checked');
    if (!selected) break;
    selected.click();
    safety += 1;
  }

  syncUnselectButton(picker);
}

function installStationAction(picker) {
  if (picker.querySelector(':scope > .station-picker-actions')) return;

  const filter = picker.querySelector(':scope > .station-filter');
  if (!filter) return;

  const actions = document.createElement('div');
  actions.className = 'station-picker-actions';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'station-unselect-all';
  button.textContent = 'Unselect all';
  button.setAttribute('aria-label', `Unselect all ${picker.querySelector('legend')?.textContent?.toLowerCase() || 'stations'}`);
  button.addEventListener('click', () => unselectAll(picker, button));

  actions.append(button);
  picker.insertBefore(actions, filter);

  picker.addEventListener('change', () => syncUnselectButton(picker));
  new MutationObserver(() => syncUnselectButton(picker)).observe(picker, {
    childList: true,
    subtree: true,
  });

  syncUnselectButton(picker);
}

function compactStationNames(values) {
  if (!values.length) return 'None';
  if (values.length <= 2) return values.join(' / ');
  return `${values[0]} / ${values[1]} +${values.length - 2}`;
}

function updateRoleSummary(role) {
  const value = document.querySelector(`[data-route-value="${role}"]`);
  if (value) value.textContent = compactStationNames(app.state.config[role] || []);
}

function pickerForRole(role) {
  return document.querySelector(`.station-picker[data-role="${role}"]`);
}

function closeSelector(role) {
  const item = document.querySelector(`.route-summary-item[data-route-item="${role}"]`);
  if (!item) return;
  const panel = item.querySelector('.route-selector-panel');
  const button = item.querySelector('[data-route-role]');
  if (panel) panel.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function sameStations(left, right) {
  return left.length === right.length && left.every((station, index) => station === right[index]);
}

function beginStationEdit(role) {
  if (activeStationEdit?.role === role) return;
  if (activeStationEdit) cancelStationEdit(false);
  activeStationEdit = {
    role,
    stations: [...(app.state.config[role] || [])],
  };
}

function cancelStationEdit(close = true) {
  if (!activeStationEdit) return;
  const { role, stations } = activeStationEdit;
  activeStationEdit = null;
  app.state.config[role] = [...stations];
  app.saveSettings();

  const picker = pickerForRole(role);
  const filterValue = picker?.querySelector('.station-filter')?.value || '';
  app.renderStationPicker(role, app.state.context?.station_names || [], app.state.config, filterValue);
  updateRoleSummary(role);
  if (picker) syncUnselectButton(picker);
  if (close) closeSelector(role);
}

function applyStationEdit() {
  if (!activeStationEdit) return;
  const { role, stations } = activeStationEdit;
  const currentStations = [...(app.state.config[role] || [])];
  activeStationEdit = null;
  closeSelector(role);

  if (sameStations(stations, currentStations)) {
    app.saveSettings();
    return;
  }

  app.saveSettings();
  app.showRefreshNotice();
}

function installSelectorActions() {
  for (const panel of document.querySelectorAll('.route-selector-panel')) {
    if (panel.querySelector(':scope > .route-selector-actions')) continue;

    const actions = document.createElement('div');
    actions.className = 'route-selector-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'route-selector-cancel';
    cancel.dataset.routeSelectorAction = 'cancel';
    cancel.textContent = 'Cancel';

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'route-selector-apply';
    apply.dataset.routeSelectorAction = 'apply';
    apply.textContent = 'Apply';

    actions.append(cancel, apply);
    panel.append(actions);
  }
}

function syncHighlightButtons(station, highlighted) {
  for (const button of document.querySelectorAll('[data-highlight-station]')) {
    if (button.dataset.highlightStation !== station) continue;
    button.setAttribute('aria-pressed', String(highlighted));
    button.setAttribute('aria-label', `${highlighted ? 'Remove highlight from' : 'Highlight'} ${station}`);
    button.title = highlighted ? 'Remove highlight' : 'Highlight station';
  }
}

function scheduleHighlightRender() {
  if (highlightRenderTimer !== null) {
    clearTimeout(highlightRenderTimer);
    highlightRenderTimer = null;
  }
  requestAnimationFrame(() => {
    highlightRenderTimer = window.setTimeout(() => {
      highlightRenderTimer = null;
      if (app.state.settingsDirty || app.state.refreshInFlight) {
        app.renderRefreshNotice();
      } else {
        app.renderCurrentTab();
      }
    }, 0);
  });
}

function toggleStationHighlight(star) {
  const station = star.dataset.highlightStation;
  if (!station) return;
  const highlights = new Set(app.state.highlights);
  const highlighted = !highlights.has(station);
  if (highlighted) {
    highlights.add(station);
  } else {
    highlights.delete(station);
  }
  app.state.highlights = Array.from(highlights).sort();
  app.saveSettings();
  syncHighlightButtons(station, highlighted);
  scheduleHighlightRender();
}

for (const picker of stationPickers) installStationAction(picker);
installSelectorActions();

if (routeSummary) {
  new MutationObserver(installSelectorActions).observe(routeSummary, {
    childList: true,
    subtree: true,
  });
}

document.addEventListener('input', (event) => {
  const filter = event.target.closest?.('.station-filter[data-role]');
  if (!filter) return;
  const role = filter.dataset.role;
  requestAnimationFrame(() => updateRoleSummary(role));
}, true);

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
  const picker = input.closest('.route-selector-panel .station-picker[data-role]');
  if (!picker) return;
  const role = picker.dataset.role;
  if (!activeStationEdit || activeStationEdit.role !== role) return;

  app.syncStationState(role, input);
  updateRoleSummary(role);
  syncUnselectButton(picker);

  // Keep the edit local until Apply. In particular, prevent app-events.js
  // from saving and starting the route/context refresh for every checkbox.
  event.stopPropagation();
}, true);

document.addEventListener('click', (event) => {
  const star = event.target.closest('[data-highlight-station]');
  if (star && star.closest('.route-selector-panel')) {
    event.preventDefault();
    event.stopPropagation();
    toggleStationHighlight(star);
    return;
  }

  const action = event.target.closest('[data-route-selector-action]');
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    if (action.dataset.routeSelectorAction === 'apply') {
      applyStationEdit();
    } else {
      cancelStationEdit();
    }
    return;
  }

  const routeButton = event.target.closest('[data-route-role]');
  if (routeButton) {
    const role = routeButton.dataset.routeRole;
    const opening = routeButton.getAttribute('aria-expanded') !== 'true';
    if (opening) {
      beginStationEdit(role);
    } else if (activeStationEdit?.role === role) {
      cancelStationEdit(false);
    }
    return;
  }

  if (activeStationEdit && !event.target.closest('.route-summary-item')) {
    cancelStationEdit(false);
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activeStationEdit) cancelStationEdit(false);
}, true);
