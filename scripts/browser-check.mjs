/**
 * Real-browser verification for the Glassnik prototype, including video upload.
 *
 * Drives the dev-server app in headless Chromium and verifies:
 *   - page loads with no console errors or uncaught exceptions
 *   - real music playback starts from a user gesture and currentTime advances
 *   - a track that reaches its end moves on to the next track by itself and
 *     keeps playing
 *   - consecutive sequence videos do NOT restart the audio element
 *   - context changes transition to a new track
 *   - uploaded clips become a trip whose clips share one context, so music
 *     keeps playing across them
 *   - changing the trip context triggers a new recommendation
 *   - a bad/unsupported video file degrades to an error state, not a crash
 *   - music on/off, volume and localStorage persistence
 *
 * Usage (dev server must be running):
 *   node scripts/browser-check.mjs
 *   BASE_URL=http://localhost:4173/ node scripts/browser-check.mjs
 *   VIDEO_DIR=/path/to/clips node scripts/browser-check.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds two tiny local clips for the upload test.
 * Prefers VIDEO_DIR when provided, otherwise reuses any videos in the OS temp
 * directory, otherwise synthesises small placeholder files (which the app must
 * handle gracefully rather than crash on).
 */
function prepareClips() {
  const provided = process.env.VIDEO_DIR;
  if (provided && fs.existsSync(provided)) {
    const files = fs
      .readdirSync(provided)
      .filter((f) => /\.(webm|mp4|mov|mkv|ogv)$/i.test(f))
      .map((f) => path.join(provided, f));
    if (files.length >= 2) return files.slice(0, 2);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glassnik-clips-'));
  const a = path.join(tmp, 'kl-mall-1.webm');
  const b = path.join(tmp, 'kl-mall-2.webm');
  fs.writeFileSync(a, Buffer.from('not a real video'));
  fs.writeFileSync(b, Buffer.from('not a real video'));
  return [a, b];
}

const clipPaths = prepareClips();
const usingRealVideo =
  fs.statSync(clipPaths[0]).size > 1024 && /\.(webm|mp4|mov)$/i.test(clipPaths[0]);
console.log(
  `Using clips: ${clipPaths.map((p) => path.basename(p)).join(', ')} ` +
    `(${usingRealVideo ? 'real video' : 'placeholder bytes'})`,
);

// The battery runs on the Chromium engine by default, and on Safari's engine
// with BROWSER=webkit. Same checks, different engine — so platform claims
// ("works in Safari") are backed by the same automated evidence instead of
// only manual spot checks.
const engine = (process.env.BROWSER ?? 'chromium').toLowerCase();
const launcher = engine === 'webkit' ? webkit : chromium;
if (!['chromium', 'webkit'].includes(engine)) {
  console.error(`Unknown BROWSER="${engine}" — use chromium or webkit.`);
  process.exit(2);
}
console.log(`Browser engine: ${engine}`);
const browser = await launcher.launch();
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.addInitScript(() => {
  window.__srcAssignments = [];
  window.__playCalls = 0;
  window.__audioElements = [];

  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get() {
      return srcDescriptor.get.call(this);
    },
    set(value) {
      if (this instanceof HTMLAudioElement) window.__srcAssignments.push(String(value));
      return srcDescriptor.set.call(this, value);
    },
  });

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patchedPlay(...args) {
    if (this instanceof HTMLAudioElement) window.__playCalls += 1;
    return originalPlay.apply(this, args);
  };

  const OriginalAudio = window.Audio;
  window.Audio = function AudioSpy(...args) {
    const element = new OriginalAudio(...args);
    window.__audioElements.push(element);
    return element;
  };
  window.Audio.prototype = OriginalAudio.prototype;
});

const state = () =>
  page.evaluate(() => ({
    srcAssignments: window.__srcAssignments.slice(),
    playCalls: window.__playCalls,
    audioCount: window.__audioElements.length,
    element: window.__audioElements[0]
      ? {
          src: window.__audioElements[0].src,
          paused: window.__audioElements[0].paused,
          currentTime: window.__audioElements[0].currentTime,
          volume: window.__audioElements[0].volume,
          error: window.__audioElements[0].error ? window.__audioElements[0].error.code : null,
        }
      : null,
  }));

const status = () => page.locator('.player-status').textContent();
// Product rule: the viewer bar shows no track names. The research panel
// (.track-title) is the only on-screen place that names the current track,
// so the automated checks verify continuity there and separately assert
// that the viewer bar itself never displays one.
const title = () => page.locator('.track-title').textContent();

try {
  const response = await page.goto(BASE, { waitUntil: 'networkidle' });
  check('Page loads', response?.status() === 200, `HTTP ${response?.status()}`);

  // ---- Structure / UX ----
  check('Header renders Glassnik', (await page.locator('.app-header h1').textContent()) === 'Glassnik');
  check('Onboarding strip shown', (await page.locator('.onboarding').count()) === 1);
  check('Four tabs present', (await page.locator('[role="tab"]').count()) === 4);
  check(
    'Video & experiences tab is the default',
    (await page.locator('#tab-video').getAttribute('aria-selected')) === 'true',
  );
  check('Upload input present and accepts video', (await page.locator('#video-file-input').count()) === 1);
  check('Recommendation shows a real track', (await title()) === 'Velvet Skyline', await title());
  check('Player region present', (await page.locator('.player').count()) === 1);
  // Product rule: no track or artist names in the viewer bar itself.
  check(
    'Viewer bar shows no track names',
    (await page.locator('.player-title, .player-artist').count()) === 0,
  );
  check(
    'Viewer bar has the three-option music menu',
    (await page.locator('.player select option').count()) === 3,
  );

  // ---- Real music playback ----
  const before = await state();
  check('Exactly one audio element', before.audioCount === 1, `count=${before.audioCount}`);
  check('Nothing plays before a gesture', before.element === null || before.element.paused === true);

  await page.locator('[aria-label="Play music"]').click();
  await page.waitForFunction(
    () => document.querySelector('.player-status')?.textContent === 'Playing',
    undefined,
    { timeout: 5000 },
  );
  await sleep(600);
  const playing = await state();
  check('Media element not paused', playing.element.paused === false);
  check('currentTime advances', playing.element.currentTime > 0.2, `t=${playing.element.currentTime.toFixed(2)}s`);
  check('No media error', playing.element.error === null);

  // ---- Automatic advance when a track ends ----
  // Seek close to the end of the track. The browser fires the "ended" event,
  // and the app must move on to the next recommended track by itself.
  const beforeAdvance = await state();
  const titleBeforeAdvance = await title();
  await page.waitForFunction(
    () => {
      const el = window.__audioElements[0];
      return el && el.duration > 1 && isFinite(el.duration);
    },
    undefined,
    { timeout: 10000 },
  );
  const seekedTo = await page.evaluate(() => {
    const el = window.__audioElements[0];
    el.currentTime = Math.max(0, el.duration - 0.7);
    return el.currentTime;
  });
  await page.waitForFunction(
    (count) => window.__srcAssignments.length > count,
    beforeAdvance.srcAssignments.length,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () => document.querySelector('.player-status')?.textContent === 'Playing',
    undefined,
    { timeout: 15000 },
  );
  const afterAdvance = await state();
  check(
    'Track end moves on to a different track',
    (await title()) !== titleBeforeAdvance,
    `${titleBeforeAdvance} -> ${await title()}`,
  );
  check('Track end keeps the music playing', (await status()) === 'Playing');
  check(
    'Track end assigns the next source once',
    afterAdvance.srcAssignments.length === beforeAdvance.srcAssignments.length + 1,
    `${beforeAdvance.srcAssignments.length} -> ${afterAdvance.srcAssignments.length}`,
  );
  check(
    'Advanced track points at a real audio file',
    /\/audio\/track-\d+\.mp3$/.test(afterAdvance.element.src),
    afterAdvance.element.src,
  );
  check(
    'Advanced track starts from the beginning',
    afterAdvance.element.currentTime < 10,
    `seeked to ${seekedTo.toFixed(1)}s, new track at ${afterAdvance.element.currentTime.toFixed(2)}s`,
  );

  // ---- Upload clips ----
  await page.locator('#video-file-input').setInputFiles(clipPaths);
  await page.waitForFunction(() => document.querySelectorAll('.clip-row').length === 2, undefined, {
    timeout: 5000,
  });
  check('Two clips listed after upload', (await page.locator('.clip-row').count()) === 2);
  await page.waitForFunction(
    () => document.querySelector('.context-preview code')?.textContent === 'uploaded-trip',
    undefined,
    { timeout: 5000 },
  );
  check(
    'Uploaded clips resolve to one shared context',
    (await page.locator('.context-preview code').textContent()) === 'uploaded-trip',
  );
  check('Video element rendered', (await page.locator('video.video-element').count()) === 1);

  const afterUpload = await state();
  check(
    'Clip upload did not create a second audio element',
    afterUpload.audioCount === 1,
    `count=${afterUpload.audioCount}`,
  );

  // ---- Continuity across clips ----
  // The uploaded Experience is its own context, so the player moves to the
  // track of that Experience and keeps playing. That happens before the clip
  // change below.
  await page.waitForFunction(
    () => document.querySelector('.track-title')?.textContent === 'Velvet Skyline',
    undefined,
    { timeout: 10000 },
  );
  await sleep(600);
  const playing2 = await state();
  await page.waitForFunction(
    () => document.querySelector('.player-status')?.textContent === 'Playing',
    undefined,
    { timeout: 5000 },
  );
  const assignmentsBeforeClipChange = playing2.srcAssignments.length;
  const playCallsBefore = playing2.playCalls;
  const timeBefore = playing2.element.currentTime;

  await page.locator('button:has-text("Next clip")').click();
  await sleep(900);
  const afterClip2 = await state();

  check(
    'Clip 2: no new source assignment (music not restarted)',
    afterClip2.srcAssignments.length === assignmentsBeforeClipChange,
    `${assignmentsBeforeClipChange} -> ${afterClip2.srcAssignments.length}`,
  );
  check(
    'Clip 2: no extra play() call',
    afterClip2.playCalls === playCallsBefore,
    `${playCallsBefore} -> ${afterClip2.playCalls}`,
  );
  check(
    'Clip 2: currentTime keeps increasing',
    afterClip2.element.currentTime > timeBefore + 0.3,
    `${timeBefore.toFixed(2)}s -> ${afterClip2.element.currentTime.toFixed(2)}s`,
  );
  check('Clip 2: still Playing', (await status()) === 'Playing');
  check('Clip 2: active row moved to clip 2', (await page.locator('.clip-row.active .clip-name').textContent())?.includes('kl-mall-2') ?? false);

  // ---- Context change on an uploaded Experience ----
  const beforeContextChange = await state();
  await page.getByLabel('Category', { exact: true }).selectOption('beaches');
  await page.waitForFunction(
    () => document.querySelector('.track-title')?.textContent === 'Paper Lanterns',
    undefined,
    { timeout: 5000 },
  );
  await sleep(1200);
  const afterContextChange = await state();
  check(
    'Experience context change selects the beach-category track',
    (await title()) === 'Paper Lanterns',
    await title(),
  );
  check(
    'Trip context change assigns the new source once',
    afterContextChange.srcAssignments.length === beforeContextChange.srcAssignments.length + 1,
    `${beforeContextChange.srcAssignments.length} -> ${afterContextChange.srcAssignments.length}`,
  );
  check(
    'Trip context change transitions to /audio/track-2.mp3',
    afterContextChange.element.src.endsWith('/audio/track-2.mp3'),
    afterContextChange.element.src,
  );
  check('Still playing after context change', (await status()) === 'Playing');

  // ---- Video error handling ----
  // A file that is not a real video must end up in a clear error state
  // instead of loading forever.
  await page
    .waitForSelector('.video-status-error, .video-status-ready', { timeout: 15000 })
    .catch(() => undefined);
  const videoState = await page.evaluate(() => {
    const v = document.querySelector('video.video-element');
    return v ? { readyState: v.readyState, error: v.error ? v.error.code : null } : null;
  });
  if (usingRealVideo) {
    check(
      'Uploaded video decodes (readyState >= 2)',
      videoState !== null && videoState.readyState >= 2,
      `readyState=${videoState?.readyState}`,
    );
  } else {
    check(
      'Placeholder file degrades without crashing the app',
      (await page.locator('.video-status-error, .video-status-ready').count()) > 0,
      `videoError=${videoState?.error}`,
    );
  }
  check('Video is muted (music owns audio output)', await page.locator('video.video-element').evaluate((v) => v.muted));

  // ---- Player controls ----
  // Music off/on is now the "Music source" menu: Glassnik Music / Spotify
  // (future integration, disabled) / No Music. "No Music" pauses playback.
  await page.locator('.player select').selectOption('none');
  await sleep(400);
  const off = await state();
  check('No Music pauses element', off.element.paused === true);
  const offTime = off.element.currentTime;
  await sleep(500);
  check(
    'Time frozen while music is set to No Music',
    Math.abs((await state()).element.currentTime - offTime) < 0.05,
  );

  await page.locator('.player select').selectOption('glassnik');
  await page.waitForFunction(
    () => document.querySelector('.player-status')?.textContent === 'Playing',
    undefined,
    { timeout: 5000 },
  );
  check('Glassnik Music resumes playback', (await state()).element.paused === false);

  await page.locator('[aria-label="Volume"]').fill('42');
  await sleep(150);
  check(
    'Volume drives the media element',
    Math.abs((await state()).element.volume - 0.42) < 0.005,
  );
  check(
    'Volume persists to localStorage',
    (await page.evaluate(() => localStorage.getItem('glassnik.volume'))) === '0.42',
  );

  // ---- Other tabs still work ----
  await page.locator('#tab-experiences').click();
  await sleep(200);
  check('Sample experiences tab lists 15', (await page.locator('.experience-item').count()) === 15);

  // ---- Grouping browse: one soundtrack per Category / Place / Location ----
  // The core behaviour from the music brief: music continues across
  // different Experiences inside the same grouping and changes when the
  // grouping changes. Clicking a card also returns the player to the sample
  // soundtracks source (grouping applies to that source, not to uploads).
  await page.locator('.experience-item').first().click();
  await sleep(500);
  await page.locator('#grouping-select').selectOption('location:Lisbon');
  await page.waitForFunction(
    () => document.querySelector('.track-title')?.textContent === 'Windowlight',
    undefined,
    { timeout: 5000 },
  );
  // Let the engine's transition settle before taking the baseline, so the
  // grouping comparison measures the Tokyo click, not pending effects.
  await sleep(600);
  const beforeGroupSwitch = await state();
  const lisbonCards = await page.locator('.experience-item').count();
  check('Location grouping lists its 1 Experience', lisbonCards === 1, `cards=${lisbonCards}`);

  // Switching the grouping changes the selection (Lisbon market -> Velvet).
  await page.locator('#grouping-select').selectOption('category:shopping');
  await page.waitForFunction(
    () => document.querySelector('.track-title')?.textContent === 'Velvet Skyline',
    undefined,
    { timeout: 5000 },
  );
  await sleep(600);
  const shoppingCards = await page.locator('.experience-item').count();
  check('Category grouping lists its 6 Experiences', shoppingCards === 6, `cards=${shoppingCards}`);
  const afterGroupedSwitch = await state();
  check(
    'Grouping: switching applied the new soundtrack',
    afterGroupedSwitch.srcAssignments.length === beforeGroupSwitch.srcAssignments.length + 1 &&
      afterGroupedSwitch.srcAssignments.some((s) => s.endsWith('/audio/track-3.mp3')),
    afterGroupedSwitch.srcAssignments
      .map((s) => s.replace(/^.*\//, ''))
      .slice(-2)
      .join(' | '),
  );

  // Open a different Experience inside the grouping: the music must not restart.
  await page.getByRole('button', { name: /Tokyo shopping/ }).click();
  await sleep(400);
  const afterGroupedClick = await state();
  check(
    'Grouping: another Experience inside keeps the same track',
    (await title()) === 'Velvet Skyline',
    await title(),
  );
  check(
    'Grouping: opening another Experience re-assigns nothing',
    afterGroupedClick.srcAssignments.length === afterGroupedSwitch.srcAssignments.length,
    `${afterGroupedSwitch.srcAssignments.length} -> ${afterGroupedClick.srcAssignments.length}`,
  );

  // Clearing the grouping resumes per-Experience behaviour (Tokyo, shopping).
  await page.locator('#grouping-select').selectOption('');
  await sleep(600);
  check('Grouping: clearing resumes per-Experience soundtrack', (await title()) === 'Velvet Skyline');
  check(
    'Grouping: full experience list restored',
    (await page.locator('.experience-item').count()) === 15,
  );

  // ---- Music credits page ----
  // Track names live here, never in the viewer bar above the videos.
  await page.locator('#tab-credits').click();
  await sleep(200);
  check(
    'Music credits page renders its headings',
    (await page.locator('#credits-heading').textContent()) === 'Music credits',
  );
  const creditRows = await page.locator('table.credits-table tbody tr').count();
  check('Music credits lists all 59 tracks', creditRows === 59, `rows=${creditRows}`);
  check(
    'Music credits names the library track',
    (await page.locator('.credits').textContent())?.includes('Velvet Skyline') ?? false,
  );
  check(
    'Music credits flags licences as unverified',
    (await page.locator('.credits table tbody tr').first().textContent())?.includes('pending human verification') ?? false,
  );
  check(
    'Viewer bar still shows no track names',
    (await page.locator('.player-title, .player-artist').count()) === 0,
  );

  await page.locator('#tab-diagnostics').click();
  await sleep(200);
  const diag = await page.locator('details.diagnostics').textContent();
  check(
    'Diagnostics reports no missing audio files',
    !diag.includes('has no file under public/'),
  );

  check('No console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('No uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
  check('Script completed without exceptions', false, String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
