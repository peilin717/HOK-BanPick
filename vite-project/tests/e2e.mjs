import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url).pathname,
  origin = "http://127.0.0.1:5179";
const server = spawn(
  process.execPath,
  [
    root + "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5179",
    "--strictPort",
  ],
  { cwd: root, stdio: "pipe" },
);
let serverText = "";
server.stdout.on("data", (d) => (serverText += d));
server.stderr.on("data", (d) => (serverText += d));
let browser;
const checks = [];
const errors = [];
function check(label, value) {
  assert.ok(value, label);
  checks.push(label);
  console.log("PASS " + label);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (server.exitCode !== null) throw Error(serverText);
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  await context.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__audios = [];
    window.Audio = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        window.__audios.push(this);
      }
    };
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/control");
  await page.getByText("裁判控制已连接").waitFor();
  await page.getByRole("button", { name: "预选廉颇", exact: true }).waitFor();
  const display = await context.newPage();
  display.on("pageerror", (e) => errors.push(e.message));
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.goto(origin + "/display");
  await display.getByRole("region", { name: "比赛展示板" }).waitFor();
  check(
    "133 official heroes load",
    (await page.locator(".hero-tile").count()) === 133,
  );
  await page.getByRole("button", { name: "队伍与赛制" }).click();
  await page.getByLabel("赛事名称", { exact: true }).fill("计算机班荣耀杯");
  await page.getByLabel("队名", { exact: true }).first().fill("星火战队");
  await display.getByRole("heading", { name: "计算机班荣耀杯" }).waitFor();
  check(
    "team name synchronizes to display",
    (await display.getByRole("heading", { name: "星火战队" }).count()) === 1,
  );
  await page
    .locator('input[type=file][accept="image/png,image/jpeg,image/webp"]')
    .first()
    .setInputFiles(root + "public/media/heroes/105-portrait.jpg");
  await display.getByAltText("星火战队队标").waitFor();
  check(
    "logo import and display synchronization",
    (await display.getByAltText("星火战队队标").count()) === 1,
  );
  await page.getByRole("button", { name: "选禁控制", exact: true }).click();
  await page.getByRole("button", { name: "开始计时", exact: true }).click();
  await page.waitForTimeout(1100);
  const timer = await page.locator(".timer>strong").textContent();
  check("countdown advances", Number(timer) < 45);
  await display.reload();
  await display.locator(".phase-banner strong").waitFor();
  const displayTimer = await display
    .locator(".phase-banner strong")
    .textContent();
  check(
    "late-joining display preserves live countdown",
    Math.abs(Number(displayTimer) - Number(timer)) <= 2,
  );
  await page.getByRole("button", { name: "暂停计时", exact: true }).click();
  const catalog = JSON.parse(
    await readFile(root + "public/data/heroes.json", "utf8"),
  );
  const chosen = [];
  for (let i = 0; i < 20; i++) {
    const tile = page.locator(".hero-tile:not([disabled])").first();
    chosen.push(await tile.getAttribute("aria-label"));
    await tile.click();
    await page.locator(".confirm-bar button").click();
  }
  await page
    .getByRole("button", { name: "星火战队 获胜", exact: true })
    .waitFor();
  check(
    "complete 20-step BP renders ten picks",
    (await display.locator(".pick-card.locked").count()) === 10,
  );
  check(
    "all ten display images decode",
    await display
      .locator(".splash")
      .evaluateAll((els) => els.every((e) => e.complete && e.naturalWidth > 0)),
  );
  await mkdir(root + "test-results", { recursive: true });
  await display.screenshot({ path: root + "test-results/display.png" });
  await page.screenshot({
    path: root + "test-results/controller.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "撤销一手" }).click();
  check(
    "undo reopens final pick",
    (await page.locator(".hero-tile:not([disabled])").count()) > 0,
  );
  await page.getByRole("button", { name: chosen[19], exact: true }).click();
  await page.locator(".confirm-bar button").click();
  let saved = JSON.parse(
    await page.evaluate(() => localStorage.getItem("hok-class-cup-v1")),
  );
  const bluePicks = saved.selections
      .filter((s) => s.side === "blue" && s.action === "pick")
      .map((s) => s.hero),
    redPicks = saved.selections
      .filter((s) => s.side === "red" && s.action === "pick")
      .map((s) => s.hero);

  await page
    .getByRole("button", { name: "星火战队 获胜", exact: true })
    .click();
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await page.getByRole("button", { name: "开始下一局" }).click();
  await page.getByRole("button", { name: "交换红蓝方" }).click();
  for (let i = 0; i < 4; i++) {
    const tile = page.locator(".hero-tile:not([disabled])").last();
    await tile.click();
    await page.locator(".confirm-bar button").click();
  }
  const redName = catalog.heroes.find((h) => h.id === redPicks[0]).name,
    blueName = catalog.heroes.find((h) => h.id === bluePicks[0]).name;
  check(
    "global ownership follows team after swap",
    await page
      .getByRole("button", { name: `预选${redName}`, exact: true })
      .isDisabled(),
  );
  check(
    "opponent historical hero remains selectable",
    await page
      .getByRole("button", { name: `预选${blueName}`, exact: true })
      .isEnabled(),
  );
  await page.reload();
  await page.getByText("裁判控制已连接").waitFor();
  check(
    "reload restores current series and global restrictions",
    await page
      .getByRole("button", { name: `预选${redName}`, exact: true })
      .isDisabled(),
  );
  const second = await context.newPage();
  await second.goto(origin + "/control");
  await second.getByText("此窗口只读：等待其他裁判窗口关闭。").waitFor();
  check(
    "second controller cannot overwrite match",
    await second
      .getByRole("button", { name: `预选${blueName}`, exact: true })
      .isDisabled(),
  );
  await second.close();
  await page.getByRole("button", { name: "音乐与语音" }).click();
  await page.locator(".track-row").first().waitFor();
  await display.getByRole("button", { name: "启用此窗口声音" }).click();
  await display.getByText(/正在播放：/).waitFor();
  check(
    "bundled Know My Name full instrumental plays in display",
    await display.evaluate(() =>
      window.__audios.some(
        (a) =>
          a.src.includes("know-my-name-instrumental") &&
          !a.paused &&
          a.duration > 200,
      ),
    ),
  );
  await page.getByLabel("音乐阶段").selectOption("early");
  const testVoice = root + "public" + catalog.heroes[0].voice;
  await page
    .locator('input[type=file][accept="audio/*"]')
    .setInputFiles(testVoice);
  await page.locator(".track-row").last().waitFor();
  await display.waitForFunction(() =>
    window.__audios.some((a) => a.src.startsWith("blob:") && !a.paused),
  );
  check("phase-specific uploaded BGM supersedes bundled fallback", true);
  await page.getByRole("button", { name: "在此窗口试音" }).click();
  await page.getByText("另一窗口正在播放，请先在那里关闭声音").waitFor();
  check(
    "audio singleton prevents duplicate playback",
    await page.evaluate(() => window.__audios.length === 0),
  );
  await page.getByRole("button", { name: "紧急静音" }).click();
  await display.waitForFunction(() => window.__audios.every((a) => a.muted));
  check("emergency mute reaches display", true);
  await page.getByRole("button", { name: "恢复声音" }).click();
  await page.getByRole("button", { name: "选禁控制", exact: true }).click();
  await page
    .getByRole("button", { name: `预选${blueName}`, exact: true })
    .click();
  await page.locator(".confirm-bar button").click();
  await display.waitForFunction(() =>
    window.__audios.some((a) => a.src.includes("/media/heroes/") && !a.paused),
  );
  check(
    "locked hero voice preserves configured BGM volume",
    await display.evaluate(
      () => Math.abs(window.__audios.find((a) => a.src.startsWith("blob:")).volume - JSON.parse(localStorage.getItem("hok-class-cup-v1")).audio.bgm) < 0.0001,
    ),
  );
  await page.getByRole("button", { name: "队伍与赛制" }).click();

  await page.getByRole("button", { name: "新建系列赛", exact: true }).click();
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  const fixture = spawnSync(
    process.execPath,
    [root + "node_modules/tsx/dist/cli.mjs", root + "tests/peak-fixture.ts"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(fixture.status, 0, fixture.stderr);
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({
      name: "six-games.json",
      mimeType: "application/json",
      buffer: Buffer.from(fixture.stdout),
    });
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await page.getByRole("button", { name: "开始下一局" }).click();
  check(
    "BO7 seventh game automatically enters peak after 3:3",
    JSON.parse(
      await page.evaluate(() => localStorage.getItem("hok-class-cup-v1")),
    ).peak,
  );
  await page.getByRole("button", { name: "选禁控制", exact: true }).click();
  const peakNames = catalog.heroes.slice(0, 5).map((h) => h.name);
  for (let side = 0; side < 2; side++)
    for (const name of peakNames) {
      await page
        .getByRole("button", { name: `预选${name}`, exact: true })
        .click();
      await page.locator(".confirm-bar button").click();
    }
  check(
    "peak selections stay hidden on display",
    (await display.locator(".pick-card.locked").count()) === 0,
  );
  await page.getByRole("button", { name: "揭晓双方阵容", exact: true }).click();
  await display.locator(".pick-card.locked").first().waitFor();
  check(
    "peak reveals mirrored lineups together",
    (await display.locator(".pick-card.locked").count()) === 10,
  );
  const splitContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const split = await splitContext.newPage();
  split.on("pageerror", (e) => errors.push(e.message));
  await split.goto(origin);
  const referee = split.frameLocator('iframe[title="裁判控制界面"]');
  const screen = split.frameLocator('iframe[title="投屏主屏"]');
  await referee.getByText("裁判控制已连接").waitFor({state:"attached"});
  await screen.getByRole("region", { name: "比赛展示板" }).waitFor();
  const before = await split.locator(".main-screen-frame").boundingBox();
  await referee.getByRole("button", { name: "开始计时", exact: true }).click();
  await referee
    .getByRole("button", { name: "队伍与赛制", exact: true })
    .click();
  await referee
    .getByRole("button", { name: "新建系列赛", exact: true })
    .click();
  await referee.getByRole("dialog").waitFor();
  const timeBefore = Number(
    await screen.locator(".phase-banner strong").textContent(),
  );
  await split.waitForTimeout(1300);
  check(
    "referee confirmation does not pause main-screen timer",
    Number(await screen.locator(".phase-banner strong").textContent()) <
      timeBefore,
  );
  check(
    "referee dialog stays outside main screen",
    (await screen.getByRole("dialog").count()) === 0,
  );
  assert.deepEqual(
    await split.locator(".main-screen-frame").boundingBox(),
    before,
  );
  check(
    "referee navigation and scroll leave main-screen position unchanged",
    true,
  );
  await referee.getByRole("button", { name: "取消", exact: true }).click();
  await referee
    .getByLabel("队名", { exact: true })
    .first()
    .fill("分屏同步测试");
  await screen.getByRole("heading", { name: "分屏同步测试" }).waitFor();
  check("embedded referee synchronizes team changes to main screen", true);
  await split.screenshot({ path: root + "test-results/split-console.png" });
  await splitContext.close();
  check("no runtime errors", errors.length === 0);
  await context.tracing.stop({ path: root + "test-results/trace.zip" });
  await writeFile(
    root + "test-results/e2e-report.json",
    JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
