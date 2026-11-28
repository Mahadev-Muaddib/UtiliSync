const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../data.js');
const source = require('../project_data.json');
const fresh = () => structuredClone(source);
const root = 'http://localhost:4173/';
function memory(initial) {
  const map = new Map(Object.entries(initial)); let writes = 0;
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { writes++; map.set(key, value); }, map, get writes() { return writes; } };
}
test('reconciles source counts and both municipality totals without duplicating IDs', () => {
  const d = api.validate(fresh());
  assert.equal(d.records.length, 619); assert.equal(d.byId.size, 619);
  assert.deepEqual([d.maintenance_incidents.length, d.water_projects.length, d.official_work_observations.length, d.coordination_dependencies.length], [599, 5, 15, 8]);
  assert.equal(d.records.filter(r => r.collection === 'maintenance_incidents' && r.municipality === 'karunagappally').length, 353);
  assert.equal(d.records.filter(r => r.collection === 'maintenance_incidents' && r.municipality === 'kollam').length, 246);
  assert.equal(d.records.filter(r => r.coordinates).length, 595);
});
test('preserves Manoothara evidence, cancellation, unknown dates and source flags', () => {
  const d = api.validate(fresh()); const incident = d.byId.get('kwa-1572397');
  assert.equal(incident.title, 'Manoothara junction'); assert.equal(incident.raw.verified_excavation_start, null);
  assert.equal(incident.raw.verified_restoration_date, null); assert.deepEqual(incident.coordinates, [76.5135328, 9.0581791]);
  assert.equal(d.byId.get('KL-KOLLAM-6545').status, 'cancelled_by_government_order');
  assert.equal(d.byId.get('KL-KOLLAM-6545').date, '2025-11-10');
  assert.equal(d.byId.get('PASK-KLMAMRUT2022313852').raw.actual_completion_date_verified, null);
  assert.deepEqual(incident.raw, source.maintenance_incidents.find(r => r.record_id === incident.id));
});
test('rejects duplicate IDs, malformed arrays, coordinates and unresolved links', () => {
  for (const mutate of [d => d.maintenance_incidents.push(d.maintenance_incidents[0]), d => d.water_projects = null, d => d.maintenance_incidents[0].latitude = 200, d => d.coordination_dependencies[0].prerequisite_record_id = 'missing', d => d.featured_cases[0].source_record_id = 'missing', d => d.layers[0].path = '../outside.geojson']) {
    const d = fresh(); mutate(d); assert.throws(() => api.validate(d));
  }
});
test('accepts a genuinely empty snapshot', () => {
  const d = fresh(); for (const [key, value] of Object.entries(d)) if (Array.isArray(value)) d[key] = [];
  assert.equal(api.validate(d).records.length, 0);
});
test('loader resolves root JSON and reports missing and invalid sources', async () => {
  await api.load(root, async url => { assert.equal(url.href, root + 'project_data.json'); return { ok: true, json: async () => fresh() }; });
  await assert.rejects(api.load(root, async () => ({ ok: false, status: 404 })), /unavailable/);
  await assert.rejects(api.load(root, async () => ({ ok: true, json: async () => { throw Error(); } })), /not valid JSON/);
  await assert.rejects(api.load(root, async () => { throw Error(); }), /npm start/);
});
test('missing optional layers remain unavailable without removing JSON coordinates', async () => {
  const d = api.validate(fresh()); const layers = await api.loadLayers(d, root, async () => ({ ok: false, status: 404 }));
  assert.equal(layers.length, 7); assert.ok(layers.every(l => !l.available)); assert.equal(d.records.filter(r => r.coordinates).length, 595);
});
test('point layers join incident_no in longitude/latitude order, not feature order', async () => {
  const d = api.validate(fresh()); d.layers = d.layers.filter(l => l.kind === 'source_maintenance_closure_points');
  const result = await api.loadLayers(d, root, async url => {
    assert.equal(url.href, root + 'data/kwa/maintenance_points.geojson');
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { incident_no: '1572397' }, geometry: { type: 'Point', coordinates: [76.51, 9.05] } },
      { type: 'Feature', properties: { incident_no: 'unrelated' }, geometry: { type: 'Point', coordinates: [77, 10] } }
    ] }) };
  });
  assert.equal(result[0].available, true); assert.deepEqual(d.byId.get('kwa-1572397').coordinates, [76.51, 9.05]);
  assert.equal(d.byId.get('kwa-1572397').raw.longitude, 76.5135328);
});
test('migration is idempotent, removes seed IDs and preserves user rows and unrelated settings', () => {
  const user = { id: 'DG-103', purpose: 'User work', streets: ['Market Road'], agency: 'Water Board (demo)' };
  const storage = memory({ 'utilisync.requests.v1': JSON.stringify([{ id: 'DG-101' }, { id: 'DG-102' }, user]), 'setting': 'keep' });
  assert.deepEqual(api.migrateRequests(storage).records, [user]); assert.equal(storage.writes, 1);
  assert.deepEqual(api.migrateRequests(storage).records, [user]); assert.equal(storage.writes, 1); assert.equal(storage.map.get('setting'), 'keep');
});
test('invalid and unavailable storage never loads samples or destroys the original value', () => {
  const storage = memory({ 'utilisync.requests.v1': 'broken' });
  assert.match(api.migrateRequests(storage).notice, /preserved/); assert.equal(storage.map.get('utilisync.requests.v1'), 'broken'); assert.equal(storage.writes, 0);
  const blocked = { getItem: () => '[{"id":"DG-101"},{"id":"DG-103"}]', setItem: () => { throw Error(); } };
  assert.deepEqual(api.migrateRequests(blocked).records, [{ id: 'DG-103' }]); assert.match(api.migrateRequests(blocked).notice, /could not save/);
});
test('activity buckets reconcile complaint and closure months independently', () => {
  const d = api.validate(fresh()); const rows = d.records.filter(r => r.collection === 'maintenance_incidents'); const months = api.monthly(d, rows);
  assert.equal(months[0].key, '2025-12'); assert.equal(months[11].key, '2026-11');
  for (const m of months) {
    assert.equal(m.complaints, source.maintenance_incidents.filter(r => r.complaint_date_raw?.startsWith(m.key)).length);
    assert.equal(m.closures, source.maintenance_incidents.filter(r => r.closed_date_raw?.startsWith(m.key)).length);
  }
});
