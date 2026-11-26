function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidRequest(request) {
  if (!request || typeof request !== 'object' || typeof request.area !== 'string' || !Object.hasOwn(areas, request.area)) return false;
  const streets = areas[request.area].map(street => street.name);
  return typeof request.id === 'string' && /^DG-[1-9]\d*$/.test(request.id)
    && Array.isArray(request.streets) && request.streets.length > 0
    && new Set(request.streets).size === request.streets.length
    && request.streets.every(name => streets.includes(name))
    && typeof request.purpose === 'string' && request.purpose.trim().length > 0 && request.purpose.length <= 120
    && (request.agency === undefined || (typeof request.agency === 'string' && request.agency.trim().length > 0 && request.agency.length <= 100))
    && isValidDate(request.start) && isValidDate(request.end) && request.start <= request.end
    && ['Submitted', 'Approved', 'Rejected'].includes(request.status)
    && (request.reason === undefined || typeof request.reason === 'string')
    && (request.status !== 'Rejected' || Boolean(request.reason?.trim()));
}

function parseRequests(serialized) {
  const requests = JSON.parse(serialized);
  if (!Array.isArray(requests) || !requests.every(isValidRequest)
    || new Set(requests.map(request => request.id)).size !== requests.length) {
    throw new Error('Invalid saved requests');
  }
  return requests;
}

function nextRequestId(requests) {
  // BigInt keeps IDs unique even when an imported ID exceeds Number's precision.
  const largest = requests.reduce((max, request) => {
    const number = BigInt(request.id.slice(3));
    return number > max ? number : max;
  }, 100n);
  return 'DG-' + (largest + 1n);
}

function agencyName(request) {
  return request.agency || 'Agency unrecorded';
}

function conflictDetails(area, streets, start, end, records, excludedId) {
  if (!Object.hasOwn(areas, area) || !isValidDate(start) || !isValidDate(end) || start > end) return [];
  const warnings = [];
  for (const street of areas[area]) {
    const date = lastResurfaced(street);
    if (!date) continue;
    const days = (Date.parse(start) - Date.parse(date)) / 86400000;
    if (streets.includes(street.name) && days >= 0 && days < 90) {
      warnings.push({ kind: 'resurfacing', street: street.name, date,
        message: street.name + ' was resurfaced on ' + date + '. Within 90 days of the proposed start.' });
    }
  }
  for (const request of records) {
    if (request.id !== excludedId && request.area === area && request.status !== 'Rejected'
      && start <= request.end && end >= request.start && streets.some(name => request.streets.includes(name))) {
      const overlapStart = start > request.start ? start : request.start;
      const overlapEnd = end < request.end ? end : request.end;
      for (const street of streets.filter(name => request.streets.includes(name))) {
        warnings.push({ kind: 'overlap', requestId: request.id, agency: agencyName(request), street,
          start: overlapStart, end: overlapEnd,
          message: request.id + ' overlaps this work: ' + agencyName(request) + ' on ' + street
            + ', ' + overlapStart + ' to ' + overlapEnd + '.' });
      }
    }
  }
  return warnings;
}

// Keep the text API for existing consumers; all surfaces share these rules.
function conflicts(...args) {
  return conflictDetails(...args).map(warning => warning.message);
}

function completedEvents(street, asOf = demoDate) {
  return street.events.filter(event => event.date <= asOf).slice().sort((a, b) => b.date.localeCompare(a.date));
}

function lastResurfaced(street) {
  return completedEvents(street).find(event => event.type === 'resurfacing')?.date || null;
}

function activityMonths(street, asOf = demoDate) {
  const end = new Date(asOf + 'T00:00:00Z');
  const events = completedEvents(street, asOf);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + index, 1));
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      events: events.filter(event => event.date.startsWith(key)) };
  });
}

function streetSummary(area, street, records) {
  const requests = records.filter(request => request.area === area && request.streets.includes(street.name));
  const active = requests.filter(request => request.status !== 'Rejected');
  const pending = active.filter(request => request.status === 'Submitted').length;
  const approved = active.filter(request => request.status === 'Approved').length;
  const flagged = active.some(request => conflictDetails(area, [street.name], request.start, request.end, records, request.id)
    .some(warning => warning.kind === 'overlap'));
  const recent = completedEvents(street).some(event => (Date.parse(demoDate) - Date.parse(event.date)) / 86400000 < 90);
  const status = flagged ? 'Conflict flagged' : pending ? pending + ' pending request' + (pending === 1 ? '' : 's')
    : approved ? approved + ' approved request' + (approved === 1 ? '' : 's') : 'Clear';
  return { lineCount: street.lines.length, pending, approved, flagged, recent, status, requests };
}
