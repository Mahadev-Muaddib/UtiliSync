const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');
const { mkdir, mkdtemp, copyFile, writeFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('../server.cjs');
const source = require('../project_data.json');
let browser, server, url;
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); url = 'http://127.0.0.1:' + server.address().port;
  await mkdir('test-results', { recursive: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function pageFor(t, options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  if (options.init) await context.addInitScript(options.init);
  if (options.route) await options.route(page);
  await page.goto(url); await page.locator(options.error ? '#error' : '#content').waitFor({ state: 'visible' }); return page;
}
const counts = page => page.locator('#stats .stat strong').allTextContents();
test('fresh launch reconciles all source counts and map points, with no runtime mock assets', async t => {
  const page = await pageFor(t); assert.deepEqual(await counts(page), ['599', '5', '15', '8']);
  assert.equal(await page.locator('#results button').count(), 619); assert.equal(await page.locator('.incident-point').count(), 595);
  assert.equal(await page.locator('.boundary-exception').count(), 42); assert.equal(await page.locator('#layers .layer-item').count(), 7);
  assert.doesNotMatch(await page.locator('#content').innerText(), /Water Board \(demo\)|DG-101|DG-102/);
  assert.deepEqual(await page.locator('#results button').evaluateAll(nodes => nodes.map(n => n.dataset.recordId)), [...source.maintenance_incidents, ...source.water_projects, ...source.official_work_observations].map(r => r.record_id));
  assert.deepEqual(await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.getAttribute('src'))), ['data.js', 'map.js', 'beta-logic.js', 'beta.js', 'app.js']);
  await page.screenshot({ path: 'test-results/real-data-desktop.png' });
});
test('both municipalities, type, text and status filters stay linked to map and registry', async t => {
  const page = await pageFor(t);
  await page.locator('#area').selectOption('karunagappally'); assert.deepEqual((await counts(page)).slice(0, 3), ['353', '1', '3']);
  await page.locator('#kind').selectOption('maintenance_incidents'); assert.equal(await page.locator('#results button').count(), 353);
  await page.locator('#search').fill('kwa-1572397'); assert.equal(await page.locator('#results button').count(), 1); assert.equal(await page.locator('.incident-point').count(), 1);
  await page.locator('#results button').click(); assert.match(await page.locator('#details').innerText(), /Manoothara junction/); assert.match(await page.locator('#details').innerText(), /Pipe broken during PWD drainage work/);
  assert.match(await page.locator('#details').innerText(), /Verified excavation start\s+Unknown/);
  await page.locator('#clear').click(); await page.locator('#area').selectOption('kollam'); assert.deepEqual((await counts(page)).slice(0, 3), ['246', '4', '12']);
  await page.locator('#kind').selectOption('maintenance_incidents'); assert.equal(await page.locator('#results button').count(), 246);
  await page.locator('#kind').selectOption('official_work_observations'); await page.locator('#record-status').selectOption('cancelled_by_government_order');
  assert.ok(await page.locator('#results button').count() > 0); assert.equal(await page.locator('.incident-point').count(), 0);
});
test('cancellation, dated amounts, dependency endpoints and crosswalk confidence remain visible', async t => {
  const page = await pageFor(t); await page.locator('#search').fill('KL-KOLLAM-6545');
  await page.locator('#results [data-record-id="KL-KOLLAM-6545"]').click(); const text = await page.locator('#details').innerText();
  assert.match(text, /cancelled by government order/); assert.match(text, /2025-11-10/); assert.match(text, /administrative_sanction/);
  await page.locator('#details .dependency-node').filter({ hasText: 'KL-KOLLAM-6403' }).first().click(); assert.match(await page.locator('#details').innerText(), /Anchalumoodu 15 lakh/);
  await page.locator('#search').fill('PASK-KLMAMRUT2022313852'); await page.locator('#results button').click();
  assert.match(await page.locator('#details').innerText(), /72%/); assert.match(await page.locator('#details').innerText(), /inferred_cross_source_link/); assert.match(await page.locator('#details').innerText(), /Verified completion date\s+Unknown/);
});
test('old demo state is migrated twice while user data and settings survive', async t => {
  const page = await pageFor(t, { init: () => {
    if (!localStorage.getItem('installed')) { localStorage.setItem('utilisync.requests.v1', JSON.stringify([{ id: 'DG-101' }, { id: 'DG-102' }, { id: 'DG-103', purpose: 'User-created work', streets: ['Custom street'] }])); localStorage.setItem('installed', 'yes'); localStorage.setItem('preference', 'keep'); }
  } });
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await counts(page), ['599', '5', '15', '8']); assert.match(await page.locator('#local-requests').innerText(), /DG-103/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('utilisync.requests.v1')).map(r => r.id)), ['DG-103']); assert.equal(await page.evaluate(() => localStorage.getItem('preference')), 'keep');
    await page.reload(); await page.locator('#content').waitFor();
  }
});
for (const failure of ['missing', 'invalid', 'schema']) test(failure + ' root JSON shows a clear error without fallback rows', async t => {
  const page = await pageFor(t, { error: true, route: page => page.route('**/project_data.json', route => route.fulfill({ status: failure === 'missing' ? 404 : 200, contentType: 'application/json', body: failure === 'invalid' ? '{bad' : '{}' })) });
  assert.match(await page.locator('#error').innerText(), /Unable to load project data/); assert.equal(await page.locator('#results button').count(), 0);
});
test('valid empty arrays show empty states', async t => {
  const empty = structuredClone(source); for (const key of Object.keys(empty)) if (Array.isArray(empty[key])) empty[key] = [];
  const page = await pageFor(t, { route: page => page.route('**/project_data.json', route => route.fulfill({ json: empty })) });
  assert.deepEqual(await counts(page), ['0', '0', '0', '0']); assert.match(await page.locator('#results').innerText(), /No source records/); assert.match(await page.locator('#map').textContent(), /No source maintenance coordinates/);
});
test('optional geometry displays when supplied and missing layers explain their state', async t => {
  const page = await pageFor(t, { route: page => page.route('**/data/geography/karunagappally_boundary.geojson', route => route.fulfill({ json: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[76.50, 9.03], [76.54, 9.03], [76.54, 9.10], [76.50, 9.03]]] } }] } })) });
  assert.equal(await page.locator('.geo-boundary').count(), 1); await page.locator('.layer-panel summary').click();
  assert.match(await page.locator('#layers').innerText(), /Unavailable \(HTTP 404\)/); assert.match(await page.locator('#layers').innerText(), /OpenStreetMap contributors/);
  await page.locator('#layers input').uncheck(); assert.equal(await page.locator('.geo-boundary').count(), 0);
});
test('phone layout fits the viewport and keyboard point selection opens source details', async t => {
  const page = await pageFor(t, { mobile: true }); await page.locator('#area').selectOption('karunagappally'); await page.locator('#search').fill('kwa-1572397');
  await page.locator('.incident-point').focus(); await page.keyboard.press('Enter'); assert.match(await page.locator('#details').innerText(), /Manoothara junction/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: 'test-results/real-data-mobile.png', fullPage: true });
});
test('unavailable browser storage does not block actual source data', async t => {
  const page = await pageFor(t, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw Error('blocked'); } }); } });
  assert.deepEqual(await counts(page), ['599', '5', '15', '8']); assert.match(await page.locator('#notice').innerText(), /storage is unavailable/);
});
test('disposable app copy handles missing and invalid files then recovers with the real snapshot', async t => {
  const root = path.resolve(__dirname, '..');
  const copy = await mkdtemp(path.join(root, 'test-results', 'source-failure-'));
  for (const file of ['index.html', 'theme.css', 'data.js', 'map.js', 'beta-logic.js', 'beta.js', 'app.js', 'server.cjs', 'project_data.json']) await copyFile(path.join(root, file), path.join(copy, file));
  const isolated = require(path.join(copy, 'server.cjs')).createServer();
  await new Promise(resolve => isolated.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage();
  t.after(async () => { await page.close(); await new Promise(resolve => isolated.close(resolve)); });
  const address = 'http://127.0.0.1:' + isolated.address().port;
  await page.goto(address); await page.locator('#content').waitFor();
  assert.deepEqual(await counts(page), ['599', '5', '15', '8']);
  assert.equal(await page.locator('#layers .layer-item').count(), 7);
  await unlink(path.join(copy, 'project_data.json'));
  await page.reload(); await page.locator('#error').waitFor(); assert.match(await page.locator('#error').innerText(), /HTTP 404/);
  await writeFile(path.join(copy, 'project_data.json'), '{broken JSON');
  await page.reload(); await page.locator('#error').waitFor(); assert.match(await page.locator('#error').innerText(), /not valid JSON/);
  assert.equal(await page.locator('#results button').count(), 0);
  await copyFile(path.join(root, 'project_data.json'), path.join(copy, 'project_data.json'));
  await page.reload(); await page.locator('#content').waitFor(); assert.deepEqual(await counts(page), ['599', '5', '15', '8']);
});

async function openBeta(page) {
  // Isolate the external tile service; Leaflet and all interactions are real local assets.
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.locator('#beta-playground > summary').click();
  await page.locator('#beta-map.leaflet-container').waitFor();
  await page.locator('#beta-load-status').filter({ hasText: 'BETA ready' }).waitFor();
}
test('BETA is optional and lazy; source marker selection preserves coordinates and opens original details', async t => {
  const page = await pageFor(t); assert.equal(await page.locator('#beta-playground').getAttribute('open'), null);
  assert.equal(await page.locator('script[src="vendor/leaflet.js"]').count(), 0);
  await openBeta(page); assert.equal(await page.locator('#beta-map [data-source-id]').count(), source.maintenance_incidents.filter(r => r.municipality_key === 'karunagappally' && r.latitude != null && r.longitude != null).length);
  const marker = page.locator('#beta-map [data-source-id="kwa-1572397"]'); await marker.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#beta-form [name=latitude]').inputValue(), '9.0581791');
  assert.equal(await page.locator('#beta-form [name=longitude]').inputValue(), '76.5135328');
  assert.match(await page.locator('.leaflet-popup').innerText(), /Manoothara junction/);
  assert.match(await page.locator('.leaflet-popup').innerText(), /SOURCE RECORD/);
  await page.getByRole('button', { name: 'Open full source details' }).click(); assert.match(await page.locator('#details').innerText(), /Manoothara junction/);
  assert.deepEqual(await counts(page), ['599', '5', '15', '8']);
  await page.locator('#beta-area').selectOption('kollam'); assert.equal(await page.locator('#beta-map [data-source-id]').count(), source.maintenance_incidents.filter(r => r.municipality_key === 'kollam' && r.latitude != null && r.longitude != null).length);
});
test('BETA map click sets coordinates; mock submission, overlap review and clear never change source data', async t => {
  const page = await pageFor(t); await openBeta(page);
  await page.locator('#beta-map').click({ position: { x: 100, y: 100 } });
  assert.ok(Number(await page.locator('#beta-form [name=latitude]').inputValue()) > 9);
  assert.ok(Number(await page.locator('#beta-form [name=longitude]').inputValue()) > 76);
  await page.locator('#beta-landmark').selectOption('kwa-1572397');
  await page.locator('#beta-form [name=agency]').fill('Test water crew'); await page.locator('#beta-form [name=purpose]').fill('<b>Test only</b>');
  await page.locator('#beta-form [name=start]').fill('2026-12-04'); await page.locator('#beta-form [name=end]').fill('2026-12-01');
  await page.getByRole('button', { name: 'Submit mock request', exact: true }).click(); assert.match(await page.locator('#beta-warnings').innerText(), /End date/);
  assert.equal(await page.locator('.beta-request').count(), 0);
  await page.locator('#beta-form [name=end]').fill('2026-12-08'); await page.getByRole('button', { name: 'Submit mock request', exact: true }).click();
  assert.equal(await page.locator('.beta-request').count(), 1); assert.equal(await page.locator('.beta-request h3 b').count(), 0);
  await page.getByRole('button', { name: 'Submit mock request', exact: true }).click(); assert.match(await page.locator('#beta-warnings').innerText(), /Simulated overlap/);
  await page.locator('[data-mock-id="BETA-1"]').getByRole('button', { name: 'Simulate approval' }).click();
  assert.match(await page.locator('[data-mock-id="BETA-1"]').innerText(), /Approved[\s\S]*Simulated overlaps/);
  await page.locator('[data-mock-id="BETA-2"]').getByRole('button', { name: 'Simulate rejection' }).click();
  assert.doesNotMatch(await page.locator('[data-mock-id="BETA-1"]').innerText(), /Simulated overlaps/);
  assert.deepEqual(await counts(page), ['599', '5', '15', '8']); assert.equal(await page.evaluate(() => localStorage.getItem('utilisync.requests.v1')), null);
  await page.getByRole('button', { name: 'Clear all test requests' }).click(); assert.equal(await page.locator('.beta-request').count(), 0);
  await page.locator('#beta-sample').click(); assert.equal(await page.locator('.beta-request').count(), 2);
  await page.locator('#beta-playground').screenshot({ path: 'test-results/beta-desktop.png' });
  await page.reload(); await page.locator('#content').waitFor(); await openBeta(page); assert.equal(await page.locator('.beta-request').count(), 0);
});
test('BETA handles unavailable Leaflet assets and retry without affecting real records', async t => {
  const page = await pageFor(t); await page.route('**/vendor/leaflet.js', route => route.fulfill({ status: 404, body: '' }));
  await page.locator('#beta-playground > summary').click(); await page.locator('#beta-retry').waitFor();
  assert.match(await page.locator('#beta-load-status').innerText(), /Leaflet assets unavailable/); assert.deepEqual(await counts(page), ['599', '5', '15', '8']);
  await page.unroute('**/vendor/leaflet.js'); await page.route('https://tile.openstreetmap.org/**', route => route.abort()); await page.locator('#beta-retry').click();
  await page.locator('#beta-map.leaflet-container').waitFor(); assert.match(await page.locator('#beta-tile-status').innerText(), /map tiles|Map background/);
});
test('BETA fits phone layout and keeps session requests when collapsed and reopened', async t => {
  const page = await pageFor(t, { mobile: true }); await openBeta(page); await page.locator('#beta-sample').click();
  await page.locator('#beta-playground > summary').click(); await page.locator('#beta-playground > summary').click();
  assert.equal(await page.locator('.beta-request').count(), 2); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#beta-playground').screenshot({ path: 'test-results/beta-mobile.png' });
});
