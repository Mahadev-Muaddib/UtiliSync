function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidRequest(request) {
  if (!request || typeof request !== 'object' || typeof request.area !== 'string' || !Object.hasOwn(areas, request.area)) return false;
  const streets = areas[request.area].map(([name]) => name);
  return typeof request.id === 'string' && /^DG-[1-9]\d*$/.test(request.id)
    && Array.isArray(request.streets) && request.streets.length > 0
    && new Set(request.streets).size === request.streets.length
    && request.streets.every(name => streets.includes(name))
    && typeof request.purpose === 'string' && request.purpose.trim().length > 0 && request.purpose.length <= 120
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

function conflicts(area, streets, start, end, records, excludedId) {
  if (!Object.hasOwn(areas, area) || !isValidDate(start) || !isValidDate(end) || start > end) return [];
  const messages = [];
  for (const [name, , , , date] of areas[area]) {
    if (!date) continue;
    const days = (Date.parse(start) - Date.parse(date)) / 86400000;
    if (streets.includes(name) && days >= 0 && days < 90) {
      messages.push(name + ' was resurfaced on ' + date + '.');
    }
  }
  for (const request of records) {
    if (request.id !== excludedId && request.area === area && request.status !== 'Rejected'
      && start <= request.end && end >= request.start && streets.some(name => request.streets.includes(name))) {
      messages.push(request.id + ' overlaps this work (' + request.start + ' to ' + request.end + ').');
    }
  }
  return messages;
}
