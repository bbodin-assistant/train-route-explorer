PORT ?= 8080
DIST_DIR ?= dist
SNCF_GTFS_URL ?= https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip
TEST_URL ?= http://localhost:8080/
CHROME ?= chromium
DEBUG_PORT ?= 9333
DOCKER ?= docker
UI_TEST_IMAGE ?= train-route-explorer-ui-test

.PHONY: install build fetch-gtfs run test-ui clean

install:
	@command -v wasm-pack >/dev/null || { echo "Install wasm-pack first: https://rustwasm.github.io/wasm-pack/"; exit 1; }

build: install
	wasm-pack build --target web --out-dir pkg
	rm -rf "$(DIST_DIR)"
	mkdir -p "$(DIST_DIR)"
	cp -a www/. "$(DIST_DIR)/"
	cp -a pkg "$(DIST_DIR)/pkg"

fetch-gtfs:
	mkdir -p www/data
	curl -L "$(SNCF_GTFS_URL)" -o www/data/gtfs.zip

run: build
	python3 -m http.server $(PORT) --directory "$(DIST_DIR)"

test-ui:
	$(DOCKER) build -f tests/Dockerfile -t $(UI_TEST_IMAGE) .
	$(DOCKER) run --rm --network host -v "$(CURDIR):/work:ro" -w /work -e TEST_URL="$(TEST_URL)" -e CHROME="$(CHROME)" -e DEBUG_PORT="$(DEBUG_PORT)" $(UI_TEST_IMAGE) node tests/ui.test.mjs

clean:
	rm -rf pkg target "$(DIST_DIR)"
