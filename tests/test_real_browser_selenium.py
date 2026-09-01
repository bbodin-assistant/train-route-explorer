import json
import sys
import unittest

from selenium.webdriver.common.by import By

from test_station_filter_selenium import StationFilterRegressionTest


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


StationFilterRegressionTest.test_55_saujon_massy_via_angouleme_september_1_2026 = (
    test_55_saujon_massy_via_angouleme_september_1_2026
)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(StationFilterRegressionTest)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
