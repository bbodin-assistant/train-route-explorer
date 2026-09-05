import os
import unittest
from urllib.parse import urljoin

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


TEST_URL = os.environ.get("TEST_URL", "http://127.0.0.1:8080/")
WAIT_SECONDS = int(os.environ.get("ROUTE_DEDUPE_WAIT_SECONDS", "3"))


class RouteDedupeRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=390,844")
        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.driver.get(urljoin(TEST_URL, "route-guard-test.html"))
        cls.wait.until(
            lambda driver: driver.find_element(By.ID, "routes-time-chart")
            .get_attribute("data-route-guard-ready") == "true"
        )

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "driver"):
            cls.driver.quit()

    def test_duplicate_and_dominated_routes_are_hidden(self):
        self.driver.execute_script(
            """
            const timeline = document.querySelector('#routes-time-chart');
            const makeLeg = ({
              tripId,
              type,
              number,
              from,
              to,
              departure,
              arrival,
              path,
            }) => ({
              trip_id: tripId,
              train_type: type,
              train_number: number,
              departure_stop: from,
              destination_stop: to,
              departure_minutes: departure,
              arrival_minutes: arrival,
              path: path.map(([stop_name, minutes]) => ({
                stop_name,
                arrival_minutes: minutes,
                departure_minutes: minutes,
              })),
            });
            const makeRow = (id, legs) => {
              const row = document.createElement('div');
              row.id = id;
              row.className = 'timeline-row';
              row.dataset.day = '20260904';
              for (const leg of legs) {
                const bar = document.createElement('button');
                bar.className = 'timeline-bar train';
                bar.dataset.detail = encodeURIComponent(JSON.stringify(leg));
                row.append(bar);
              }
              return row;
            };

            const ter = makeLeg({
              tripId: 'ter-a', type: 'TER', number: 'L16',
              from: 'Saujon', to: 'Angoulême', departure: 464, arrival: 600,
              path: [['Saujon', 464], ['Saintes', 500], ['Angoulême', 600]],
            });
            const inouiDirect = makeLeg({
              tripId: 'tgv-a', type: 'TGV INOUI', number: '8376',
              from: 'Angoulême', to: 'Massy TGV', departure: 620, arrival: 709,
              path: [['Angoulême', 620], ['Poitiers', 650], ['Massy TGV', 709]],
            });
            const inouiToPoitiers = makeLeg({
              tripId: 'tgv-b1', type: 'TGV INOUI', number: '8376',
              from: 'Angoulême', to: 'Poitiers', departure: 620, arrival: 650,
              path: [['Angoulême', 620], ['Poitiers', 650]],
            });
            const inouiFromPoitiers = makeLeg({
              tripId: 'tgv-b2', type: 'TGV INOUI', number: '8377',
              from: 'Poitiers', to: 'Massy TGV', departure: 660, arrival: 709,
              path: [['Poitiers', 660], ['Massy TGV', 709]],
            });
            const ouigoDirect = makeLeg({
              tripId: 'ouigo-a', type: 'OUIGO Grande Vitesse', number: '7669',
              from: 'Angoulême', to: 'Massy TGV', departure: 620, arrival: 709,
              path: [['Angoulême', 620], ['Poitiers', 650], ['Massy TGV', 709]],
            });
            const ouigoToPoitiers = makeLeg({
              tripId: 'ouigo-b', type: 'OUIGO Grande Vitesse', number: '7652',
              from: 'Angoulême', to: 'Poitiers', departure: 612, arrival: 650,
              path: [['Angoulême', 612], ['Poitiers', 650]],
            });

            const preferred = makeRow('preferred-route', [ter, inouiDirect]);
            const sameService = preferred.cloneNode(true);
            sameService.id = 'same-service-route';

            timeline.replaceChildren(
              preferred,
              makeRow('extra-transfer-route', [ter, inouiToPoitiers, inouiFromPoitiers]),
              makeRow('cross-brand-extra-route', [ter, ouigoToPoitiers, inouiFromPoitiers]),
              sameService,
              makeRow('different-brand-route', [ter, ouigoDirect]),
            );
            """
        )

        for row_id in ["extra-transfer-route", "cross-brand-extra-route", "same-service-route"]:
            self.wait.until(
                lambda driver, target=row_id: "route-duplicate-invalid" in driver.find_element(
                    By.ID, target
                ).get_attribute("class").split()
            )

        preferred = self.driver.find_element(By.ID, "preferred-route")
        extra_transfer = self.driver.find_element(By.ID, "extra-transfer-route")
        cross_brand_extra = self.driver.find_element(By.ID, "cross-brand-extra-route")
        same_service = self.driver.find_element(By.ID, "same-service-route")
        different_brand = self.driver.find_element(By.ID, "different-brand-route")

        self.assertEqual(extra_transfer.get_attribute("data-route-duplicate-reason"), "extra-transfer")
        self.assertEqual(cross_brand_extra.get_attribute("data-route-duplicate-reason"), "extra-transfer")
        self.assertEqual(same_service.get_attribute("data-route-duplicate-reason"), "same-service")
        self.assertNotIn("route-duplicate-invalid", preferred.get_attribute("class"))
        self.assertNotIn("route-duplicate-invalid", different_brand.get_attribute("class"))

        self.assertEqual(extra_transfer.value_of_css_property("display"), "none")
        self.assertEqual(cross_brand_extra.value_of_css_property("display"), "none")
        self.assertEqual(same_service.value_of_css_property("display"), "none")
        self.assertNotEqual(preferred.value_of_css_property("display"), "none")
        self.assertNotEqual(different_brand.value_of_css_property("display"), "none")

        # Via "only" can make all simpler alternatives unavailable. Hidden
        # routes must not dominate a valid route with more changes.
        self.driver.execute_script(
            """
            document.querySelector('#preferred-route').hidden = true;
            document.querySelector('#same-service-route').hidden = true;
            document.querySelector('#different-brand-route').hidden = true;
            """
        )
        self.wait.until(
            lambda driver: "route-duplicate-invalid" not in driver.find_element(
                By.ID, "cross-brand-extra-route"
            ).get_attribute("class").split()
        )
        self.assertNotEqual(
            self.driver.find_element(By.ID, "cross-brand-extra-route").value_of_css_property("display"),
            "none",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
