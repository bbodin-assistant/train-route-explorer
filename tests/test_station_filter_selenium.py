import os
import unittest

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
WAIT_SECONDS = int(os.environ.get("SELENIUM_WAIT_SECONDS", "180"))
FILTER_WAIT_SECONDS = int(os.environ.get("SELENIUM_FILTER_WAIT_SECONDS", "30"))


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
        cls.filter_wait = WebDriverWait(
            cls.driver,
            FILTER_WAIT_SECONDS,
            ignored_exceptions=(StaleElementReferenceException,),
        )
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
        # Default route selections are rendered before any GTFS is available,
        # so checkbox presence is NOT evidence that the station dataset loaded.
        # This test uses a clean Chrome profile: explicitly load the bundled
        # archive and wait for the application's real ready state.
        bundled = cls.wait.until(EC.presence_of_element_located((By.ID, "load-bundled")))
        cls.wait.until(lambda driver: bundled.is_enabled())
        bundled.click()

        def ready_or_error(driver):
            status = driver.find_element(By.ID, "cache-status")
            classes = status.get_attribute("class").split()
            text = driver.find_element(By.ID, "cache-status-text").text
            if "error" in classes:
                raise AssertionError(f"GTFS failed to load: {text}")
            if "ready" not in classes:
                return False
            day = driver.find_element(By.ID, "day-calendar")
            return day.is_enabled() and bool(day.get_attribute("value"))

        try:
            cls.wait.until(ready_or_error)
        except TimeoutException as exc:
            status = cls.driver.find_element(By.ID, "cache-status-text").text
            classes = cls.driver.find_element(By.ID, "cache-status").get_attribute("class")
            raise AssertionError(
                f"Timed out waiting for GTFS context; status={status!r}, classes={classes!r}"
            ) from exc

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
            visible = [
                node.text
                for node in self.driver.find_elements(
                    By.CSS_SELECTOR,
                    f"#{checklist_id} .station-choice-toggle span",
                )
            ]
            raise AssertionError(
                f"{role} produced no Paris result after typing; "
                f"filter={filter_input.get_attribute('value')!r}, visible={visible[:12]!r}"
            ) from exc

        self.assertTrue(
            all("paris" in label.lower() for label in labels),
            f"{role} returned non-Paris matches: {labels}",
        )
        return labels

    def test_paris_filter_works_for_departure_via_and_arrival_and_can_select(self):
        for role in ROLE_TO_LIST:
            with self.subTest(role=role):
                self._filter_for_paris(role)

        # Departure defaults to Saujon/Saintes, so at least one Paris result
        # must be available to add. Re-query the live DOM after each rerender
        # rather than retaining stale WebElement handles.
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
