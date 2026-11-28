const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../beta-logic.js');
const draft = { area: 'karunagappally', agency: 'Test crew', purpose: 'Test work', latitude: 9.0581791, longitude: 76.5135328, radius: 50, start: '2026-12-01', end: '2026-12-04' };
test('BETA validation rejects unknown coordinates, impossible dates and reversed ranges', () => {
  assert.equal(rules.validation(draft), '');
  for (const patch of [{ latitude: NaN }, { longitude: 181 }, { radius: 0 }, { radius: 10.5 }, { start: '2026-02-30' }, { end: '2026-11-30' }, { agency: ' ' }, { purpose: ' ' }]) assert.notEqual(rules.validation({ ...draft, ...patch }), '');
});
test('BETA spatial and inclusive date overlap excludes rejected and self records but retains approval warnings', () => {
  const rows = [{ ...draft, id: 'BETA-1', start: '2026-12-04', end: '2026-12-08', status: 'Approved' }];
  assert.deepEqual(rules.conflicts(draft, rows), [{ id: 'BETA-1', agency: 'Test crew', distance: 0, start: '2026-12-04', end: '2026-12-04' }]);
  assert.equal(rules.conflicts({ ...draft, id: 'BETA-1' }, rows).length, 0);
  assert.equal(rules.conflicts(draft, [{ ...rows[0], status: 'Rejected' }]).length, 0);
  assert.equal(rules.conflicts({ ...draft, latitude: 8.9 }, rows).length, 0);
  assert.equal(rules.conflicts({ ...draft, end: '2026-12-03' }, rows).length, 0);
  assert.equal(rules.conflicts({ ...draft, end: '2026-11-30' }, rows).length, 0);
});
test('BETA distance uses latitude/longitude and detects intersecting zone radii', () => {
  const nearby = { ...draft, latitude: draft.latitude + .0005, id: 'BETA-2', status: 'Submitted' };
  assert.ok(rules.distance(draft, nearby) > 55 && rules.distance(draft, nearby) < 56);
  assert.equal(rules.conflicts(draft, [nearby]).length, 1);
  assert.equal(rules.conflicts({ ...draft, radius: 10 }, [{ ...nearby, radius: 10 }]).length, 0);
});
