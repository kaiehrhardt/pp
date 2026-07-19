import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

// Boots the real app (src/backend/index.ts) as a subprocess, the same way `bun run
// start` does, so this exercises the actual HTTP/WebSocket server and bundled
// frontend rather than a test double. Like roomChannel.integration.test.ts, this
// needs a reachable REDIS_URL (CI provides one as a service container; locally:
// `docker run -p 6379:6379 redis:7-alpine`) and a Playwright Chromium build
// (`bunx playwright install chromium`, once).

const PORT = 4319;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = join(import.meta.dir, "..");

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
  dbDir = mkdtempSync(join(tmpdir(), "pp-e2e-"));
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

describe("room flow", () => {
  test("create a room, join, vote, and see the round revealed", async () => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto(BASE_URL);
    await page.getByRole("button", { name: "Neuen Room erstellen" }).click();
    await page.waitForURL(/\/room\/.+/);

    await page.getByLabel("Dein Name").fill("Ada");
    await page.getByRole("button", { name: "Raum betreten" }).click();

    await page.locator(".card-hand").getByRole("button", { name: "5", exact: true }).click();

    const evaluation = page.locator(".evaluation");
    await evaluation.waitFor({ state: "visible" });
    await expect(evaluation.locator(".evaluation-recommendation").innerText()).resolves.toContain("5");

    await context.close();
  }, 20_000);
});
