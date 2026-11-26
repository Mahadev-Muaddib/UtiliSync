const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const storeKey = 'utilisync.requests.v1';
let browser, server, baseUrl;

before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
  const files = new Set(['index.html', 'theme.css', 'demo.js', 'requests.js', 'map.js', 'app.js']);
  server = http.createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!files.has(file)) { response.writeHead(404).end(); return; }
    try {
      const data = await readFile(path.join(root, file));
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8' }).end(data);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openPage(t, { init, viewport, file = false } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'No browser runtime errors');
  });
  await page.goto(file ? pathToFileURL(path.join(root, 'index.html')).href : baseUrl);
  await page.locator('#map g').first().waitFor();
  return page;
}

async function fillRequest(page, purpose = 'Repair water connection', start = '2026-12-01', end = '2026-12-04') {
  await page.locator('#new').click();
  await page.locator('[name=purpose]').fill(purpose);
  await page.locator('[name=start]').fill(start);
  await page.locator('[name=end]').fill(end);
}

async function submit(page) {
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
}

test('requests retain warnings through review, approval, reload, and area switching', async t => {
  const page = await openPage(t);
  await fillRequest(page);
  assert.match(await page.locator('#warnings').innerText(), /resurfaced.*DG-101 overlaps/);
  await submit(page);
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), false);
  assert.match(await page.locator('#details').innerText(), /DG-103 · Submitted/);
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
  await page.locator('#role').selectOption('Coordinator');
  const warnings = await page.locator('#details .warnings').innerText();
  assert.match(warnings, /DG-101 overlaps/);
  assert.doesNotMatch(warnings, /DG-103 overlaps/);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  assert.match(await page.locator('#details').innerText(), /DG-103 · Approved/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'details');
  await page.reload();
  await page.locator('#search').fill('dg-103');
  await page.locator('#results button').click();
  assert.match(await page.locator('#details').innerText(), /DG-103 · Approved/);
  await page.locator('#area').selectOption('Kollam');
  assert.match(await page.locator('#results').innerText(), /DG-102/);
  assert.doesNotMatch(await page.locator('#results').innerText(), /DG-103/);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();
  await page.locator('#area').selectOption('Karunagappally');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, storeKey), 2);
  assert.doesNotMatch(await page.locator('#results').innerText(), /DG-103/);
});

test('submitting refreshes constraints and rejects invalid dates, purpose, and missing streets', async t => {
  const page = await openPage(t);
  await fillRequest(page, '   ');
  await submit(page);
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), true);
  assert.match(await page.locator('[name=purpose]').evaluate(input => input.validationMessage), /purpose/);
  // Assign without input events to verify the submit handler refreshes custom validity.
  await page.locator('[name=purpose]').evaluate(input => { input.value = 'Replace a valve'; });
  await page.locator('[name=end]').evaluate(input => { input.value = '2026-11-30'; });
  await submit(page);
  assert.match(await page.locator('[name=end]').evaluate(input => input.validationMessage), /on or after/);
  await page.locator('[name=end]').fill('2026-12-01');
  await page.locator('#choices input:checked').uncheck();
  await submit(page);
  assert.match(await page.locator('#choices input').first().evaluate(input => input.validationMessage), /at least one/);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storeKey), null);
  await page.locator('#choices input').first().check();
  await submit(page);
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), false);
  assert.match(await page.locator('#details').innerText(), /Replace a valve/);
});

test('rejection requires a reason and persists it', async t => {
  const page = await openPage(t);
  await page.locator('#role').selectOption('Coordinator');
  await page.locator('#results').getByRole('button', { name: /DG-101/ }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.match(await page.locator('#details').innerText(), /Submitted/);
  page.once('dialog', async dialog => {
    page.once('dialog', alert => alert.accept());
    await dialog.accept('  ');
  });
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.match(await page.locator('#details').innerText(), /Submitted/);
  page.once('dialog', dialog => dialog.accept('  Combine with planned repairs.  '));
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.match(await page.locator('#details').innerText(), /Rejection reason: Combine with planned repairs\./);
  await page.reload();
  await page.locator('#results').getByRole('button', { name: /DG-101/ }).click();
  assert.match(await page.locator('#details').innerText(), /Rejected/);
  assert.equal(await page.locator('#details .warnings').count(), 0);
});

test('keyboard focus survives map and result selection; layers remain operable', async t => {
  const page = await openPage(t);
  const road = page.locator('#map').getByRole('button', { name: 'Reedbank Lane', exact: true });
  await road.focus();
  await page.keyboard.press('Enter');
  assert.equal(await road.evaluate(node => document.activeElement === node), true);
  assert.equal(await road.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Copper Kite Street');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true');
  const result = page.locator('#results').getByRole('button', { name: 'Palm Loom Road', exact: true });
  await result.focus();
  await page.keyboard.press('Enter');
  assert.equal(await result.evaluate(node => document.activeElement === node), true);
  const layer = page.locator('#layers').getByLabel('Water', { exact: true });
  await layer.uncheck();
  assert.equal(await page.locator('#map polyline[stroke="#1964a3"]').count(), 0);
  await layer.check();
  assert.equal(await page.locator('#map polyline[stroke="#1964a3"]').count(), 2);
});

test('invalid saved data falls back visibly and still allows new requests', async t => {
  const page = await openPage(t);
  for (const saved of ['{', '[{"area":"Karunagappally","streets":[],"purpose":"broken"}]']) {
    await page.evaluate(({ key, saved }) => localStorage.setItem(key, saved), { key: storeKey, saved });
    await page.reload();
    assert.match(await page.locator('#notice').innerText(), /could not be loaded/);
    assert.match(await page.locator('#results').innerText(), /DG-101/);
  }
  await fillRequest(page);
  await submit(page);
  assert.match(await page.locator('#details').innerText(), /DG-103/);
  assert.equal(await page.locator('#notice').isVisible(), false);
});

test('unavailable storage leaves the workflow usable and reports session-only changes', async t => {
  const page = await openPage(t, { init: () => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  } });
  assert.match(await page.locator('#notice').innerText(), /storage is unavailable/);
  await fillRequest(page);
  await submit(page);
  assert.match(await page.locator('#details').innerText(), /DG-103 · Submitted/);
  assert.match(await page.locator('#notice').innerText(), /session only/);
});

test('saved user text is rendered literally and an empty saved collection stays empty', async t => {
  const page = await openPage(t);
  await page.evaluate(key => localStorage.setItem(key, '[]'), storeKey);
  await page.reload();
  assert.doesNotMatch(await page.locator('#results').innerText(), /DG-/);
  const purpose = '<img src=x onerror="window.injected=true">';
  await fillRequest(page, purpose);
  await submit(page);
  await page.reload();
  await page.locator('#results').getByRole('button', { name: /DG-101/ }).click();
  assert.equal(await page.locator('#details h2').innerText(), purpose);
  assert.equal(await page.locator('#details img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
});

test('mobile layout fits the viewport and dialog controls stay reachable', async t => {
  const page = await openPage(t, { viewport: { width: 360, height: 640 } });
  await fillRequest(page, 'x'.repeat(120));
  const dialogBox = await page.locator('#dialog').boundingBox();
  assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 360);
  assert.ok(dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 640);
  await submit(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#search').fill('no such request');
  assert.equal(await page.locator('#results').innerText(), 'No matching streets or requests.');
});

test('the app runs directly from a local file and cancellation restores focus', async t => {
  const page = await openPage(t, { file: true });
  assert.equal(await page.locator('#title').innerText(), 'Karunagappally');
  await page.locator('#new').click();
  assert.equal(await page.getByRole('dialog', { name: 'New dig request' }).count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'new');
});
