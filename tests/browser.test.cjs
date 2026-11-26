const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
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
  const context = await browser.newContext({ viewport: viewport || { width: 1440, height: 1000 } });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'No browser runtime errors'); });
  await page.goto(file ? pathToFileURL(path.join(root, 'index.html')).href : baseUrl);
  await page.locator('#map g').first().waitFor();
  return page;
}
const registryRow = (page, name) => page.locator('#results button').filter({ hasText: name });
const mapRoad = (page, name) => page.locator('#map').getByRole('button', { name, exact: true });
async function fillRequest(page, purpose = 'Repair water connection', start = '2026-12-01', end = '2026-12-04', opener = '#new') {
  await page.locator(opener).click();
  await page.locator('[name=agency]').selectOption('Coastal Telecom (demo)');
  await page.locator('[name=purpose]').fill(purpose);
  await page.locator('[name=start]').fill(start);
  await page.locator('[name=end]').fill(end);
}
async function submit(page) {
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  // Native dialog close events run on the next animation frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function viewRequest(page, id) {
  await page.locator('#details').getByRole('button', { name: 'View ' + id, exact: true }).click();
}

test('acceptance: inspect overlapping work, retain the draft, submit, approve and synchronize every surface', async t => {
  const page = await openPage(t);
  await page.locator('#search').fill('Market');
  await registryRow(page, 'Market Road').click();
  await page.locator('#layers').getByLabel('Gas', { exact: true }).uncheck();
  const history = await page.locator('.history').innerText();
  assert.match(await page.locator('#details').innerText(), /Water Board \(demo\)/);
  assert.match(history, /Last resurfaced on 12 Nov 2026/);
  assert.equal(await page.locator('.line-record').count(), 3);
  assert.equal(await page.locator('.line-heading').filter({ hasText: 'Telecom' }).count(), 2);
  await fillRequest(page, 'New telecom connection', '2026-12-01', '2026-12-04', '#street-new');
  assert.deepEqual(await page.locator('#choices input:checked').evaluateAll(nodes => nodes.map(node => node.value)), ['Market Road']);
  const warnings = await page.locator('#warnings').innerText();
  assert.match(warnings, /Market Road was resurfaced on 2026-11-12/);
  assert.match(warnings, /DG-101 overlaps this work: Water Board \(demo\) on Market Road, 2026-12-01 to 2026-12-04/);
  const draft = await page.locator('#form').evaluate(form => [...new FormData(form)]);
  await page.locator('#warnings').getByRole('button', { name: 'Inspect DG-101' }).click();
  assert.match(await page.locator('#review-content').innerText(), /Replace water valve/);
  assert.match(await page.locator('#review-content').innerText(), /Water Board \(demo\)/);
  await page.getByRole('button', { name: 'Return to draft' }).click();
  assert.deepEqual(await page.locator('#form').evaluate(form => [...new FormData(form)]), draft);
  await submit(page);
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), false);
  assert.equal(await page.locator('#search').inputValue(), 'Market');
  assert.equal(await page.locator('#layers').getByLabel('Gas', { exact: true }).isChecked(), false);
  assert.equal(await mapRoad(page, 'Market Road').getAttribute('aria-pressed'), 'true');
  assert.match(await registryRow(page, 'Market Road').innerText(), /Conflict flagged[\s\S]*2 pending/);
  assert.equal(await mapRoad(page, 'Market Road').getAttribute('data-status'), 'Conflict flagged');
  assert.match(await page.locator('#details').innerText(), /DG-103 · Submitted/);
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
  await page.locator('#role').selectOption('Coordinator');
  await viewRequest(page, 'DG-103');
  assert.match(await page.locator('#review-content .warnings').innerText(), /DG-101 overlaps/);
  assert.doesNotMatch(await page.locator('#review-content .warnings').innerText(), /DG-103 overlaps/);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  assert.match(await page.locator('#review-content').innerText(), /DG-103 · Approved/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'review-content');
  await page.getByRole('button', { name: 'Return to street' }).click();
  assert.match(await registryRow(page, 'Market Road').innerText(), /1 pending · 1 approved/);
  assert.match(await page.locator('.planned .section-intro').innerText(), /1 pending · 1 approved/);
  assert.equal(await page.locator('.history').innerText(), history, 'Approval does not create completed history');
  assert.match(await page.locator('#map-selected').innerText(), /Market Road · Conflict flagged/);
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/desktop.png'), fullPage: true });
  await page.reload();
  await page.locator('#search').fill('dg-103');
  await registryRow(page, 'Market Road').click();
  assert.match(await page.locator('#details').innerText(), /DG-103 · Approved/);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storeKey);
  assert.equal(saved.find(request => request.id === 'DG-103').agency, 'Coastal Telecom (demo)');
  await page.locator('#area').selectOption('Kollam');
  assert.match(await page.locator('#details').innerText(), /DG-102/);
  assert.doesNotMatch(await page.locator('#details').innerText(), /DG-103/);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();
  await page.locator('#area').selectOption('Karunagappally');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, storeKey), 2);
  assert.doesNotMatch(await page.locator('#details').innerText(), /DG-103/);
});

test('submitting refreshes constraints and validates agency, dates, purpose and streets', async t => {
  const page = await openPage(t);
  await fillRequest(page, '   ');
  await page.locator('[name=agency]').selectOption('');
  await submit(page);
  assert.match(await page.locator('[name=agency]').evaluate(input => input.validationMessage), /agency/);
  await page.locator('[name=agency]').selectOption('Water Board (demo)');
  await submit(page);
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), true);
  assert.match(await page.locator('[name=purpose]').evaluate(input => input.validationMessage), /purpose/);
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
  await page.locator('#choices input').nth(1).check();
  await submit(page);
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), false);
  assert.match(await page.locator('#details').innerText(), /Replace a valve/);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).at(-1).streets, storeKey), ['Market Road', 'Edakulangara']);
});

test('rejection requires a reason, persists it and clears linked overlap flags', async t => {
  const page = await openPage(t);
  await fillRequest(page);
  await submit(page);
  await page.locator('#role').selectOption('Coordinator');
  await viewRequest(page, 'DG-103');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.match(await page.locator('#review-content').innerText(), /Submitted/);
  page.once('dialog', async dialog => { page.once('dialog', alert => alert.accept()); await dialog.accept('  '); });
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.match(await page.locator('#review-content').innerText(), /Submitted/);
  page.once('dialog', dialog => dialog.accept('  Combine with planned repairs.  '));
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.match(await page.locator('#review-content').innerText(), /Rejection reason: Combine with planned repairs\./);
  assert.equal(await page.locator('#review-content .warnings').count(), 0);
  await page.getByRole('button', { name: 'Return to street' }).click();
  assert.match(await registryRow(page, 'Market Road').innerText(), /1 pending request/);
  assert.doesNotMatch(await registryRow(page, 'Market Road').innerText(), /Conflict/);
  assert.equal(await mapRoad(page, 'Market Road').getAttribute('data-status'), '1 pending request');
  await page.reload();
  await viewRequest(page, 'DG-103');
  assert.match(await page.locator('#review-content').innerText(), /Rejected/);
  assert.match(await page.locator('#review-content').innerText(), /Combine with planned repairs\./);
});

test('keyboard selection links registry and map without changing search, area or layers', async t => {
  const page = await openPage(t);
  const road = mapRoad(page, 'Edakulangara');
  await road.focus(); await page.keyboard.press('Enter');
  assert.equal(await road.evaluate(node => document.activeElement === node), true);
  assert.equal(await road.getAttribute('aria-pressed'), 'true');
  assert.equal(await registryRow(page, 'Edakulangara').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#street-title').innerText(), 'Edakulangara');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Lalaji Junction');
  await page.keyboard.press('Space');
  assert.equal(await mapRoad(page, 'Lalaji Junction').getAttribute('aria-pressed'), 'true');
  await page.locator('#search').fill('Market');
  const row = registryRow(page, 'Market Road');
  await row.focus(); await page.keyboard.press('Enter');
  assert.equal(await row.evaluate(node => document.activeElement === node), true);
  assert.equal(await mapRoad(page, 'Market Road').getAttribute('aria-pressed'), 'true');
  for (const [label, key] of [['Water', 'water'], ['Telecom', 'fibre'], ['Sewer', 'sewer'], ['Gas', 'gas']]) {
    const layer = page.locator('#layers').getByLabel(label, { exact: true });
    const count = await page.locator('#map .utility-' + key).count();
    assert.ok(count > 0);
    await layer.uncheck();
    assert.equal(await page.locator('#map .utility-' + key).count(), 0);
    await layer.check();
    assert.equal(await page.locator('#map .utility-' + key).count(), count);
  }
  await mapRoad(page, 'Lalaji Junction').click();
  assert.equal(await page.locator('#search').inputValue(), 'Market');
  assert.equal(await page.locator('#street-title').innerText(), 'Lalaji Junction');
  assert.equal(await page.locator('#area').inputValue(), 'Karunagappally');
  assert.equal(await page.locator('#map .selected-casing').count(), 1);
});

test('invalid saved data falls back visibly and still allows new requests', async t => {
  const page = await openPage(t);
  for (const saved of ['{', '[{"area":"Karunagappally","streets":[],"purpose":"broken"}]']) {
    await page.evaluate(({ key, saved }) => localStorage.setItem(key, saved), { key: storeKey, saved });
    await page.reload();
    assert.match(await page.locator('#notice').innerText(), /could not be loaded/);
    assert.match(await page.locator('#details').innerText(), /DG-101/);
  }
  await fillRequest(page); await submit(page);
  assert.match(await page.locator('#details').innerText(), /DG-103/);
  assert.equal(await page.locator('#notice').isVisible(), false);
});

test('unavailable storage leaves the workflow usable and reports session-only changes', async t => {
  const page = await openPage(t, { init: () => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  } });
  assert.match(await page.locator('#notice').innerText(), /storage is unavailable/);
  await fillRequest(page); await submit(page);
  assert.match(await page.locator('#details').innerText(), /DG-103 · Submitted/);
  assert.match(await page.locator('#notice').innerText(), /session only/);
});

test('saved user text is rendered literally and an empty saved collection stays empty', async t => {
  const page = await openPage(t);
  await page.evaluate(key => localStorage.setItem(key, '[]'), storeKey); await page.reload();
  assert.doesNotMatch(await page.locator('#details').innerText(), /DG-/);
  const purpose = '<img src=x onerror="window.injected=true">';
  await fillRequest(page, purpose); await submit(page); await page.reload();
  await viewRequest(page, 'DG-101');
  assert.equal(await page.locator('#review-title').innerText(), purpose);
  assert.equal(await page.locator('#details img, #review-content img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
});

test('legacy requests without agency stay readable in records and overlap warnings', async t => {
  const page = await openPage(t);
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify([{ id: 'DG-101', area: 'Karunagappally', streets: ['Market Road'],
      purpose: 'Legacy valve repair', start: '2026-12-01', end: '2026-12-08', status: 'Submitted' }]));
  }, storeKey);
  await page.reload();
  assert.match(await page.locator('.planned').innerText(), /Agency unrecorded/);
  assert.equal(await page.locator('#notice').isVisible(), false);
  await fillRequest(page);
  assert.match(await page.locator('#warnings').innerText(), /DG-101 overlaps this work: Agency unrecorded/);
  await page.locator('#warnings button').click();
  assert.match(await page.locator('#review-content').innerText(), /Agency unrecorded/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dialog').evaluate(dialog => dialog.open), true);
  assert.equal(await page.locator('[name=purpose]').inputValue(), 'Repair water connection');
});

test('Kollam on a narrow screen uses a dismissible sheet and restores registry and map focus', async t => {
  const page = await openPage(t, { viewport: { width: 390, height: 844 } });
  await page.locator('#area').selectOption('Kollam');
  await page.locator('#layers').getByLabel('Power', { exact: true }).uncheck();
  await page.locator('#search').fill('Thevalli');
  const row = registryRow(page, 'Thevalli');
  await row.click();
  assert.equal(await page.locator('#street-sheet').evaluate(sheet => sheet.open), true);
  assert.equal(await page.locator('#street-title').innerText(), 'Thevalli');
  assert.equal(await mapRoad(page, 'Thevalli').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#details').innerText(), /Sewer[\s\S]*Sewage Department/);
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/mobile-sheet.png') });
  await page.getByRole('button', { name: 'Close record' }).click();
  assert.equal(await row.evaluate(node => document.activeElement === node), true);
  const road = mapRoad(page, 'Ashraamam');
  await road.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#street-title').innerText(), 'Ashraamam');
  await page.keyboard.press('Escape');
  assert.equal(await road.evaluate(node => document.activeElement === node), true);
  assert.equal(await page.locator('#search').inputValue(), 'Thevalli');
  assert.equal(await page.locator('#layers').getByLabel('Power', { exact: true }).isChecked(), false);
  await row.click();
  await fillRequest(page, 'x'.repeat(120), '2026-12-01', '2026-12-04', '#street-new');
  const box = await page.locator('#dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
  assert.deepEqual(await page.locator('#choices input:checked').evaluateAll(nodes => nodes.map(node => node.value)), ['Thevalli']);
  await submit(page);
  assert.equal(await page.locator('#street-sheet').evaluate(sheet => sheet.open), true);
  assert.match(await page.locator('.planned').innerText(), /DG-103 · Submitted/);
  await page.getByRole('button', { name: 'Close record' }).click();
  assert.equal(await row.evaluate(node => document.activeElement === node), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#search').fill('no such request');
  assert.equal(await page.locator('#results').innerText(), 'No matching streets or requests.');
});

test('360px layout and nested conflict inspection remain usable', async t => {
  const page = await openPage(t, { viewport: { width: 360, height: 640 } });
  await registryRow(page, 'Market Road').click();
  await fillRequest(page, 'Short repair', '2026-12-01', '2026-12-04', '#street-new');
  await page.locator('#warnings button').click();
  await page.getByRole('button', { name: 'Return to draft' }).click();
  assert.equal(await page.locator('[name=purpose]').inputValue(), 'Short repair');
  await submit(page);
  assert.match(await page.locator('.planned').innerText(), /DG-103/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Close record' }).click();
  await page.screenshot({ path: path.join(root, 'test-results/mobile-map.png'), fullPage: true });
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
