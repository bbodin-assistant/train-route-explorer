const stationPickers = Array.from(document.querySelectorAll('.station-picker[data-role]'));

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
`;
document.head.append(stationActionStyle);

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

  // The app re-renders the checklist after every change, so re-query the
  // current DOM each time rather than holding stale checkbox references.
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

for (const picker of stationPickers) installStationAction(picker);
