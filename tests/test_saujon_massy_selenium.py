import json
import os
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
GTFS_FIXTURE_PATH = os.environ.get("GTFS_FIXTURE_PATH", "")
WAIT_SECONDS = int(os.environ.get("SELENIUM_WAIT_SECONDS", "10"))


class SaujonMassyRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=390,844")
        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.driver.get(TEST_URL)
        cls.wait.until(EC.presence_of_element_located((By.ID, "gtfs-upload")))

        fixture = os.path.abspath(GTFS_FIXTURE_PATH)
        if not GTFS_FIXTURE_PATH or not os.path.isfile(fixture):
            raise AssertionError(f"GTFS fixture does not exist: {fixture!r}")

        cls.driver.execute_script("document.querySelector('.data-menu').open = true;")
        cls.driver.find_element(By.ID, "gtfs-upload").send_keys(fixture)
        cls.driver.find_element(By.ID, "load-upload").click()
        cls.wait.until(
            lambda driver: "ready" in driver.find_element(By.ID, "cache-status").get_attribute("class").split()
        )

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "driver"):
            cls.driver.quit()

    def test_saujon_massy_via_angouleme_september_1_2026(self):
        self.driver.execute_async_script(
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
              done(true);
            }).catch((error) => done({ error: String(error) }));
            """
        )

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
              trip_id: leg.trip_id,
              type: leg.train_type,
              number: leg.train_number,
              from: leg.departure_stop,
              to: leg.destination_stop,
              departure: leg.departure_time,
              arrival: leg.arrival_time,
              departure_minutes: leg.departure_minutes,
              arrival_minutes: leg.arrival_minutes,
              path: (leg.path || []).map((stop) => stop.stop_name),
            });
            const simplify = (itinerary) => ({
              trip_id: itinerary.trip_id,
              date: itinerary.date,
              from: itinerary.departure_stop,
              to: itinerary.destination_stop,
              departure: itinerary.departure_time,
              arrival: itinerary.arrival_time,
              departure_minutes: itinerary.departure_minutes,
              arrival_minutes: itinerary.arrival_minutes,
              duration: itinerary.total_duration_minutes,
              transfers: itinerary.transfer_count,
              transfer_stations: (itinerary.transfers || []).map((transfer) => transfer.station),
              legs: (itinerary.legs || []).map(simplifyLeg),
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
              outward: (app.state.routes.outward || []).map(simplify),
              visibleRows,
            };
            """
        )

        print("SAUJON_MASSY_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))

        self.assertEqual(result["config"]["max_transfer_count"], 3)
        self.assertEqual(result["config"]["max_journey_duration_minutes"], 270)

        visible = [row for row in result["visibleRows"] if row["display"] != "none"]
        self.assertTrue(visible, "Expected at least one Saujon → Massy TGV route via Angoulême")

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
            f"Same-schedule routes with extra transfers are still visible: {dominated}; rows={visible!r}",
        )

        # The current SNCF fixture contains two dominated pairs for this exact
        # date. Keep this assertion focused on the transfer-count property rather
        # than train IDs, which SNCF may regenerate.
        for row in visible:
            if row["legs"][0]["departure_minutes"] in (468, 944):
                self.assertEqual(len(row["legs"]) - 1, 1, row)


if __name__ == "__main__":
    unittest.main(verbosity=2)
