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


if __name__ == "__main__":
    unittest.main(verbosity=2)
