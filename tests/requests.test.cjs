const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({});
for (const file of ['demo.js', 'requests.js']) {
  vm.runInContext(readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}
const { isValidDate, isValidRequest, parseRequests, nextRequestId, conflicts } = context;
const seeds = JSON.parse(vm.runInContext('JSON.stringify(seedRequests)', context));
const first = seeds[0];
const warnings = (start, end = start, records = [], excludedId) =>
  Array.from(conflicts(first.area, first.streets, start, end, records, excludedId));

test('valid saved requests and an intentionally empty collection survive loading', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parseRequests(JSON.stringify(seeds)))), seeds);
  assert.equal(parseRequests('[]').length, 0);
  assert.ok(isValidRequest({ ...first, status: 'Rejected', reason: 'Reschedule the work.' }));
});

for (const [label, patch] of [
  ['missing ID', { id: undefined }],
  ['non-string ID', { id: 103 }],
  ['invalid ID', { id: 'DG-NaN' }],
  ['noncanonical ID', { id: 'DG-0103' }],
  ['unknown area', { area: '__proto__' }],
  ['non-string area', { area: ['Karunagappally'] }],
  ['missing street list', { streets: undefined }],
  ['empty street list', { streets: [] }],
  ['unknown street', { streets: ['Unknown road'] }],
  ['street from another area', { streets: seeds[1].streets }],
  ['duplicate streets', { streets: [...first.streets, ...first.streets] }],
  ['empty purpose', { purpose: '  ' }],
  ['overlong purpose', { purpose: 'x'.repeat(121) }],
  ['missing start', { start: undefined }],
  ['impossible date', { start: '2026-02-30' }],
  ['reversed dates', { start: '2026-12-09' }],
  ['unknown status', { status: 'Pending' }],
  ['invalid reason', { reason: {} }],
  ['rejection without a reason', { status: 'Rejected' }],
  ['blank rejection reason', { status: 'Rejected', reason: '  ' }]
]) {
  test('saved data rejects ' + label, () => {
    assert.throws(() => parseRequests(JSON.stringify([{ ...first, ...patch }])));
  });
}

test('corrupt JSON, invalid containers, null entries, and duplicate IDs are rejected', () => {
  for (const serialized of ['{', 'null', '{}', '[null]', JSON.stringify([first, first])]) {
    assert.throws(() => parseRequests(serialized));
  }
});

test('date validation handles leap years and canonical calendar dates', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) assert.ok(isValidDate(date), date);
  for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-1', '0000-01-01', '10000-01-01', '', null]) {
    assert.equal(isValidDate(date), false, String(date));
  }
});

test('IDs advance across both areas and retain precision for large imported IDs', () => {
  assert.equal(nextRequestId([]), 'DG-101');
  assert.equal(nextRequestId(seeds), 'DG-103');
  assert.equal(nextRequestId([{ ...first, id: 'DG-9007199254740992' }]), 'DG-9007199254740993');
});

test('resurfacing includes day zero and day 89, excludes day 90 and earlier dates', () => {
  assert.equal(warnings('2026-11-11').length, 0);
  assert.match(warnings('2026-11-12')[0], /resurfaced/);
  assert.match(warnings('2027-02-09')[0], /resurfaced/);
  assert.equal(warnings('2027-02-10').length, 0);
});

test('overlap includes either shared boundary and contained date ranges', () => {
  for (const [start, end] of [['2026-11-30', '2026-12-01'], ['2026-12-08', '2026-12-09'], ['2026-12-02', '2026-12-03'], ['2026-11-30', '2026-12-09']]) {
    assert.ok(warnings(start, end, seeds).some(message => message.startsWith('DG-101 overlaps')));
  }
  for (const date of ['2026-11-30', '2026-12-09']) {
    assert.ok(!warnings(date, date, seeds).some(message => message.includes('overlaps')));
  }
});

test('conflicts exclude rejected requests, other areas, other streets, and the request being reviewed', () => {
  const unrelated = [
    { ...first, status: 'Rejected', reason: 'Cancelled' },
    { ...first, area: 'Kollam' },
    { ...first, streets: ['Reedbank Lane'] }
  ];
  assert.ok(!warnings(first.start, first.end, unrelated).some(message => message.includes('overlaps')));
  const reviewed = warnings(first.start, first.end, seeds, first.id);
  assert.equal(reviewed.length, 1);
  assert.match(reviewed[0], /resurfaced/);
  assert.ok(warnings(first.start, first.end, [{ ...first, status: 'Approved' }]).some(message => message.includes('overlaps')));
});

test('empty, invalid, and reversed dates do not produce misleading warnings', () => {
  for (const [start, end] of [['', ''], ['2026-02-30', '2026-03-01'], ['2026-12-08', '2026-12-01']]) {
    assert.deepEqual(warnings(start, end, seeds), []);
  }
});
