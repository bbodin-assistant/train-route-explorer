import os
import unittest

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
WAIT_SECONDS = int(os.environ.get("SELENIUM_WAIT_SECONDS", "10"))


class MapButtonSeleniumTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1440,1000")

        chrome_binary = os.environ.get("CHROME_BINARY")
        if chrome_binary:
            options.binary_location = chrome_binary

        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.driver.get(TEST_URL)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "driver"):
            cls.driver.quit()

    def test_map_button_click_switches_to_map_view(self):
        try:
            map_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, '#route-view-tabs [data-view="map"]')
                )
            )
        except TimeoutException as exc:
            version = self.driver.execute_script(
                "return document.querySelector('.app-version')?.textContent?.trim() || '';"
            )
            buttons = self.driver.execute_script(
                """
                return Array.from(document.querySelectorAll('button'))
                  .map((button) => (button.textContent || '').trim())
                  .filter(Boolean);
                """
            )
            raise AssertionError(
                f"Map button was not clickable at {TEST_URL!r}; "
                f"app_version={version!r}; visible_buttons={buttons!r}"
            ) from exc

        self.assertTrue(map_button.is_displayed(), "Map button should be visible")
        self.assertEqual(map_button.text.strip(), "Map")

        time_button = self.driver.find_element(
            By.CSS_SELECTOR, '#route-view-tabs [data-view="time"]'
        )
        map_view = self.driver.find_element(By.ID, "routes-map")
        time_view = self.driver.find_element(By.ID, "routes-time-chart")

        self.assertEqual(map_button.get_attribute("aria-pressed"), "false")
        self.assertEqual(time_button.get_attribute("aria-pressed"), "true")
        self.assertFalse(map_view.is_displayed())
        self.assertTrue(time_view.is_displayed())

        map_button.click()

        self.wait.until(lambda driver: driver.find_element(By.ID, "routes-map").is_displayed())
        self.wait.until(lambda driver: not driver.find_element(By.ID, "routes-time-chart").is_displayed())

        map_button = self.driver.find_element(
            By.CSS_SELECTOR, '#route-view-tabs [data-view="map"]'
        )
        time_button = self.driver.find_element(
            By.CSS_SELECTOR, '#route-view-tabs [data-view="time"]'
        )

        self.assertEqual(map_button.get_attribute("aria-pressed"), "true")
        self.assertEqual(time_button.get_attribute("aria-pressed"), "false")
        self.assertIn("selected", map_button.get_attribute("class").split())
        self.assertNotIn("selected", time_button.get_attribute("class").split())

        print(
            "MAP_BUTTON_RESULT="
            f"url={self.driver.current_url!r} "
            f"map_visible={map_view.is_displayed()} "
            f"time_visible={time_view.is_displayed()}"
        )


    def test_mobile_pan_unbounded_pinch_zoom_and_non_overlapping_city_labels(self):
        self.driver.set_window_size(390, 844)
        try:
            setup = self.driver.execute_async_script(
                """
                const done = arguments[0];
                const appUrl = document.querySelector('script[type="module"][src*="app.js"]')?.src;
                if (!appUrl) {
                  done({ ok: false, error: 'App module script was not found' });
                  return;
                }

                const stops = [
                  { stop_name: 'Paris', lat: 48.8566, lon: 2.3522 },
                  { stop_name: 'Rouen', lat: 49.4432, lon: 1.0993 },
                  { stop_name: 'Reims', lat: 49.2583, lon: 4.0317 },
                  { stop_name: 'Orléans', lat: 47.9030, lon: 1.9093 },
                  { stop_name: 'Chartres', lat: 48.4439, lon: 1.4890 },
                  { stop_name: 'Meaux', lat: 48.9601, lon: 2.8788 },
                  { stop_name: 'Évreux', lat: 49.0241, lon: 1.1508 },
                  { stop_name: 'Melun', lat: 48.5399, lon: 2.6608 },
                  { stop_name: 'Beauvais', lat: 49.4295, lon: 2.0807 },
                  { stop_name: 'Compiègne', lat: 49.4179, lon: 2.8261 },
                  { stop_name: 'Fontainebleau', lat: 48.4047, lon: 2.7016 },
                  { stop_name: 'Versailles', lat: 48.8014, lon: 2.1301 },
                ];

                import(appUrl).then(({ app }) => {
                  app.state.selectedTab = 'out';
                  app.state.config = {
                    ...app.state.config,
                    local_origins: ['Paris'],
                    connection_stations: ['Chartres'],
                    side_b_destinations: ['Reims'],
                  };
                  app.state.routes = {
                    ...app.state.routes,
                    outward: [{
                      legs: [{
                        train_type: 'TER',
                        train_number: 'TEST',
                        path: stops,
                      }],
                    }],
                    returns: [],
                  };
                  done({ ok: true, stopCount: stops.length });
                }).catch((error) => done({ ok: false, error: String(error) }));
                """
            )
            self.assertTrue(setup.get("ok"), setup)

            map_button = self.wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, '#route-view-tabs [data-view="map"]')
                )
            )
            map_button.click()

            self.wait.until(
                lambda driver: driver.execute_script(
                    """
                    const svg = document.querySelector('#routes-map .route-map-canvas');
                    return Boolean(svg && svg.dataset.labelsLaidOut === 'true');
                    """
                )
            )

            def label_metrics():
                return self.driver.execute_script(
                    """
                    const svg = document.querySelector('#routes-map .route-map-canvas');
                    const labels = Array.from(svg.querySelectorAll('[data-map-label]'));
                    const visible = labels.filter(
                      (label) => parseFloat(getComputedStyle(label).opacity) > 0.5
                    );
                    const rects = visible.map((label) => ({
                      name: label.textContent.trim(),
                      rect: label.getBoundingClientRect(),
                    }));
                    const overlaps = [];
                    for (let left = 0; left < rects.length; left += 1) {
                      for (let right = left + 1; right < rects.length; right += 1) {
                        const a = rects[left].rect;
                        const b = rects[right].rect;
                        const intersects = !(
                          a.right <= b.left ||
                          a.left >= b.right ||
                          a.bottom <= b.top ||
                          a.top >= b.bottom
                        );
                        if (intersects) {
                          overlaps.push([rects[left].name, rects[right].name]);
                        }
                      }
                    }
                    const firstVisible = visible[0] || null;
                    const paris = Array.from(svg.querySelectorAll('.route-map-station')).find(
                      (group) => group.querySelector('title')?.textContent === 'Paris'
                    );
                    const parisCircle = paris?.querySelector('circle') || null;
                    return {
                      zoom: Number(svg.dataset.zoom || 1),
                      viewBoxX: svg.viewBox.baseVal.x,
                      viewBoxY: svg.viewBox.baseVal.y,
                      viewBoxWidth: svg.viewBox.baseVal.width,
                      totalLabels: labels.length,
                      visibleLabels: visible.length,
                      visibleLabelHeight: firstVisible ? firstVisible.getBoundingClientRect().height : 0,
                      labelFontSize: firstVisible ? parseFloat(getComputedStyle(firstVisible).fontSize) : 0,
                      markerScale: Number(svg.dataset.markerScale || 1),
                      parisMarkerDiameter: parisCircle ? parisCircle.getBoundingClientRect().width : 0,
                      overlaps,
                      touchAction: getComputedStyle(svg).touchAction,
                      touchPan: svg.dataset.touchPan,
                    };
                    """
                )

            basemap = self.driver.execute_script(
                """
                const svg = document.querySelector('#routes-map .route-map-canvas');
                const attribution = document.querySelector('#routes-map .route-map-attribution');
                const tiles = Array.from(svg.querySelectorAll('.route-map-tile'));
                return {
                  provider: svg.dataset.tileProvider,
                  tileZoom: Number(svg.dataset.tileZoom || 0),
                  tileCount: tiles.length,
                  tileUrls: tiles.map((tile) => tile.getAttribute('href') || ''),
                  countryOutlineCount: svg.querySelectorAll('.route-map-country').length,
                  attributionText: attribution?.textContent?.trim() || '',
                  attributionHref: attribution?.href || '',
                  attributionVisible: Boolean(
                    attribution && attribution.getBoundingClientRect().width > 0
                    && attribution.getBoundingClientRect().height > 0
                  ),
                };
                """
            )
            self.assertEqual(basemap["provider"], "OpenStreetMap")
            self.assertGreater(basemap["tileCount"], 0)
            self.assertTrue(
                all(url.startswith("https://tile.openstreetmap.org/") for url in basemap["tileUrls"]),
                basemap,
            )
            self.assertEqual(basemap["countryOutlineCount"], 0)
            self.assertTrue(basemap["attributionVisible"], basemap)
            self.assertIn("OpenStreetMap contributors", basemap["attributionText"])
            self.assertEqual(
                basemap["attributionHref"],
                "https://www.openstreetmap.org/copyright",
            )

            before = label_metrics()
            self.assertEqual(before["totalLabels"], setup["stopCount"])
            self.assertGreater(before["visibleLabels"], 0)
            self.assertEqual(before["overlaps"], [])
            self.assertEqual(before["touchAction"], "none")
            self.assertEqual(before["touchPan"], "enabled")
            self.assertGreaterEqual(before["labelFontSize"], 12.5)
            self.assertGreater(before["visibleLabelHeight"], 10)
            self.assertAlmostEqual(before["markerScale"], 1.0, delta=0.05)

            pinch = self.driver.execute_script(
                """
                const svg = document.querySelector('#routes-map .route-map-canvas');
                const paris = Array.from(svg.querySelectorAll('.route-map-station')).find(
                  (group) => group.querySelector('title')?.textContent === 'Paris'
                );
                const circle = paris?.querySelector('circle');
                if (!circle) return { ok: false, error: 'Paris station marker not found' };

                const rect = circle.getBoundingClientRect();
                const centerX = (rect.left + rect.right) / 2;
                const centerY = (rect.top + rect.bottom) / 2;
                const dispatch = (type, pointerId, clientX, clientY) => {
                  svg.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    pointerId,
                    pointerType: 'touch',
                    clientX,
                    clientY,
                  }));
                };

                const initialWidth = svg.viewBox.baseVal.width;
                dispatch('pointerdown', 1, centerX - 20, centerY);
                dispatch('pointerdown', 2, centerX + 20, centerY);
                dispatch('pointermove', 1, centerX - 220, centerY);
                dispatch('pointermove', 2, centerX + 220, centerY);
                dispatch('pointerup', 1, centerX - 220, centerY);
                dispatch('pointerup', 2, centerX + 220, centerY);

                return {
                  ok: true,
                  initialWidth,
                  finalWidth: svg.viewBox.baseVal.width,
                  zoom: Number(svg.dataset.zoom || 1),
                };
                """
            )
            self.assertTrue(pinch.get("ok"), pinch)
            self.assertLess(pinch["finalWidth"], pinch["initialWidth"])
            self.assertGreater(
                pinch["zoom"],
                6,
                f"Pinch zoom should not stop at the old 6× cap: {pinch}",
            )

            self.wait.until(
                lambda driver: driver.execute_script(
                    """
                    const svg = document.querySelector('#routes-map .route-map-canvas');
                    return Boolean(svg && svg.dataset.labelsLaidOut === 'true');
                    """
                )
            )

            self.wait.until(
                lambda driver: driver.execute_script(
                    """
                    const svg = document.querySelector('#routes-map .route-map-canvas');
                    return Number(svg?.dataset.tileZoom || 0) > arguments[0];
                    """,
                    basemap["tileZoom"],
                )
            )
            zoomed_basemap = self.driver.execute_script(
                """
                const svg = document.querySelector('#routes-map .route-map-canvas');
                return {
                  tileZoom: Number(svg.dataset.tileZoom || 0),
                  tileCount: svg.querySelectorAll('.route-map-tile').length,
                };
                """
            )
            self.assertGreater(zoomed_basemap["tileZoom"], basemap["tileZoom"])
            self.assertGreater(zoomed_basemap["tileCount"], 0)

            after = label_metrics()
            self.assertGreater(after["zoom"], 6)
            self.assertGreater(
                after["visibleLabels"],
                before["visibleLabels"],
                f"Expected zooming to reveal more labels: before={before}, after={after}",
            )
            self.assertEqual(after["overlaps"], [])
            self.assertGreater(after["markerScale"], before["markerScale"])
            self.assertLessEqual(after["markerScale"], 1.66)
            self.assertGreater(after["parisMarkerDiameter"], before["parisMarkerDiameter"])

            pan = self.driver.execute_script(
                """
                const svg = document.querySelector('#routes-map .route-map-canvas');
                const rect = svg.getBoundingClientRect();
                const startX = rect.left + rect.width * 0.55;
                const startY = rect.top + rect.height * 0.55;
                const dispatch = (type, pointerId, clientX, clientY) => {
                  svg.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    pointerId,
                    pointerType: 'touch',
                    clientX,
                    clientY,
                  }));
                };
                const before = {
                  x: svg.viewBox.baseVal.x,
                  y: svg.viewBox.baseVal.y,
                };
                dispatch('pointerdown', 7, startX, startY);
                dispatch('pointermove', 7, startX - 55, startY - 35);
                dispatch('pointerup', 7, startX - 55, startY - 35);
                return {
                  before,
                  after: {
                    x: svg.viewBox.baseVal.x,
                    y: svg.viewBox.baseVal.y,
                  },
                };
                """
            )
            self.assertNotEqual(
                (pan["before"]["x"], pan["before"]["y"]),
                (pan["after"]["x"], pan["after"]["y"]),
                f"One-finger drag should pan the map: {pan}",
            )

            self.wait.until(
                lambda driver: driver.execute_script(
                    """
                    const svg = document.querySelector('#routes-map .route-map-canvas');
                    return Boolean(svg && svg.dataset.labelsLaidOut === 'true');
                    """
                )
            )
            after_pan = label_metrics()
            self.assertEqual(after_pan["overlaps"], [])
            self.assertLessEqual(after_pan["markerScale"], 1.66)
        finally:
            self.driver.set_window_size(1440, 1000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
