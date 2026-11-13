// Browser tests against the built static export in dist/.
// Files are served through Playwright request routing at an IPFS-style subpath
// (http://game.test/ipfs/bafytest/), so no server process is needed and any
// request leaving that folder is recorded as a failure.
// Usage: npm run build && node tests/e2e/run.mjs   (IMD_PLAYWRIGHT=/path/to/playwright/index.mjs optional)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'dist');
const pw = await import(process.env.IMD_PLAYWRIGHT ? pathToFileURL(process.env.IMD_PLAYWRIGHT).href : 'playwright');
const { chromium } = pw.default ?? pw;
const shotDir = process.env.SHOTS ?? path.join(root, 'test/scratch/e2e-shots');
fs.mkdirSync(shotDir, { recursive: true });

const BASE = 'http://game.test/ipfs/bafytest/';
const results = [];
let failures = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failures++; results.push(`FAIL ${name}: ${e?.message ?? e}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

const HOST_HTML = `<!doctype html><html><body><h1>Host</h1>
<iframe id="g" sandbox="allow-scripts allow-pointer-lock" src="${BASE}index.html?e2e" width="900" height="700"></iframe>
<iframe id="rogue" sandbox="allow-scripts" srcdoc="<script>window.addEventListener('message',e=>{ if(e.data==='attack'){ parent.frames[0].postMessage({protocol:'pepe-game/1',type:'pause',channel:'chan-1'},'*'); parent.frames[0].postMessage({protocol:'pepe-game/1',type:'init',channel:'evil'},'*'); } });</script>"></iframe>
<script>
window.msgs = [];
window.addEventListener('message', (e) => { if (e.source === document.getElementById('g').contentWindow) window.msgs.push(e.data); });
window.send = (m) => document.getElementById('g').contentWindow.postMessage(m, '*');
</script></body></html>`;

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts);
  const external = [];
  const missing = [];
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.host === 'host.test') return route.fulfill({ status: 200, contentType: 'text/html', body: HOST_HTML });
    if (u.host === 'game.test' && u.pathname.startsWith('/ipfs/bafytest/')) {
      let rel = decodeURIComponent(u.pathname.slice('/ipfs/bafytest/'.length)) || 'index.html';
      const file = path.join(dist, rel);
      if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { missing.push(u.pathname); return route.fulfill({ status: 404, body: 'missing' }); }
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (u.protocol === 'data:' || u.protocol === 'about:') return route.continue();
    external.push(u.href);
    return route.abort();
  });
  return { ctx, external, missing };
}

async function openGame(ctx, query = '?e2e') {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}${query}`);
  await page.waitForFunction(() => !!window.__frogBlast);
  return { page, errors };
}
const st = (page) => page.evaluate(() => window.__frogBlast.state());
async function waitPhase(page, phase, timeout = 8000) {
  await page.waitForFunction((p) => window.__frogBlast.state()?.phase === p, phase, { timeout });
}

// ---------- static export checks ----------
await test('manifest is exactly the required object', async () => {
  const m = JSON.parse(fs.readFileSync(path.join(dist, 'pepe-game.json'), 'utf8'));
  const want = {"schemaVersion":"pepe-browser-game/1","title":"Frog Blast","version":"1.0.0","summary":"Drop bombs, blast through crates and outsmart rival frogs.","description":"A classic garden bomb arena with chain reactions and collectible upgrades.\n\nPlay solo against bots or challenge a friend on the same keyboard. First to three round wins takes the match.","controls":"Player 1: WASD and Space. Player 2: arrow keys and Enter. Mobile: directional pad and bomb button. P or Escape pauses.","genre":"arcade","players":2,"mobile":true,"entry":"index.html","cover":"cover.svg"};
  assert(JSON.stringify(m) === JSON.stringify(want), 'manifest differs');
  assert(fs.existsSync(path.join(dist, m.entry)) && fs.existsSync(path.join(dist, m.cover)), 'entry/cover missing');
});
await test('cover.svg is 1200x630 with matching viewBox', async () => {
  const s = fs.readFileSync(path.join(dist, 'cover.svg'), 'utf8');
  const tag = s.match(/<svg[^>]*>/)[0];
  assert(/width="1200"/.test(tag) && /height="630"/.test(tag) && /viewBox="0 0 1200 630"/.test(tag), tag);
});
await test('index.html uses only relative local asset URLs that exist', async () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href|content)="([^"]+)"/g)].map((m) => m[1]).filter((v) => /\.(js|css|svg|png|json|woff2?)$/.test(v));
  assert(refs.length >= 4, 'few refs');
  for (const r of refs) {
    assert(!/^(\/|https?:|\/\/)/.test(r), `non-relative ${r}`);
    assert(fs.existsSync(path.join(dist, r)), `missing ${r}`);
  }
  for (const f of fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.css') || f.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(dist, 'assets', f), 'utf8');
    assert(!/https?:\/\/(?!www\.w3\.org)/.test(s.replace(/http:\/\/www\.w3\.org[^"']*/g, '')), `absolute URL inside ${f}`);
  }
});

const browser = await chromium.launch();

// ---------- standalone desktop ----------
{
  const { ctx, external, missing } = await newContext(browser, { viewport: { width: 1440, height: 900 } });
  const { page, errors } = await openGame(ctx);

  await test('standalone loads at a gateway subpath with no errors, no autoplay', async () => {
    const m = await page.evaluate(() => window.__frogBlast.menuState());
    assert(m.audio === 'none', `audio context exists before gesture: ${m.audio}`);
    assert(m.loops === 1, 'loops');
    assert((await page.title()).includes('Frog Blast'), 'title');
    await page.screenshot({ path: path.join(shotDir, 'menu-1440.png') });
  });

  await test('how to play explains controls and bomb danger', async () => {
    await page.click('#open-howto');
    const txt = await page.textContent('#howto');
    assert(/Space/.test(txt) && /Enter/.test(txt) && /including you/.test(txt), 'howto text');
    await page.click('#howto button[type=submit]');
  });

  await test('solo: P1 moves with WASD, bombs once per press, bots move', async () => {
    await page.click('#play-solo');
    let s = await st(page);
    assert(s.players.length === 4 && s.players.filter((p) => p.controller === 'bot').length === 3, 'roster');
    await waitPhase(page, 'playing');
    s = await st(page);
    const bots0 = s.players.slice(1).map((p) => [p.x, p.y]);
    await page.keyboard.down('KeyS');
    await sleep(250);
    await page.keyboard.up('KeyS');
    s = await st(page);
    assert(s.players[0].y > 1.3, `P1 did not move down: ${s.players[0].y}`);
    // Hold Space: auto-repeat must not place more than one bomb.
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    s = await st(page);
    const mine = s.bombs.filter((b) => b.owner === 0).length;
    assert(mine === 1, `expected 1 bomb, got ${mine}`);
    await page.keyboard.up('Space');
    await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyD'); await sleep(400); await page.keyboard.up('KeyD');
    await sleep(800);
    s = await st(page);
    const moved = s.players.slice(1).some((p, i) => p.alive && (p.x !== bots0[i][0] || p.y !== bots0[i][1]));
    assert(moved, 'no bot moved');
    assert(audioOk(await st(page)), 'audio');
    const box = await page.locator('#arena').boundingBox();
    assert(box && box.height >= 700 && Math.abs(box.width / box.height - 15 / 13) < 0.02, `arena too small at 1440x900: ${JSON.stringify(box)}`);
    await page.screenshot({ path: path.join(shotDir, 'solo-1440.png') });
  });
  function audioOk(s) { return s.audio === 'running' || s.audio === 'suspended'; }

  await test('pause freezes fuse, blast and round time; resume has no jump', async () => {
    let s = await st(page);
    if (s.phase !== 'playing') { await page.evaluate(() => window.__frogBlast.state()); }
    // Put a fresh bomb down so a fuse is running.
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyP');
    const a = await st(page);
    assert(a.paused && a.overlay === 'pause', 'not paused');
    await sleep(1200);
    const b = await st(page);
    assert(a.tick === b.tick && a.roundTick === b.roundTick, `ticks moved while paused ${a.tick}->${b.tick}`);
    assert(JSON.stringify(a.bombs) === JSON.stringify(b.bombs) && a.fire === b.fire, 'bombs/fire changed while paused');
    assert(JSON.stringify(a.players) === JSON.stringify(b.players), 'players moved while paused');
    await page.keyboard.press('Escape');
    await sleep(200);
    const c = await st(page);
    assert(!c.paused, 'did not resume');
    assert(c.tick - b.tick < 30, `time jump after resume: ${c.tick - b.tick} ticks in 200 ms`);
  });

  await test('focus loss clears held keys and pauses', async () => {
    await page.keyboard.down('KeyD');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const s = await st(page);
    assert(s.held === 0, `held ${s.held}`);
    assert(s.paused, 'not paused on blur');
    await page.keyboard.up('KeyD');
    await page.click('#ov-actions button:has-text("Resume")', { delay: 0 }).catch(() => {});
    await sleep(400);
    await page.click('#ov-actions button:has-text("Resume")').catch(() => {});
    assert(!(await st(page)).paused, 'resume button');
  });

  await test('restart clears scores, bombs, timers, inputs; one loop only', async () => {
    await page.click('#btn-pause');
    await sleep(400);
    await page.keyboard.down('KeyA');
    await page.click('#ov-actions button:has-text("Restart match")');
    const s = await st(page);
    // A frame may tick once or twice between the click and this read.
    assert(s.round === 1 && s.tick < 10 && s.phase === 'countdown' && s.bombs.length === 0 && s.fire === 0,
      `not reset ${JSON.stringify({ r: s.round, t: s.tick, ph: s.phase, b: s.bombs.length, f: s.fire })}`);
    assert(s.players.every((p) => p.score === 0 && p.roundWins === 0 && p.alive), 'scores');
    assert(s.held === 0, `held ${s.held}`);
    assert(s.loops === 1, 'duplicate loops');
    await page.keyboard.up('KeyA');
  });

  await test('first to three wins, results, standings, rematch', async () => {
    for (let r = 0; r < 3; r++) {
      await waitPhase(page, 'playing');
      await page.evaluate(() => { window.__frogBlast.eliminateAllBut(0); window.__frogBlast.run(200); });
      const s = await st(page);
      if (r < 2) {
        assert(s.phase === 'roundResult' && s.overlay === 'round', `round overlay ${s.phase}`);
        const t = await page.textContent('#ov-title');
        assert(/Moss wins round/.test(t), t);
        assert(await page.isVisible('#standings'), 'standings');
        await sleep(400);
        await page.click('#ov-actions button:has-text("Next round")');
      } else {
        assert(s.phase === 'matchOver' && s.overlay === 'match', 'match overlay');
        assert(s.players[0].roundWins === 3 && s.players[0].score === 75, `score ${s.players[0].score}`);
        await page.screenshot({ path: path.join(shotDir, 'match-over-1440.png') });
      }
    }
    await sleep(400);
    await page.click('#ov-actions button:has-text("Rematch")');
    const s = await st(page);
    assert(s.round === 1 && s.players.every((p) => p.roundWins === 0 && p.score === 0), 'rematch reset');
  });

  await test('draws: simultaneous elimination and timeout award no win', async () => {
    await waitPhase(page, 'playing');
    await page.evaluate(() => { window.__frogBlast.eliminateAllBut(-1); window.__frogBlast.run(1); });
    let s = await st(page);
    assert(s.results.at(-1).winner === null && s.players.every((p) => p.roundWins === 0), 'all-out draw');
    await page.evaluate(() => window.__frogBlast.run(200));
    assert(/draw/.test(await page.textContent('#ov-title')), 'draw title');
  });

  await test('no console errors, no external requests, no missing files', async () => {
    assert(errors.length === 0, errors.join(' | '));
    assert(external.length === 0, external.join(' '));
    assert(missing.length === 0, missing.join(' '));
  });

  // Local versus: two humans, one keyboard.
  await test('local versus: simultaneous WASD and arrows, Space and Enter', async () => {
    await page.goto(`${BASE}?e2e&seed=5`);
    await page.waitForFunction(() => !!window.__frogBlast);
    await page.click('#play-versus');
    let s = await st(page);
    assert(s.players.length === 2 && s.players[1].controller === 'p2', 'versus roster (bots off by default)');
    await waitPhase(page, 'playing');
    await page.keyboard.down('KeyS');
    await page.keyboard.down('ArrowUp');
    await sleep(250);
    s = await st(page);
    await page.keyboard.up('KeyS');
    await page.keyboard.up('ArrowUp');
    assert(s.players[0].y > 1.2 && s.players[1].y < 10.8, `both should move: ${s.players[0].y} ${s.players[1].y}`);
    await page.keyboard.down('Space');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Space');
    await page.keyboard.up('Enter');
    await sleep(120);
    s = await st(page);
    assert(s.bombs.length === 2 && new Set(s.bombs.map((b) => b.owner)).size === 2, `bombs ${JSON.stringify(s.bombs)}`);
    await page.screenshot({ path: path.join(shotDir, 'versus-1440.png') });
  });
  await ctx.close();
}

// ---------- mobile solo with multitouch ----------
{
  const { ctx } = await newContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const { page, errors } = await openGame(ctx);
  await test('mobile 390: product and Play solo on the first screen', async () => {
    const box = await page.locator('#play-solo').boundingBox();
    const pv = await page.locator('#preview').boundingBox();
    assert(box && box.y + box.height <= 844, `play button below fold: ${box?.y}`);
    assert(pv && pv.y < 844, 'preview off screen');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(sw <= 390, `horizontal overflow ${sw}`);
    await page.screenshot({ path: path.join(shotDir, 'menu-390.png') });
  });
  await test('mobile: d-pad movement and bomb button together (multitouch), cancel releases', async () => {
    await page.tap('#play-solo');
    assert(await page.isVisible('#touch'), 'touch controls hidden');
    await waitPhase(page, 'playing');
    const s0 = await st(page);
    const pad = await page.locator('#dpad').boundingBox();
    const bomb = await page.locator('#bomb-btn').boundingBox();
    await page.evaluate(({ pad, bomb }) => {
      const fire = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
      const p = document.getElementById('dpad');
      const b = document.getElementById('bomb-btn');
      fire(p, 'pointerdown', 1, pad.x + pad.width / 2, pad.y + pad.height * 0.9); // down
      fire(b, 'pointerdown', 2, bomb.x + bomb.width / 2, bomb.y + bomb.height / 2);
      fire(b, 'pointerup', 2, bomb.x + bomb.width / 2, bomb.y + bomb.height / 2);
    }, { pad, bomb });
    await sleep(350);
    const s1 = await st(page);
    assert(s1.bombs.some((b) => b.owner === 0), 'no bomb from touch');
    assert(s1.players[0].y > s0.players[0].y, 'no touch movement');
    await page.evaluate(() => document.getElementById('dpad').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'touch', bubbles: true })));
    const a = (await st(page)).players[0].y;
    await sleep(200);
    const b = (await st(page)).players[0].y;
    assert(a === b, `still moving after pointercancel ${a} -> ${b}`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(sw <= 390, `overflow ${sw}`);
    const ab = await page.locator('#arena').boundingBox();
    assert(ab && ab.width >= 360, `arena too small at 390: ${JSON.stringify(ab)}`);
    await page.screenshot({ path: path.join(shotDir, 'solo-390.png') });
    assert(errors.length === 0, errors.join(' | '));
  });
  await ctx.close();
}

// ---------- sandboxed iframe + bridge ----------
{
  const { ctx, external } = await newContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://host.test/');
  const frame = await (async () => { for (let i = 0; i < 50; i++) { const f = page.frames().find((f) => f.url().includes('bafytest')); if (f) { try { if (await f.evaluate(() => !!window.__frogBlast)) return f; } catch {} } await sleep(100); } throw new Error('no frame'); })();
  const fst = () => frame.evaluate(() => window.__frogBlast.state());
  const msgs = () => page.evaluate(() => window.msgs);

  await test('iframe sandbox="allow-scripts allow-pointer-lock": runs with storage denied, muted, no autoplay', async () => {
    const sb = await page.getAttribute('#g', 'sandbox');
    assert(sb === 'allow-scripts allow-pointer-lock', sb);
    const m = await frame.evaluate(() => window.__frogBlast.menuState());
    assert(m.storage === false, 'storage should be unavailable in an opaque origin');
    assert(m.audio === 'none', 'audio before gesture');
    assert(await frame.isVisible('#storage-note'), 'storage note');
    await frame.click('#menu-sound'); // mute; must not throw without storage
    const m2 = await frame.evaluate(() => window.__frogBlast.menuState());
    assert(m2.muted === true, 'mute');
  });

  await test('bridge: init -> ready with channel; wrong source/protocol/channel ignored; pause/resume', async () => {
    await page.evaluate(() => window.send({ protocol: 'pepe-game/1', type: 'init', channel: 'chan-1' }));
    await sleep(150);
    let m = await msgs();
    assert(m.length === 1 && m[0].type === 'ready' && m[0].channel === 'chan-1' && m[0].protocol === 'pepe-game/1', JSON.stringify(m));
    await frame.click('#play-solo');
    await frame.waitForFunction(() => window.__frogBlast.state()?.phase === 'playing');
    await page.evaluate(() => window.send({ protocol: 'pepe-game/1', type: 'pause', channel: 'other' }));
    await page.evaluate(() => window.send({ protocol: 'pepe-game/2', type: 'pause', channel: 'chan-1' }));
    await page.evaluate(() => window.send({ type: 'pause', channel: 'chan-1' }));
    await page.evaluate(() => document.getElementById('rogue').contentWindow.postMessage('attack', '*'));
    await sleep(200);
    let s = await fst();
    assert(!s.paused, `paused by an invalid message ${JSON.stringify(s.reasons)}`);
    assert((await msgs()).length === 1, 'rogue init answered');
    await page.evaluate(() => window.send({ protocol: 'pepe-game/1', type: 'pause', channel: 'chan-1' }));
    await sleep(100);
    const a = await fst();
    assert(a.paused && a.reasons.includes('host'), 'host pause');
    await sleep(600);
    const b = await fst();
    assert(a.tick === b.tick && JSON.stringify(a.bombs) === JSON.stringify(b.bombs), 'moved while host-paused');
    await page.evaluate(() => window.send({ protocol: 'pepe-game/1', type: 'resume', channel: 'wrong' }));
    await sleep(100);
    assert((await fst()).paused, 'resumed by wrong channel');
    await page.evaluate(() => window.send({ protocol: 'pepe-game/1', type: 'resume', channel: 'chan-1' }));
    await sleep(200);
    s = await fst();
    assert(!s.paused && s.tick - b.tick < 30, `resume ${s.tick - b.tick}`);
  });

  await test('bridge: exactly one integer gameover per completed match, none for abandoned', async () => {
    // Abandon a match part-way: no report.
    await frame.evaluate(() => { window.__frogBlast.eliminateAllBut(0); window.__frogBlast.run(200); });
    await sleep(400);
    await frame.click('#ov-actions button:has-text("Quit to menu")');
    await frame.click('#play-solo');
    for (let r = 0; r < 3; r++) {
      await frame.waitForFunction(() => window.__frogBlast.state()?.phase === 'playing');
      await frame.evaluate(() => { window.__frogBlast.eliminateAllBut(0); window.__frogBlast.run(200); });
      if (r < 2) { await sleep(400); await frame.click('#ov-actions button:has-text("Next round")'); }
    }
    await frame.evaluate(() => window.__frogBlast.run(300)); // idle on the final screen
    await sleep(200);
    let over = (await msgs()).filter((x) => x.type === 'gameover');
    assert(over.length === 1, `gameover count ${over.length}`);
    const s = await fst();
    assert(Number.isInteger(over[0].score) && over[0].score >= 0 && over[0].score === s.players[0].score, JSON.stringify(over[0]));
    assert(over[0].channel === 'chan-1' && over[0].protocol === 'pepe-game/1', 'gameover envelope');
    await sleep(300);
    await frame.click('#ov-actions button:has-text("Rematch")');
    await frame.waitForFunction(() => window.__frogBlast.state()?.phase === 'playing');
    await frame.evaluate(() => window.__frogBlast.run(60));
    over = (await msgs()).filter((x) => x.type === 'gameover');
    assert(over.length === 1, 'rematch start must not report');
    await page.screenshot({ path: path.join(shotDir, 'iframe-1280.png') });
    assert(errors.length === 0 && external.length === 0, errors.concat(external).join(' | '));
  });
  await ctx.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
