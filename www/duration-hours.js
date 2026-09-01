const minuteInput = document.querySelector("#config-max-duration");
const hourInput = document.querySelector("#config-max-duration-hours");

function hoursFromMinutes(minutes) {
  const value = Math.max(0, Number(minutes || 0)) / 60;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function syncHoursFromMinutes() {
  if (!minuteInput || !hourInput || !minuteInput.value) return;
  hourInput.value = hoursFromMinutes(minuteInput.value);
}

function commitHours() {
  if (!minuteInput || !hourInput) return;
  const hours = Math.max(0, Number(hourInput.value || 0));
  const minutes = Math.round(hours * 60);
  minuteInput.value = String(minutes);
  minuteInput.dispatchEvent(new Event("change", { bubbles: true }));
}

hourInput?.addEventListener("change", commitHours);
hourInput?.addEventListener("focus", syncHoursFromMinutes);

// app-events initializes the stored minute value asynchronously after app.js.
// Sync a few times during startup so existing saved settings are reflected in hours.
for (const delay of [0, 50, 250]) {
  window.setTimeout(syncHoursFromMinutes, delay);
}
