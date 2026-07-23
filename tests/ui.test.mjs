import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const TEST_URL = process.env.TEST_URL || "http://localhost:8080/";
const CHROME = process.env.CHROME || "google-chrome";
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9333);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, { timeoutMs = 90_000, intervalMs = 250, message = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${message}${lastError ? `: ${lastError.message}` : ""}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (!data.id) return;
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) {
        pending.reject(new Error(data.error.message));
      } else {
        pending.resolve(data.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async eval(expression, awaitPromise = false) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result.value;
  }

  close() {
    this.ws.close();
  }
}

async function launchChrome() {
  const profile = await mkdtemp(join(tmpdir(), "train-route-explorer-ui-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    TEST_URL,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      return response.ok;
    } catch {
      return false;
    }
  }, { timeoutMs: 15_000, message: "Chrome DevTools endpoint" });

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  assert(page?.webSocketDebuggerUrl, `No Chrome page target found. Chrome stderr:\n${stderr}`);

  return {
    profile,
    chrome,
    client: new CdpClient(page.webSocketDebuggerUrl),
    async cleanup() {
      if (!chrome.killed) {
        chrome.kill("SIGTERM");
      }
      await Promise.race([
        new Promise((resolve) => chrome.once("exit", resolve)),
        sleep(2_000),
      ]);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          return;
        } catch (error) {
          if (attempt === 4) throw error;
          await sleep(200);
        }
      }
    },
  };
}

async function main() {
  const browser = await launchChrome();
  const page = browser.client;
  await page.connect();

  try {
    await page.send("Runtime.enable");
    await page.send("Page.enable");
    await page.send("Page.navigate", { url: TEST_URL });
    await page.eval(`
      new Promise((resolve) => {
        if (document.readyState === "complete") resolve(true);
        window.addEventListener("load", () => resolve(true), { once: true });
      })
    `, true);

    assert(await page.eval(`document.querySelector("h1")?.textContent`) === "Train Route Explorer", "Page header should render");
    assert(await page.eval(`document.querySelector("#config-apply") === null`), "Old apply route settings button should not render");
    assert(await page.eval(`document.querySelector(".time-config-panel label:first-child input")?.id === "day-calendar"`), "Day selector should be first in the time settings panel");

    await page.eval(`document.querySelector("#load-bundled").click()`);
    await waitFor(async () => page.eval(`document.querySelector("#cache-status-text")?.textContent.includes("Cache ready")`), {
      timeoutMs: 120_000,
      message: "GTFS context to be ready",
    });

    const loadedCounts = await page.eval(`({
      stationCount: document.querySelectorAll("#config-local-origins input[type='checkbox']").length,
      trainTypeCount: document.querySelectorAll("#config-train-types input[type='checkbox']").length,
      highlightCount: document.querySelectorAll("#highlight-stations input[type='checkbox']").length,
      dayValue: document.querySelector("#day-calendar").value
    })`);
    assert(loadedCounts.stationCount > 0, "Station checkbox list should populate");
    assert(loadedCounts.trainTypeCount > 0, "Train type checkbox list should populate");
    assert(loadedCounts.highlightCount > 0, "Highlights checkbox list should populate");
    assert(Boolean(loadedCounts.dayValue), "Calendar day should be selected after load");

    async function assertSelectedFirst(containerSelector, label) {
      const result = await page.eval(`(() => {
        const boxes = Array.from(document.querySelectorAll("${containerSelector} input[type='checkbox']"));
        const flags = boxes.map((box) => box.checked);
        const firstUnchecked = flags.findIndex((checked) => !checked);
        const laterChecked = firstUnchecked >= 0 && flags.slice(firstUnchecked + 1).some(Boolean);
        return { total: boxes.length, checked: flags.filter(Boolean).length, laterChecked };
      })()`);
      assert(result.total > 0, `${label} should have checkbox rows`);
      assert(!result.laterChecked, `${label} should sort selected rows first`);
    }

    await assertSelectedFirst("#config-local-origins", "Side A stations");
    await assertSelectedFirst("#config-connection-stations", "Transfer stations");
    await assertSelectedFirst("#config-side-b-destinations", "Side B stations");
    await assertSelectedFirst("#config-train-types", "Train types");
    await assertSelectedFirst("#highlight-stations", "Highlights");

    async function filterAndAssert(filterSelector, containerSelector, query, label) {
      const filterSelectorJson = JSON.stringify(filterSelector);
      const containerSelectorJson = JSON.stringify(`${containerSelector} .station-choice span`);
      const result = await page.eval(`(() => {
        const filter = document.querySelector(${filterSelectorJson});
        filter.value = ${JSON.stringify(query)};
        filter.dispatchEvent(new Event("input", { bubbles: true }));
        const labels = Array.from(document.querySelectorAll(${containerSelectorJson})).map((node) => node.textContent);
        return labels;
      })()`);
      assert(result.length > 0, `${label} filter should leave visible rows`);
      assert(result.every((item) => item.toLowerCase().includes(query.toLowerCase())), `${label} filter should restrict visible rows`);
    }

    await filterAndAssert('.station-filter[data-role="local_origins"]', "#config-local-origins", "Saujon", "Side A");
    await filterAndAssert('.station-filter[data-role="connection_stations"]', "#config-connection-stations", "Poitiers", "Transfer");
    await filterAndAssert('.station-filter[data-role="side_b_destinations"]', "#config-side-b-destinations", "Paris", "Side B");
    await filterAndAssert("#train-type-filter", "#config-train-types", "TER", "Train type");
    await filterAndAssert("#highlight-filter", "#highlight-stations", "Saujon", "Highlights");

    async function toggleFirstVisible(containerSelector, label) {
      const containerSelectorJson = JSON.stringify(containerSelector);
      const result = await page.eval(`(() => {
        const box = document.querySelector(${JSON.stringify(`${containerSelector} input[type='checkbox']`)});
        if (!box) return null;
        const value = box.value;
        const before = box.checked;
        box.checked = !box.checked;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        const afterBox = Array.from(document.querySelectorAll(${JSON.stringify(`${containerSelector} input[type='checkbox']`)})).find((candidate) => candidate.value === value);
        return { before, after: afterBox?.checked, value };
      })()`);
      assert(result, `${label} should have a visible checkbox to edit`);
      assert(result.before !== result.after, `${label} checkbox should toggle`);
    }

    await toggleFirstVisible("#config-local-origins", "Side A station list");
    await toggleFirstVisible("#config-connection-stations", "Transfer station list");
    await toggleFirstVisible("#config-side-b-destinations", "Side B station list");
    await toggleFirstVisible("#config-train-types", "Train type list");

    const refreshPrompt = await page.eval(`({
      buttonCount: document.querySelectorAll(".refresh-routes").length,
      timelineText: document.querySelector("#routes-time-chart")?.textContent || "",
      textResultPanelCount: document.querySelectorAll(".list-panel, #routes-list, #routes-list-reverse").length
    })`);
    assert(refreshPrompt.buttonCount === 1, "Route settings edits should replace results with one refresh button");
    assert(refreshPrompt.timelineText.includes("Route settings changed"), "Timeline should explain that route settings changed");
    assert(refreshPrompt.textResultPanelCount === 0, "Textual result panels should not render");

    await page.eval(`document.querySelector(".refresh-routes").click()`);
    await waitFor(async () => page.eval(`document.querySelector("#cache-status-text")?.textContent.includes("Cache ready") && !document.querySelector(".refresh-routes")`), {
      timeoutMs: 120_000,
      message: "route settings refresh to complete",
    });

    const noTransferStationsSelected = await page.eval(`(() => {
      const filter = document.querySelector('.station-filter[data-role="connection_stations"]');
      filter.value = "";
      filter.dispatchEvent(new Event("input", { bubbles: true }));
      let box = document.querySelector("#config-connection-stations input[type='checkbox']:checked");
      while (box) {
        box.checked = false;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        box = document.querySelector("#config-connection-stations input[type='checkbox']:checked");
      }
      return {
        checked: document.querySelectorAll("#config-connection-stations input[type='checkbox']:checked").length,
        refreshVisible: Boolean(document.querySelector(".refresh-routes"))
      };
    })()`);
    assert(noTransferStationsSelected.checked === 0, "Every transfer station checkbox should be unselectable");
    assert(noTransferStationsSelected.refreshVisible, "Clearing transfer stations should require a route refresh");

    const noHighlightsSelected = await page.eval(`(() => {
      const filter = document.querySelector("#highlight-filter");
      filter.value = "";
      filter.dispatchEvent(new Event("input", { bubbles: true }));
      let box = document.querySelector("#highlight-stations input[type='checkbox']:checked");
      while (box) {
        box.checked = false;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        box = document.querySelector("#highlight-stations input[type='checkbox']:checked");
      }
      return document.querySelectorAll("#highlight-stations input[type='checkbox']:checked").length;
    })()`);
    assert(noHighlightsSelected === 0, "Every highlight checkbox should be unselectable");

    const dayChanged = await page.eval(`(() => {
      const input = document.querySelector("#day-calendar");
      const before = input.value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { before, after: input.value, type: input.type };
    })()`);
    assert(dayChanged.type === "date", "Day selector should use a date input");
    assert(Boolean(dayChanged.after), "Day date input should keep a selected value");

    console.log("Train Route Explorer UI tests passed");
  } finally {
    page.close();
    await browser.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
