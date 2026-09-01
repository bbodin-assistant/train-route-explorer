import os
import unittest

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
WAIT_SECONDS = int(os.environ.get("SELENIUM_WAIT_SECONDS", "180"))


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
        options.add_argument("--window-size=1440,1000")
        chrome_binary = os.environ.get("CHROME_BINARY")
        if chrome_binary:
            options.binary_location = chrome_binary

        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.driver.get(TEST_URL)

        cls.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-route-role='local_origins']"))
        )
        cls._ensure_gtfs_loaded()

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    @classmethod
    def _ensure_gtfs_loaded(cls):
        def ready_or_error(driver):
            status = driver.find_element(By.ID, "cache-status")
            text = driver.find_element(By.ID, "cache-status-text").text
            if "error" in status.get_attribute("class").split():
                raise AssertionError(f"GTFS failed to load: {text}")
            if driver.find_elements(By.CSS_SELECTOR, "#config-local-origins input[type='checkbox']"):
                return True
            return False

        bundled = cls.wait.until(EC.presence_of_element_located((By.ID, "load-bundled")))
        cls.wait.until(lambda driver: bundled.is_enabled())
        if not cls.driver.find_elements(By.CSS_SELECTOR, "#config-local-origins input[type='checkbox']"):
            bundled.click()

        try:
            cls.wait.until(ready_or_error)
        except TimeoutException as exc:
            status = cls.driver.find_element(By.ID, "cache-status-text").text
            raise AssertionError(f"Timed out waiting for GTFS station data; status={status!r}") from exc

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

        def paris_rows(driver):
            rows = driver.find_elements(By.CSS_SELECTOR, f"#{checklist_id} .station-choice")
            matches = []
            for row in rows:
                labels = row.find_elements(By.CSS_SELECTOR, ".station-choice-toggle span")
                if labels and "paris" in labels[0].text.lower():
                    matches.append(row)
            return matches or False

        rows = self.wait.until(paris_rows)
        labels = [
            row.find_element(By.CSS_SELECTOR, ".station-choice-toggle span").text
            for row in rows
        ]
        self.assertTrue(labels, f"{role} should show station matches for 'Paris'")
        self.assertTrue(
            all("paris" in label.lower() for label in labels),
            f"{role} returned non-Paris rows: {labels}",
        )
        return rows

    def test_paris_filter_works_for_departure_via_and_arrival_and_can_select(self):
        for role in ROLE_TO_LIST:
            with self.subTest(role=role):
                self._filter_for_paris(role)

        # Departure defaults to Saujon/Saintes, so a Paris result is expected to
        # be unselected. Select a real filtered result, then use the same Apply
        # button as the user-facing inline station selector.
        rows = self._filter_for_paris("local_origins")
        target_label = None
        for row in rows:
            checkbox = row.find_element(By.CSS_SELECTOR, "input[type='checkbox']")
            if not checkbox.is_selected():
                target_label = row.find_element(By.CSS_SELECTOR, ".station-choice-toggle span").text
                checkbox.click()
                break

        self.assertIsNotNone(target_label, "Expected at least one unselected Paris departure station")

        def selected_after_rerender(driver):
            for row in driver.find_elements(By.CSS_SELECTOR, "#config-local-origins .station-choice"):
                label = row.find_element(By.CSS_SELECTOR, ".station-choice-toggle span").text
                if label == target_label:
                    return row.find_element(By.CSS_SELECTOR, "input[type='checkbox']").is_selected()
            return False

        self.wait.until(selected_after_rerender)

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
