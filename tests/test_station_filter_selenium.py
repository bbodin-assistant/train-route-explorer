import os
import unittest

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
GTFS_FIXTURE_PATH = os.environ.get("GTFS_FIXTURE_PATH", "")
WAIT_SECONDS = int(os.environ.get("SELENIUM_WAIT_SECONDS", "10"))
FILTER_WAIT_SECONDS = int(os.environ.get("SELENIUM_FILTER_WAIT_SECONDS", "3"))

DESKTOP_SIZE = (1440, 1000)
MOBILE_SIZE = (390, 844)

ROLE_TO_LIST = {
    "local_origins": "config-local-origins",
    "connection_stations": "config-connection-stations",
    "side_b_destinations": "config-side-b-destinations",
}


class StationFilterRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument(f"--window-size={DESKTOP_SIZE[0]},{DESKTOP_SIZE[1]}")
        chrome_binary = os.environ.get("CHROME_BINARY")
        if chrome_binary:
            options.binary_location = chrome_binary

        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.filter_wait = WebDriverWait(
            cls.driver,
            FILTER_WAIT_SECONDS,
            ignored_exceptions=(StaleElementReferenceException,),
        )
        cls.driver.get(TEST_URL)

        try:
            cls.wait.until(
                lambda driver: driver.execute_script(
                    """
                    return Boolean(
                      document.querySelector('.route-summary-item[data-route-item="local_origins"]') &&
                      document.querySelector('.data-menu')?.closest('.header-tools')
                    );
                    """
                )
            )
        except TimeoutException as exc:
            raise AssertionError("Interactive layout was not ready within 10 seconds") from exc

        cls._load_gtfs_through_upload_ui()

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
        cls.wait.until(lambda driver: driver.find_element(By.CSS_SELECTOR, ".data-menu").get_attribute("open"))

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
            day = driver.find_element(By.ID, "day-calendar")
            return day.is_enabled() and bool(day.get_attribute("value"))

        try:
            cls.wait.until(ready_or_error)
        except TimeoutException as exc:
            status = cls.driver.find_element(By.ID, "cache-status-text").get_attribute("textContent")
            classes = cls.driver.find_element(By.ID, "cache-status").get_attribute("class")
            raise AssertionError(
                f"Uploaded GTFS was not ready within {WAIT_SECONDS}s; "
                f"status={status!r}, classes={classes!r}"
            ) from exc

        cls.driver.execute_script("document.querySelector('.data-menu').open = false;")

    def _set_window(self, size):
        self.driver.set_window_size(*size)
        target_width = 500 if size == MOBILE_SIZE else 1000
        if size == MOBILE_SIZE:
            self.wait.until(lambda driver: driver.execute_script("return window.innerWidth") <= target_width)
        else:
            self.wait.until(lambda driver: driver.execute_script("return window.innerWidth") >= target_width)

    def _close_overlays(self):
        self.driver.execute_script(
            """
            document.querySelectorAll('.toolbar-menu').forEach((menu) => { menu.open = false; });
            const about = document.querySelector('#about-panel');
            if (about) about.hidden = true;
            const aboutButton = document.querySelector('#about-button');
            if (aboutButton) aboutButton.setAttribute('aria-expanded', 'false');
            document.querySelectorAll('.route-selector-panel').forEach((panel) => { panel.hidden = true; });
            document.querySelectorAll('[data-route-role]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
            const dismiss = document.querySelector('#train-detail-dismiss-layer');
            if (dismiss && !dismiss.hidden) dismiss.click();
            """
        )

    def _open_settings(self):
        summary = self.wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, ".route-settings-menu > summary"))
        )
        panel = self.driver.find_element(By.CSS_SELECTOR, ".route-settings-panel")
        if not panel.is_displayed():
            summary.click()
        self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".route-settings-panel")))
        return panel

    def _open_route_selector(self, role):
        button_selector = f"[data-route-role='{role}']"
        panel_selector = f".route-summary-item[data-route-item='{role}'] .route-selector-panel"
        button = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, button_selector)))
        panel = self.driver.find_element(By.CSS_SELECTOR, panel_selector)
        if not panel.is_displayed():
            button.click()
        self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, panel_selector)))
        return self.driver.find_element(By.CSS_SELECTOR, panel_selector)

    def _filter_for_paris(self, role):
        panel = self._open_route_selector(role)
        filter_input = panel.find_element(By.CSS_SELECTOR, f".station-filter[data-role='{role}']")
        filter_input.clear()
        filter_input.send_keys("Paris")

        checklist_id = ROLE_TO_LIST[role]

        def paris_labels(driver):
            labels = []
            for node in driver.find_elements(
                By.CSS_SELECTOR,
                f"#{checklist_id} .station-choice-toggle span",
            ):
                try:
                    text = node.text
                except StaleElementReferenceException:
                    return False
                if "paris" in text.lower():
                    labels.append(text)
            return labels or False

        try:
            labels = self.filter_wait.until(paris_labels)
        except TimeoutException as exc:
            visible = []
            for node in self.driver.find_elements(
                By.CSS_SELECTOR,
                f"#{checklist_id} .station-choice-toggle span",
            ):
                try:
                    visible.append(node.text)
                except StaleElementReferenceException:
                    continue
            live_filter = self.driver.find_element(
                By.CSS_SELECTOR,
                f".station-filter[data-role='{role}']",
            ).get_attribute("value")
            raise AssertionError(
                f"{role} produced no Paris result within {FILTER_WAIT_SECONDS}s; "
                f"filter={live_filter!r}, visible={visible[:12]!r}"
            ) from exc

        self.assertTrue(
            all("paris" in label.lower() for label in labels),
            f"{role} returned non-Paris matches: {labels}",
        )
        return labels

    def test_10_mobile_header_status_and_controls(self):
        self._set_window(MOBILE_SIZE)
        try:
            self.wait.until(
                lambda driver: driver.find_element(By.ID, "cache-status").get_attribute("data-status-word") == "Ready"
            )

            geometry = self.driver.execute_script(
                """
                const controls = [
                  document.querySelector('#cache-status'),
                  document.querySelector('.route-settings-menu > summary'),
                  document.querySelector('#about-button'),
                ];
                return {
                  rects: controls.map((element) => {
                    const rect = element.getBoundingClientRect();
                    return { width: rect.width, height: rect.height };
                  }),
                  statusWord: document.querySelector('#cache-status')?.dataset.statusWord,
                  visibleWord: getComputedStyle(document.querySelector('#cache-status'), '::after').content,
                };
                """
            )
            widths = [rect["width"] for rect in geometry["rects"]]
            heights = [rect["height"] for rect in geometry["rects"]]
            self.assertLessEqual(max(widths) - min(widths), 0.6, f"Header widths differ: {widths}")
            self.assertLessEqual(max(heights) - min(heights), 0.6, f"Header heights differ: {heights}")
            self.assertEqual(geometry["statusWord"], "Ready")
            self.assertEqual(geometry["visibleWord"].strip('"'), "Ready")

            status = self.driver.find_element(By.ID, "cache-status")
            status.click()
            self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".data-panel")))
            status.click()
            self.wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, ".data-panel")))

            settings = self.driver.find_element(By.CSS_SELECTOR, ".route-settings-menu > summary")
            settings.click()
            self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".route-settings-panel")))
            settings.click()
            self.wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, ".route-settings-panel")))

            about = self.driver.find_element(By.ID, "about-button")
            about.click()
            self.wait.until(EC.visibility_of_element_located((By.ID, "about-panel")))
            about.click()
            self.wait.until(EC.invisibility_of_element_located((By.ID, "about-panel")))
        finally:
            self._close_overlays()
            self._set_window(DESKTOP_SIZE)

    def test_20_numeric_settings_are_compact_number_inputs(self):
        self._set_window(MOBILE_SIZE)
        try:
            self._open_settings()
            measurements = self.driver.execute_script(
                """
                const ids = [
                  'config-min-transfer',
                  'config-max-transfer',
                  'config-max-transfer-count',
                  'config-max-duration-hours',
                ];
                return Object.fromEntries(ids.map((id) => {
                  const input = document.getElementById(id);
                  return [id, {
                    width: input.getBoundingClientRect().width,
                    type: input.type,
                    value: input.value,
                  }];
                }));
                """
            )
            count = measurements["config-max-transfer-count"]
            duration = measurements["config-max-duration-hours"]
            min_transfer = measurements["config-min-transfer"]
            max_transfer = measurements["config-max-transfer"]

            self.assertEqual(count["type"], "number")
            self.assertEqual(duration["type"], "number")
            self.assertLessEqual(count["width"], 66)
            self.assertLessEqual(duration["width"], 66)
            self.assertLess(count["width"], min_transfer["width"])
            self.assertLess(duration["width"], max_transfer["width"])
            self.assertTrue(count["value"].isdigit())
            self.assertTrue(duration["value"].isdigit())
        finally:
            self._close_overlays()
            self._set_window(DESKTOP_SIZE)

    def test_30_trip_detail_transfer_edge_and_station_emphasis(self):
        def multi_leg_row(driver):
            for row in driver.find_elements(By.CSS_SELECTOR, ".timeline-row"):
                try:
                    if len(row.find_elements(By.CSS_SELECTOR, ".timeline-bar.train[data-detail]")) > 1:
                        return row
                except StaleElementReferenceException:
                    return False
            return False

        row = self.wait.until(multi_leg_row)
        self._set_window(MOBILE_SIZE)
        try:
            self.driver.execute_script("arguments[0].click();", row)
            self.wait.until(EC.visibility_of_element_located((By.ID, "train-detail-frame")))
            self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".journey-detail-transfer-edge")))

            geometry = self.wait.until(
                lambda driver: driver.execute_script(
                    """
                    const transfer = document.querySelector('.journey-detail-transfer-edge');
                    const before = transfer?.previousElementSibling;
                    const after = transfer?.nextElementSibling;
                    const previousMarker = before?.querySelector('i');
                    const nextMarker = after?.querySelector('i');
                    if (!transfer || !before || !after || !previousMarker || !nextMarker) return null;
                    const transferRect = transfer.getBoundingClientRect();
                    const beforeRect = before.getBoundingClientRect();
                    const afterRect = after.getBoundingClientRect();
                    const previousRect = previousMarker.getBoundingClientRect();
                    const nextRect = nextMarker.getBoundingClientRect();
                    const line = getComputedStyle(previousMarker, '::after');
                    const label = transfer.querySelector(':scope > span')?.getBoundingClientRect();
                    return {
                      transferHeight: transferRect.height,
                      flowGap: afterRect.top - beforeRect.bottom,
                      lineWidth: parseFloat(line.width),
                      lineHeight: parseFloat(line.height),
                      lineColor: line.backgroundColor,
                      beforeKey: before.classList.contains('journey-detail-key-station'),
                      afterKey: after.classList.contains('journey-detail-key-station'),
                      firstKey: document.querySelector('.journey-detail-stop')?.classList.contains('journey-detail-key-station'),
                      lastKey: Array.from(document.querySelectorAll('.journey-detail-stop')).at(-1)?.classList.contains('journey-detail-key-station'),
                      intermediateCount: document.querySelectorAll('.journey-detail-stop.journey-detail-intermediate').length,
                      labelCenter: label ? label.top + label.height / 2 : null,
                      previousCenter: previousRect.top + previousRect.height / 2,
                      nextCenter: nextRect.top + nextRect.height / 2,
                    };
                    """
                )
            )

            self.assertLessEqual(abs(geometry["transferHeight"]), 0.6)
            self.assertLessEqual(abs(geometry["flowGap"]), 0.6)
            self.assertAlmostEqual(geometry["lineWidth"], 2.0, delta=0.2)
            self.assertGreater(geometry["lineHeight"], 20)
            self.assertEqual(geometry["lineColor"], "rgb(161, 98, 7)")
            self.assertTrue(geometry["beforeKey"])
            self.assertTrue(geometry["afterKey"])
            self.assertTrue(geometry["firstKey"])
            self.assertTrue(geometry["lastKey"])
            self.assertGreater(geometry["intermediateCount"], 0)
            self.assertGreater(geometry["labelCenter"], geometry["previousCenter"])
            self.assertLess(geometry["labelCenter"], geometry["nextCenter"])
        finally:
            self._close_overlays()
            self._set_window(DESKTOP_SIZE)

    def test_35_direction_switch_tracks_selected_direction(self):
        switch = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".timeline-direction-switch")))
        return_button = switch.find_element(By.CSS_SELECTOR, "[data-proxy-tab='back']")
        outward_button = switch.find_element(By.CSS_SELECTOR, "[data-proxy-tab='out']")

        return_button.click()
        self.wait.until(lambda driver: return_button.get_attribute("aria-pressed") == "true")
        self.assertIn(
            "selected",
            self.driver.find_element(By.CSS_SELECTOR, "#route-direction-tabs [data-tab='back']").get_attribute("class"),
        )

        outward_button.click()
        self.wait.until(lambda driver: outward_button.get_attribute("aria-pressed") == "true")
        self.assertIn(
            "selected",
            self.driver.find_element(By.CSS_SELECTOR, "#route-direction-tabs [data-tab='out']").get_attribute("class"),
        )

    def test_40_paris_filter_works_for_departure_via_and_arrival_and_can_select(self):
        for role in ROLE_TO_LIST:
            with self.subTest(role=role):
                self._filter_for_paris(role)

        labels = self._filter_for_paris("local_origins")
        target_label = None
        for label in labels:
            rows = self.driver.find_elements(By.CSS_SELECTOR, "#config-local-origins .station-choice")
            for row in rows:
                try:
                    row_label = row.find_element(By.CSS_SELECTOR, ".station-choice-toggle span").text
                    checkbox = row.find_element(By.CSS_SELECTOR, "input[type='checkbox']")
                except StaleElementReferenceException:
                    continue
                if row_label == label and not checkbox.is_selected():
                    target_label = label
                    checkbox.click()
                    break
            if target_label:
                break

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

    def test_50_via_mode_toggle_updates_pressed_state(self):
        self._close_overlays()
        panel = self._open_route_selector("connection_stations")
        only = panel.find_element(By.CSS_SELECTOR, "[data-via-mode='only']")
        one_of = panel.find_element(By.CSS_SELECTOR, "[data-via-mode='one_of']")

        only.click()
        self.wait.until(lambda driver: only.get_attribute("aria-pressed") == "true")
        self.assertEqual(one_of.get_attribute("aria-pressed"), "false")

        one_of.click()
        self.wait.until(lambda driver: one_of.get_attribute("aria-pressed") == "true")
        self.assertEqual(only.get_attribute("aria-pressed"), "false")
        self._close_overlays()


if __name__ == "__main__":
    unittest.main(verbosity=2)
