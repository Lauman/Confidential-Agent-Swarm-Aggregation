// Records a >=2min demo video of apps/web with Playwright + ffmpeg.
// Usage:
//   pnpm add -D playwright && npx playwright install chromium
//   pnpm dev                      # :5173 + :3001 + :3000 in another terminal
//   pnpm record:demo               # -> videos/demo-<ts>.mp4 (>=120s)
// Requires: ffmpeg on PATH (checked at startup).
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';
const MIN_SECONDS = 130;
const outDir = path.resolve('videos');
fs.mkdirSync(outDir, { recursive: true });

try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
} catch {
  console.error('ffmpeg not found on PATH. Install it: brew install ffmpeg');
  process.exit(1);
}

let playwright;
try {
  playwright = (await import('playwright')).chromium;
} catch {
  console.error('playwright not installed. Run: pnpm add -D playwright && npx playwright install chromium');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const webmPath = path.join(outDir, `demo-${stamp}.webm`);
const mp4Path = path.join(outDir, `demo-${stamp}.mp4`);
const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${elapsed()}s] ${m}`);

async function waitFor(api, fn, timeout = 15000) {
  try {
    await fn.waitFor({ timeout });
    return true;
  } catch {
    return false;
  }
}

const browser = await playwright.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

try {
  log(`opening ${WEB_URL}`);
  await page.goto(WEB_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(WEB_URL));
  await page.waitForTimeout(8000);
  await page.mouse.move(640, 400, { steps: 20 });

  const deliberateBtn = page.locator('button.deliberate').first();
  await waitFor(deliberateBtn, deliberateBtn);
  log('homepage visible, showing proposals (8s hold done)');

  const presets = page.locator('.preset');
  if ((await presets.count()) > 0) {
    await presets.first().hover().catch(() => {});
    await sleep(4000);
  }

  const input = page.locator('input[name="proposalRef"]');
  if ((await input.count()) > 0) {
    await input.click().catch(() => {});
    await sleep(2000);
  }

  async function runRound(label) {
    log(`starting round: ${label}`);
    const btn = page.locator('button.deliberate').first();
    if ((await btn.count()) === 0) {
      await sleep(15000);
      return;
    }
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(2000);
    await btn.click().catch(() => {});
    log('Deliberate clicked — holding on theater while it types…');
    // Give the theater a beat to mount, then keep it framed while the
    // reading/weighing chatter types out and sealed lines land with ballots.
    await sleep(3000);
    const theater = page.locator('.theater').first();
    if ((await theater.count()) > 0) {
      await theater.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(12000);
      // Slow pan: slots (balloons) -> theater, so one frame shows seals
      // landing in both places together.
      await page.locator('.slots').first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(4000);
      await theater.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(8000);
    } else {
      log('theater not mounted yet — holding on slots');
      await page.locator('.slots').first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(12000);
    }
    // Verdict flow: round closes -> "Verify & reveal" button appears -> click
    // it (auto-verify usually beats us) -> .verdict-badge renders. Click first,
    // then wait for the badge so the recording never skips the reveal.
    const verifyBtn = page.locator('button.deliberate', { hasText: 'Verify' }).first();
    if (await waitFor(verifyBtn, verifyBtn, 45000)) {
      log('verdict ready — revealing');
      await verifyBtn.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(1500);
      await verifyBtn.click().catch(() => {});
    } else {
      log('no verify button yet — checking for badge anyway');
    }
    const badge = page.locator('.verdict-badge').first();
    const hasVerdict = await waitFor(badge, badge, 45000);
    log(hasVerdict ? 'verdict visible — holding on it' : 'no verdict yet (holders keep rolling)');
    if (hasVerdict) {
      await badge.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(8000);
    }
    await page.locator('.receipt-tx').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(8000);
  }

  await runRound('dao-grants-007');

  if ((await presets.count()) > 1) {
    await presets.nth(1).click().catch(() => {});
    log('switched to second proposal');
    await sleep(5000);
  }
  await runRound('dao-treasury-001');

  const remaining = MIN_SECONDS * 1000 - (Date.now() - t0);
  if (remaining > 0) {
    log(`full-page tour for ${(remaining / 1000).toFixed(0)}s to clear 2min`);
    // Slow full-page tour so the recording shows every section at least once.
    const stops = ['.masthead', '.slots', '.theater', '.verdict-badge', '.receipt-tx', '#main'];
    const perStop = Math.max(4000, Math.floor(remaining / stops.length));
    for (const sel of stops) {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(perStop);
      }
      if (Date.now() - t0 >= MIN_SECONDS * 1000) break;
    }
    const leftover = MIN_SECONDS * 1000 - (Date.now() - t0);
    if (leftover > 0) {
      await page.locator('#main').first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(leftover);
    }
  }
  log('done, finalizing video…');
} finally {
  await context.close();
  await browser.close();
}

const recorded = fs
  .readdirSync(outDir)
  .filter((f) => f.endsWith('.webm'))
  .map((f) => path.join(outDir, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || webmPath;
log(`raw recording: ${recorded}`);
execFileSync('ffmpeg', ['-y', '-i', recorded, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path], { stdio: 'inherit' });
const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp4Path}"`).toString().trim();
log(`saved ${mp4Path} (${Number(probe).toFixed(1)}s)`);
if (Number(probe) < 120) console.error('WARNING: video < 2min — re-run with services up.');
