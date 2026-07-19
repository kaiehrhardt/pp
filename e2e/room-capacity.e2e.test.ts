import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { MAX_PARTICIPANTS } from "../src/backend/domain/room";

// Boots the real app the same way room-flow.e2e.test.ts does, but fills a single
// room to its MAX_PARTICIPANTS cap to visually verify the round-table layout
// (seat-position ring, name truncation, vote-badge flip) doesn't break once full,
// and that a 16th join is correctly rejected as roomFull. Needs a reachable
// REDIS_URL and a Playwright Chromium build, same as room-flow.e2e.test.ts.

const PORT = 4320;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = join(import.meta.dir, "..");
const SCREENSHOT_DIR = join(import.meta.dir, "screenshots");

let server: ReturnType<typeof Bun.spawn>;
let browser: Browser;
let dbDir: string;

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not accepting connections yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "pp-e2e-capacity-"));
  server = Bun.spawn({
    cmd: ["bun", "src/backend/index.ts"],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      TURSO_DATABASE_URL: `file:${join(dbDir, "e2e.db")}`,
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  await waitForServer(`${BASE_URL}/api/version`);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
  await server?.exited;
  rmSync(dbDir, { recursive: true, force: true });
});

describe("room capacity", () => {
  test(
    `fills a room with ${MAX_PARTICIPANTS} participants and screenshots the table`,
    async () => {
      const hostContext = await browser.newContext({ locale: "de-DE", viewport: { width: 1440, height: 1024 } });
      const hostPage = await hostContext.newPage();

      await hostPage.goto(BASE_URL);
      await hostPage.getByRole("button", { name: "Neuen Room erstellen" }).click();
      await hostPage.waitForURL(/\/room\/.+/);
      const roomUrl = hostPage.url();

      await hostPage.getByLabel("Dein Name").fill("Host");
      await hostPage.getByRole("button", { name: "Raum betreten" }).click();
      await hostPage.locator(".participant-tile").first().waitFor({ state: "visible" });

      const contexts = [hostContext];
      const pages = [hostPage];

      // Vote-and-reveal-then-screenshot at these seat counts, to compare the
      // round-table layout as it fills up. The last one doubles as the
      // MAX_PARTICIPANTS-full snapshot.
      const screenshotAt = new Set([8, 10, MAX_PARTICIPANTS]);

      async function voteRevealAndScreenshot(count: number) {
        for (const page of pages) {
          await page.locator(".card-hand").getByRole("button", { name: "5", exact: true }).click();
        }
        await hostPage.locator(".evaluation").waitFor({ state: "visible" });
        await hostPage.screenshot({ path: join(SCREENSHOT_DIR, `room-${count}-participants.png`) });

        // The table is sized off .table-area's own box (container query units,
        // see styles.css), not the raw viewport, specifically so a full room
        // never forces a page scroll — regardless of window size.
        const { scrollHeight, clientHeight } = await hostPage.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        }));
        expect(scrollHeight).toBeLessThanOrEqual(clientHeight);

        if (count < MAX_PARTICIPANTS) {
          await hostPage.getByRole("button", { name: "Neue Runde" }).click();
        }
      }

      // Join the remaining seats up to MAX_PARTICIPANTS, screenshotting at the
      // milestones above.
      for (let i = 2; i <= MAX_PARTICIPANTS; i++) {
        const context = await browser.newContext({ locale: "de-DE" });
        const page = await context.newPage();
        await page.goto(roomUrl);
        await page.getByLabel("Dein Name").fill(`User${i}`);
        await page.getByRole("button", { name: "Raum betreten" }).click();
        await page.locator(".participant-tile").first().waitFor({ state: "visible" });
        contexts.push(context);
        pages.push(page);

        if (screenshotAt.has(i)) {
          await expect(hostPage.locator(".participant-tile").count()).resolves.toBe(i);
          await voteRevealAndScreenshot(i);
        }
      }

      // A 16th join attempt must be turned away as the room is now full.
      const overflowContext = await browser.newContext({ locale: "de-DE" });
      const overflowPage = await overflowContext.newPage();
      await overflowPage.goto(roomUrl);
      await overflowPage.getByLabel("Dein Name").fill("Overflow");
      await overflowPage.getByRole("button", { name: "Raum betreten" }).click();
      await overflowPage.getByText("🙅").waitFor({ state: "visible" });
      await overflowContext.close();

      for (const context of contexts) await context.close();
    },
    60_000,
  );
});
