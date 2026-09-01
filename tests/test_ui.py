"""Selenium regression tests for date navigation and multi-day timeline grouping.

Build the site with ``make build`` before running this test. The test serves the
generated ``dist`` directory with Python's standard-library HTTP server.
"""

from __future__ import annotations

import os
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = PROJECT_ROOT / "dist"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        pass


class TimelineDateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not (DIST_DIR / "index.html").is_file():
            raise RuntimeError("dist/index.html is missing; run `make build` first")

        handler = partial(QuietHandler, directory=str(DIST_DIR))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--no-sandbox")
        chrome = os.environ.get("CHROME", "/usr/bin/google-chrome")
        if Path(chrome).is_file():
            options.binary_location = chrome
        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, int(os.environ.get("SELENIUM_TIMEOUT", "180")))

    @classmethod
    def tearDownClass(cls) -> None:
        if hasattr(cls, "driver"):
            cls.driver.quit()
        if hasattr(cls, "server"):
            cls.server.shutdown()
            cls.server.server_close()
        if hasattr(cls, "server_thread"):
            cls.server_thread.join(timeout=2)

    def wait_for_cache(self) -> None:
        def cache_ready(driver: webdriver.Chrome) -> bool:
            status = driver.find_element(By.ID, "cache-status")
            message = driver.find_element(By.ID, "cache-status-text").text
            if "error" in status.get_attribute("class").split():
                raise AssertionError(message)
            return "Cache ready" in message

        self.wait.until(cache_ready)

    def test_today_is_the_initial_group(self) -> None:
        port = self.server.server_address[1]
        self.driver.get(f"http://127.0.0.1:{port}/")
        load_bundled = self.wait.until(
            lambda driver: driver.find_element(By.ID, "load-bundled")
            if driver.find_element(By.ID, "load-bundled").is_enabled()
            else False
        )
        load_bundled.click()
        self.wait_for_cache()

        today = self.driver.execute_script(
            """
            const now = new Date();
            return [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0"),
            ].join("-");
            """
        )
        today_button = self.wait.until(
            lambda driver: driver.find_element(By.ID, "today-button")
            if driver.find_element(By.ID, "today-button").is_enabled()
            else False
        )
        today_button.click()

        def today_rendered(driver: webdriver.Chrome) -> bool:
            selected = driver.find_element(By.ID, "day-calendar").get_attribute("value")
            groups = driver.find_elements(By.CSS_SELECTOR, ".timeline-day-group")
            if selected == today and groups and groups[0].get_attribute("data-day") == today.replace("-", ""):
                return True
            status = driver.find_element(By.ID, "cache-status")
            if "error" in status.get_attribute("class").split():
                raise AssertionError(driver.find_element(By.ID, "cache-status-text").text)
            return False

        self.wait.until(today_rendered)
        groups = self.driver.find_elements(By.CSS_SELECTOR, ".timeline-day-group")
        group_days = [group.get_attribute("data-day") for group in groups]
        expected_days = self.driver.execute_script(
            """
            const [year, month, day] = arguments[0].split("-").map(Number);
            const selected = new Date(year, month - 1, day, 12);
            return [0].map((offset) => {
              const date = new Date(selected);
              date.setDate(date.getDate() + offset);
              return [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, "0"),
                String(date.getDate()).padStart(2, "0"),
              ].join("");
            });
            """,
            today,
        )
        self.assertEqual(len(group_days), 1)
        self.assertEqual(group_days, expected_days)
        self.assertTrue(
            self.driver.execute_script(
                """
                return Array.from(document.querySelectorAll(".timeline-row")).every(
                  (row) => row.dataset.day === row.closest(".timeline-day-group")?.dataset.day,
                );
                """
            )
        )

        previous = self.driver.find_element(By.ID, "previous-day-button")
        next_day = self.driver.find_element(By.ID, "next-day-button")
        self.assertEqual(previous.get_attribute("aria-label"), "Previous service day")
        self.assertEqual(next_day.get_attribute("aria-label"), "Next service day")


if __name__ == "__main__":
    unittest.main()
