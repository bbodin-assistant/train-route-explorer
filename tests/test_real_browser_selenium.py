import json
import sys
import unittest

from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC

from test_station_filter_selenium import ROLE_TO_LIST, StationFilterRegressionTest


def test_40_paris_filter_works_for_departure_via_and_arrival_and_can_select(self):
    for role in ROLE_TO_LIST:
        with self.subTest(role=role):
            self._filter_for_paris(role)

    labels = self._filter_for_paris("local_origins")
    target = {"label": None}

    def click_unselected_paris(driver):
        for row in driver.find_elements(By.CSS_SELECTOR, "#config-local-origins .station-choice"):
            try:
                row_label = row.find_element(By.CSS_SELECTOR, ".station-choice-toggle span").text
                checkbox = row.find_element(By.CSS_SELECTOR, "input[type='checkbox']")
                if row_label in labels and not checkbox.is_selected():
                    checkbox.click()
                    target["label"] = row_label
                    return True
            except StaleElementReferenceException:
                # Filtering replaces the checklist DOM. Reacquire the row and
                # checkbox instead of retaining a stale Selenium element.
                return False
        return False

    self.filter_wait.until(click_unselected_paris)
    target_label = target["label"]
    self.assertIsNotNone(target_label, "Expected at least one unselected Paris departure station")

    def selected_after_rerender(driver):
        for row in driver.find_elements(By.CSS_SELECTOR, "#config-local-origins .station-choice"):
            try:
                label = row.find_element(By.CSS_SELECTOR, ".station-choice-toggle span").text
                if label == target_label:
                    return row.find_element(By.CSS_SELECTOR, "input[type='checkbox']").is_selected()
            except StaleElementReferenceException:
                return False
        return False

    self.filter_wait.until(selected_after_rerender)

    apply_button = self.wait.until(
        EC.element_to_be_clickable(
            (
                By.CSS_SELECTOR,
                ".route-summary-item[data-route-item='local_origins'] .route-selector-apply",
            )
        )
    )
    apply_button.click()

    self.wait.until(
        EC.invisibility_of_element_located(
            (
                By.CSS_SELECTOR,
                ".route-summary-item[data-route-item='local_origins'] .route-selector-panel",
            )
        )
    )
    self.assertIn(
        target_label,
        self.driver.find_element(By.CSS_SELECTOR, "[data-route-value='local_origins']").text,
        "Selected Paris station should appear in the Departure route summary after Apply",
    )


def test_55_saujon_massy_via_angouleme_september_1_2026(self):
    result = self.driver.execute_async_script(
        """
        const done = arguments[0];
        import('./app.js?v=0.16').then(({ app }) => {
          window.__saujonMassyApp = app;
          app.state.config = {
            ...app.state.config,
            local_origins: ['Saujon'],
            connection_stations: ['Angoulême'],
            side_b_destinations: ['Massy TGV'],
            max_transfer_count: 3,
            max_journey_duration_minutes: 270,
          };
          app.writeConfig(app.state.config);
          app.state.selectedDay = '20260901';
          app.els.dayCalendar.value = '2026-09-01';
          app.showRefreshNotice();
          done({ ok: true });
        }).catch((error) => done({ ok: false, error: String(error) }));
        """
    )
    self.assertTrue(result.get("ok"), result)

    self.wait.until(
        lambda driver: driver.execute_script(
            """
            const app = window.__saujonMassyApp;
            return Boolean(
              app &&
              app.state.selectedDay === '20260901' &&
              !app.state.settingsDirty &&
              !app.state.refreshInFlight &&
              !app.state.routeRequestInFlight &&
              app.state.routes?.selected_day === '20260901' &&
              document.querySelector('#cache-status')?.classList.contains('ready')
            );
            """
        )
    )

    result = self.driver.execute_script(
        """
        const app = window.__saujonMassyApp;
        const simplifyLeg = (leg) => ({
          type: leg.train_type,
          number: leg.train_number,
          from: leg.departure_stop,
          to: leg.destination_stop,
          departure: leg.departure_time,
          arrival: leg.arrival_time,
          departure_minutes: leg.departure_minutes,
          arrival_minutes: leg.arrival_minutes,
        });
        const visibleRows = Array.from(document.querySelectorAll('.timeline-row')).map((row) => ({
          text: row.innerText.trim(),
          display: getComputedStyle(row).display,
          duplicate_reason: row.dataset.routeDuplicateReason || '',
          loop_invalid: row.dataset.routeLoopInvalid || '',
          legs: Array.from(row.querySelectorAll('.timeline-bar.train[data-detail]')).map(
            (bar) => simplifyLeg(JSON.parse(decodeURIComponent(bar.dataset.detail)))
          ),
        }));
        return {
          config: app.state.config,
          outwardCount: (app.state.routes.outward || []).length,
          visibleRows,
        };
        """
    )

    print("SAUJON_MASSY_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    self.assertEqual(result["config"]["max_transfer_count"], 3)
    self.assertEqual(result["config"]["max_journey_duration_minutes"], 270)

    visible = [row for row in result["visibleRows"] if row["display"] != "none"]
    self.assertTrue(visible, "Expected a Saujon → Massy TGV route via Angoulême")

    schedules = {}
    for row in visible:
        self.assertNotEqual(row["loop_invalid"], "true", row)
        legs = row["legs"]
        self.assertTrue(legs, row)
        key = (
            legs[0]["from"],
            legs[0]["departure_minutes"],
            legs[-1]["to"],
            legs[-1]["arrival_minutes"],
        )
        schedules.setdefault(key, set()).add(len(legs) - 1)

    dominated = {key: counts for key, counts in schedules.items() if len(counts) > 1}
    self.assertFalse(
        dominated,
        f"Same-schedule routes with extra transfers remain visible: {dominated}; rows={visible!r}",
    )

    expected = {
        (468, 704): 1,   # 07:48 → 11:44
        (944, 1193): 1,  # 15:44 → 19:53
    }
    observed = {}
    for row in visible:
        legs = row["legs"]
        observed[(legs[0]["departure_minutes"], legs[-1]["arrival_minutes"])] = len(legs) - 1
    for schedule, transfer_count in expected.items():
        self.assertEqual(observed.get(schedule), transfer_count, f"Unexpected result for schedule {schedule}: {visible!r}")


StationFilterRegressionTest.test_40_paris_filter_works_for_departure_via_and_arrival_and_can_select = (
    test_40_paris_filter_works_for_departure_via_and_arrival_and_can_select
)
StationFilterRegressionTest.test_55_saujon_massy_via_angouleme_september_1_2026 = (
    test_55_saujon_massy_via_angouleme_september_1_2026
)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(StationFilterRegressionTest)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
