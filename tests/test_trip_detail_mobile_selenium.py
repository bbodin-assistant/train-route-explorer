import os
import unittest

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
GTFS_FIXTURE_PATH = os.environ.get("GTFS_FIXTURE_PATH", "")
WAIT_SECONDS = int(os.environ.get("SELENIUM_WAIT_SECONDS", "10"))
MOBILE_SIZE = (390, 844)

DETAIL_SELECTOR = "#train-detail-frame"
DETAIL_LAYER_SELECTOR = "#train-detail-dismiss-layer"
DETAIL_HISTORY_KEY = "trainRouteExplorerDetailOpen"


class MobileTripDetailDismissalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument(f"--window-size={MOBILE_SIZE[0]},{MOBILE_SIZE[1]}")
        chrome_binary = os.environ.get("CHROME_BINARY")
        if chrome_binary:
            options.binary_location = chrome_binary

        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.driver.get(TEST_URL)

        try:
            cls.wait.until(
                lambda driver: driver.execute_script(
                    """
                    return Boolean(
                      document.querySelector('#routes-time-chart') &&
                      document.querySelector('#train-detail-frame') &&
                      document.querySelector('#train-detail-dismiss-layer') &&
                      document.querySelector('.data-menu')?.closest('.header-tools')
                    );
                    """
                )
            )
        except TimeoutException as exc:
            raise AssertionError("Interactive layout was not ready") from exc

        cls._load_gtfs_through_upload_ui()
        cls.wait.until(
            lambda driver: driver.execute_script(
                """
                return Array.from(document.querySelectorAll('.timeline-row')).some(
                  (row) => row.querySelector('.timeline-bar.train[data-detail]')
                );
                """
            )
        )

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "driver"):
            cls.driver.quit()

    @classmethod
    def _load_gtfs_through_upload_ui(cls):
        fixture = os.path.abspath(GTFS_FIXTURE_PATH)
        if not GTFS_FIXTURE_PATH or not os.path.isfile(fixture):
            raise AssertionError(f"GTFS fixture does not exist: {fixture!r}")

        data_menu = cls.driver.find_element(By.CSS_SELECTOR, ".data-menu")
        cls.driver.execute_script("arguments[0].open = true;", data_menu)
        upload = cls.wait.until(EC.presence_of_element_located((By.ID, "gtfs-upload")))
        upload.send_keys(fixture)
        cls.wait.until(EC.element_to_be_clickable((By.ID, "load-upload"))).click()

        def ready_or_error(driver):
            status = driver.find_element(By.ID, "cache-status")
            classes = status.get_attribute("class").split()
            text = driver.find_element(By.ID, "cache-status-text").get_attribute("textContent") or ""
            if "error" in classes:
                raise AssertionError(f"GTFS failed to load: {text.strip()}")
            if "ready" not in classes:
                return False
            return driver.find_element(By.ID, "day-calendar").is_enabled()

        cls.wait.until(ready_or_error)
        cls.driver.execute_script("document.querySelector('.data-menu').open = false;")

    def _open_trip_detail(self):
        self.driver.execute_script(
            """
            const layer = document.querySelector('#train-detail-dismiss-layer');
            if (layer && !layer.hidden) layer.click();
            """
        )

        def click_a_trip_row(driver):
            return driver.execute_script(
                """
                const row = Array.from(document.querySelectorAll('.timeline-row')).find(
                  (candidate) => candidate.querySelector('.timeline-bar.train[data-detail]') &&
                    getComputedStyle(candidate).display !== 'none'
                );
                if (!row) return false;
                row.click();
                return true;
                """
            )

        self.wait.until(click_a_trip_row)
        self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, DETAIL_SELECTOR)))
        self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".train-detail-close")))
        self.wait.until(
            lambda driver: driver.execute_script(
                f"return Boolean(history.state?.{DETAIL_HISTORY_KEY});"
            )
        )

    def _wait_closed(self):
        self.wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, DETAIL_SELECTOR)))
        self.wait.until(
            lambda driver: not driver.execute_script(
                f"return Boolean(history.state?.{DETAIL_HISTORY_KEY});"
            )
        )

    def test_mobile_trip_detail_dismissal_paths(self):
        self.assertTrue(
            self.driver.execute_script("return matchMedia('(max-width: 560px)').matches;"),
            "Selenium must run this regression at the mobile breakpoint",
        )
        self._open_trip_detail()

        geometry = self.driver.execute_script(
            """
            const frame = document.querySelector('#train-detail-frame');
            const close = frame.querySelector('.train-detail-close');
            const layer = document.querySelector('#train-detail-dismiss-layer');
            const frameRect = frame.getBoundingClientRect();
            const closeRect = close.getBoundingClientRect();
            const layerRect = layer.getBoundingClientRect();
            const style = getComputedStyle(frame);
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              frame: {
                left: frameRect.left,
                right: frameRect.right,
                bottom: frameRect.bottom,
                width: frameRect.width,
                position: style.position,
                maxHeight: style.maxHeight,
              },
              close: {
                width: closeRect.width,
                height: closeRect.height,
                ariaLabel: close.getAttribute('aria-label'),
              },
              layer: {
                hidden: layer.hidden,
                left: layerRect.left,
                top: layerRect.top,
                right: layerRect.right,
                bottom: layerRect.bottom,
              },
              dialog: {
                role: frame.getAttribute('role'),
                ariaModal: frame.getAttribute('aria-modal'),
                ariaLabel: frame.getAttribute('aria-label'),
              },
            };
            """
        )

        self.assertEqual(geometry["frame"]["position"], "fixed")
        self.assertAlmostEqual(geometry["frame"]["left"], 0, delta=1)
        self.assertAlmostEqual(geometry["frame"]["right"], geometry["innerWidth"], delta=1)
        self.assertAlmostEqual(geometry["frame"]["bottom"], geometry["innerHeight"], delta=1)
        self.assertGreaterEqual(geometry["close"]["width"], 44)
        self.assertGreaterEqual(geometry["close"]["height"], 44)
        self.assertEqual(geometry["close"]["ariaLabel"], "Close trip details")
        self.assertFalse(geometry["layer"]["hidden"])
        self.assertAlmostEqual(geometry["layer"]["left"], 0, delta=1)
        self.assertAlmostEqual(geometry["layer"]["top"], 0, delta=1)
        self.assertAlmostEqual(geometry["layer"]["right"], geometry["innerWidth"], delta=1)
        self.assertAlmostEqual(geometry["layer"]["bottom"], geometry["innerHeight"], delta=1)
        self.assertEqual(geometry["dialog"]["role"], "dialog")
        self.assertEqual(geometry["dialog"]["ariaModal"], "true")
        self.assertEqual(geometry["dialog"]["ariaLabel"], "Trip details")

        # Explicit close control.
        self.driver.find_element(By.CSS_SELECTOR, ".train-detail-close").click()
        self._wait_closed()

        # Tap/click outside on the dimmed dismiss layer.
        self._open_trip_detail()
        self.driver.execute_script("document.querySelector('#train-detail-dismiss-layer').click();")
        self._wait_closed()

        # Browser/device Back should close the detail without leaving the page.
        original_url = self.driver.current_url
        self._open_trip_detail()
        self.driver.back()
        self._wait_closed()
        self.assertEqual(self.driver.current_url, original_url)

        # Swipe down from the top of the bottom sheet.
        self._open_trip_detail()
        dispatched = self.driver.execute_script(
            """
            const frame = document.querySelector('#train-detail-frame');
            frame.scrollTop = 0;
            const dispatchTouch = (type, y, includeTouch = true) => {
              const event = new Event(type, { bubbles: true, cancelable: true });
              const touch = { clientX: Math.round(window.innerWidth / 2), clientY: y };
              Object.defineProperty(event, 'touches', {
                configurable: true,
                value: includeTouch ? [touch] : [],
              });
              Object.defineProperty(event, 'changedTouches', {
                configurable: true,
                value: [touch],
              });
              return frame.dispatchEvent(event);
            };
            dispatchTouch('touchstart', 80);
            dispatchTouch('touchmove', 190);
            dispatchTouch('touchend', 190, false);
            return true;
            """
        )
        self.assertTrue(dispatched)
        self._wait_closed()


if __name__ == "__main__":
    unittest.main(verbosity=2)
