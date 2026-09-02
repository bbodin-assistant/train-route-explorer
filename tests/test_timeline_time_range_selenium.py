import sys
import unittest

from selenium.webdriver.common.by import By

from test_station_filter_selenium import MOBILE_SIZE, StationFilterRegressionTest


def test_25_timeline_shows_arrival_beside_departure(self):
    self._set_window(MOBILE_SIZE)
    try:
        def time_range(driver):
            return driver.execute_script(
                """
                const row = Array.from(document.querySelectorAll('.timeline-row')).find(
                  (candidate) => candidate.querySelector('.timeline-bar.train[data-detail]') &&
                    getComputedStyle(candidate).display !== 'none'
                );
                if (!row) return null;

                const bars = Array.from(row.querySelectorAll('.timeline-bar.train[data-detail]'));
                const firstLeg = JSON.parse(decodeURIComponent(bars[0].dataset.detail));
                const lastLeg = JSON.parse(decodeURIComponent(bars.at(-1).dataset.detail));
                const cluster = row.querySelector('.timeline-label-time');
                const departure = row.querySelector('.timeline-label-departure');
                const arrow = row.querySelector('.timeline-label-time-arrow');
                const arrival = row.querySelector('.timeline-label-arrival');
                const route = row.querySelector('.timeline-label-route');
                if (!cluster || !departure || !arrow || !arrival || !route) return null;

                const clusterRect = cluster.getBoundingClientRect();
                const departureRect = departure.getBoundingClientRect();
                const arrowRect = arrow.getBoundingClientRect();
                const arrivalRect = arrival.getBoundingClientRect();
                const rowRect = row.getBoundingClientRect();
                return {
                  expectedDeparture: firstLeg.departure_time,
                  expectedArrival: lastLeg.arrival_time,
                  departure: departure.textContent.trim(),
                  arrival: arrival.textContent.trim(),
                  arrow: arrow.textContent.trim(),
                  ariaLabel: cluster.getAttribute('aria-label'),
                  clusterWidth: clusterRect.width,
                  departureRight: departureRect.right,
                  arrowLeft: arrowRect.left,
                  arrowRight: arrowRect.right,
                  arrivalLeft: arrivalRect.left,
                  rowHeight: rowRect.height,
                  routeOverflow: getComputedStyle(route).textOverflow,
                  departureWeight: getComputedStyle(departure).fontWeight,
                  arrivalWeight: getComputedStyle(arrival).fontWeight,
                  arrivalColor: getComputedStyle(arrival).color,
                  departureColor: getComputedStyle(departure).color,
                };
                """
            )

        result = self.wait.until(time_range)
        self.assertEqual(result["departure"], result["expectedDeparture"])
        self.assertEqual(result["arrival"], result["expectedArrival"])
        self.assertEqual(result["arrow"], "→")
        self.assertIn(result["departure"], result["ariaLabel"])
        self.assertIn(result["arrival"], result["ariaLabel"])

        # The three pieces should read as one compact time range, in order.
        self.assertLessEqual(result["arrowLeft"] - result["departureRight"], 8)
        self.assertLessEqual(result["arrivalLeft"] - result["arrowRight"], 8)
        self.assertLessEqual(result["clusterWidth"], 106)

        # Arrival stays visually secondary; route text remains the flexible field.
        self.assertGreater(int(result["departureWeight"]), int(result["arrivalWeight"]))
        self.assertNotEqual(result["departureColor"], result["arrivalColor"])
        self.assertEqual(result["routeOverflow"], "ellipsis")

        # The added arrival time must not make mobile timeline rows taller.
        self.assertLessEqual(result["rowHeight"], 54)
    finally:
        self._close_overlays()


StationFilterRegressionTest.test_25_timeline_shows_arrival_beside_departure = (
    test_25_timeline_shows_arrival_beside_departure
)


if __name__ == "__main__":
    suite = unittest.TestSuite([
        StationFilterRegressionTest("test_25_timeline_shows_arrival_beside_departure"),
    ])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
