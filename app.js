const byId = id => document.getElementById(id);
const area = byId('area'), form = byId('form'), dialog = byId('dialog');
const sheet = byId('street-sheet'), reviewDialog = byId('review-dialog');
const narrow = matchMedia('(max-width: 760px)');
const storeKey = 'utilisync.requests.v1';
let records = structuredClone(seedRequests);
let selected = '', sheetOpener = null, draftArea = '', draftOpener = null;
let reviewTrail = [], reviewOpener = null;
const visible = new Set(Object.keys(utilities));
let saved;
try { saved = localStorage.getItem(storeKey); }
catch { showNotice('Browser storage is unavailable. Changes will last for this session only.'); }
if (saved != null) {
  try { records = parseRequests(saved); }
  catch { showNotice('Saved requests could not be loaded. Sample requests are shown; saving a change will replace the unreadable data.'); }
}

function element(tag, text, parent, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  parent.append(el);
  return el;
}
function action(parent, label, fn, key, className) {
  const button = element('button', label, parent, className);
  button.type = 'button';
  button.onclick = fn;
  if (key) button.dataset.focusKey = key;
  return button;
}
function focusKey(key, scope = document) {
  if (key) [...scope.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === key)?.focus({ preventScroll: true });
}
function rememberFocus() {
  return { node: document.activeElement, key: document.activeElement?.dataset.focusKey };
}
function restoreFocus(savedFocus) {
  if (savedFocus?.node?.isConnected) savedFocus.node.focus({ preventScroll: true });
  else focusKey(savedFocus?.key);
}
function dateLabel(date) {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function showNotice(message) {
  byId('notice').textContent = message;
  byId('notice').hidden = !message;
}
function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(records)); showNotice(''); }
  catch { showNotice('Changes are available for this session only. Browser storage is unavailable.'); }
}
function sample(type, parent) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 36 10');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('line-sample');
  for (const casing of type === 'gas' ? [true, false] : [false]) {
    const line = document.createElementNS(svg.namespaceURI, 'line');
    for (const [key, value] of Object.entries({ x1: 1, x2: 35, y1: 5, y2: 5,
      'stroke-width': casing ? 5 : 3, 'stroke-dasharray': utilities[type].dash,
      class: casing ? 'gas-casing' : 'utility-' + type })) line.setAttribute(key, value);
    svg.append(line);
  }
  parent.append(svg);
}
function renderWarnings(parent, warnings, inspect = true) {
  parent.replaceChildren();
  for (const warning of warnings) {
    const item = element('div', '', parent, 'warning ' + warning.kind);
    element('strong', warning.kind === 'overlap' ? 'Conflict · overlapping work' : 'Recent resurfacing', item);
    element('p', warning.message, item);
    if (inspect && warning.requestId) action(item, 'Inspect ' + warning.requestId,
      () => openReview(warning.requestId), 'inspect-' + warning.requestId + '-' + warning.street);
  }
}
function selectStreet(name, source) {
  selected = name;
  if (source) sheetOpener = { source, name };
  render();
  byId('status').textContent = name + ' selected. Street record updated.';
  if (narrow.matches && source) {
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
    byId('close-record').focus({ preventScroll: true });
  } else if (source) {
    // The map is deliberately large; bring the opened record into view below it.
    byId('details').scrollIntoView({ block: 'start' });
  }
}
function render() {
  const roads = areas[area.value];
  const summaries = new Map(roads.map(street => [street.name, streetSummary(area.value, street, records)]));
  byId('title').textContent = area.value;
  drawMap(byId('map'), roads, visible, selected, selectStreet, summaries);
  byId('map-selected').textContent = selected + ' · ' + summaries.get(selected).status;
  const results = byId('results');
  const focused = results.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  results.replaceChildren();
  const query = byId('search').value.trim().toLowerCase();
  let count = 0;
  for (const street of roads) {
    const summary = summaries.get(street.name);
    const searchText = [street.name, ...street.lines.map(line => line.agency),
      ...summary.requests.map(request => [request.id, request.purpose, agencyName(request)].join(' '))].join(' ').toLowerCase();
    if (!searchText.includes(query)) continue;
    count++;
    const row = action(results, '', () => selectStreet(street.name, 'registry'), 'street-' + street.name, 'registry-row');
    row.setAttribute('aria-pressed', selected === street.name);
    row.dataset.street = street.name;
    element('strong', street.name, row);
    element('span', summary.lineCount + ' utility lines', row, 'line-count');
    element('span', summary.status, row, 'pill ' + (summary.flagged ? 'conflict' : 'neutral'));
    if (summary.flagged) element('span', summary.pending + ' pending · ' + summary.approved + ' approved', row, 'row-counts');
  }
  byId('street-count').textContent = count + ' / ' + roads.length;
  if (!count) element('p', 'No matching streets or requests.', results, 'empty');
  focusKey(focused, results);
  renderStreet(roads.find(street => street.name === selected), summaries.get(selected));
}
function renderStreet(street, summary) {
  const details = byId('details');
  const focused = details.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  details.replaceChildren();
  if (!street) return;
  const heading = element('div', '', details, 'record-heading');
  const title = element('div', '', heading);
  element('small', 'STREET RECORD / ' + area.value, title);
  element('h2', street.name, title).id = 'street-title';
  const state = element('div', '', heading, 'record-state');
  element('span', summary.status, state, 'pill ' + (summary.flagged ? 'conflict' : 'neutral'));
  if (summary.flagged) element('span', summary.pending + ' pending · ' + summary.approved + ' approved', state, 'muted');
  action(heading, 'Close record', () => sheet.close(), 'close-record', 'close-record').id = 'close-record';
  const columns = element('div', '', details, 'record-columns');
  const underground = element('section', '', columns, 'record-section');
  element('h3', 'Underground utilities', underground);
  element('p', summary.lineCount + ' individual lines · simulated depths', underground, 'section-intro');
  const lines = element('ul', '', underground, 'line-list');
  for (const line of street.lines) {
    const item = element('li', '', lines, 'line-record');
    const heading = element('div', '', item, 'line-heading');
    sample(line.type, heading);
    element('strong', utilities[line.type].label, heading);
    element('span', line.depth.toFixed(1) + ' m', heading, 'depth');
    element('p', line.agency, item);
    element('p', line.confidence + ' · Last touched ' + dateLabel(line.lastTouched), item, 'line-meta');
    element('span', line.id, item, 'asset-id');
  }
  const history = element('section', '', columns, 'record-section history');
  element('h3', 'Excavation history', history);
  element('p', 'Recorded work · last 12 months', history, 'section-intro');
  const months = activityMonths(street);
  const strip = element('ol', '', history, 'activity-strip');
  strip.setAttribute('aria-label', 'Monthly recorded work activity');
  for (const month of months) {
    const tick = element('li', '', strip, month.events.length ? 'active' : '');
    const label = month.label + ': ' + month.events.length + ' recorded work event' + (month.events.length === 1 ? '' : 's');
    tick.setAttribute('aria-label', label);
    tick.title = label;
    if (month.events.length) element('span', month.label.split(' ')[0], tick);
  }
  const range = element('div', '', history, 'activity-range');
  element('span', months[0].label, range); element('span', months[11].label, range);
  const activeMonths = months.filter(month => month.events.length).map(month => month.label);
  element('p', activeMonths.length ? 'Active: ' + activeMonths.join(' · ') : 'No recorded activity in this period.', history, 'active-months');
  const resurfaced = lastResurfaced(street);
  if (resurfaced) element('p', 'Last resurfaced on ' + dateLabel(resurfaced), history, 'resurfaced-note');
  else element('p', 'No resurfacing recorded.', history, 'muted');
  const events = element('ul', '', history, 'event-list');
  for (const event of completedEvents(street)) {
    const recent = (Date.parse(demoDate) - Date.parse(event.date)) / 86400000 < 90;
    const item = element('li', '', events, recent ? 'recent-event' : '');
    const date = element('time', dateLabel(event.date), item);
    date.dateTime = event.date;
    if (recent) element('span', event.type === 'resurfacing' ? 'Recent resurfacing' : 'Recent excavation', item, 'recent-label');
    element('p', event.purpose, item);
    element('p', event.agency, item, 'line-meta');
  }
  element('p', 'History is recorded work. Approval alone does not mark a dig as completed.', history, 'form-note');
  const planned = element('section', '', columns, 'record-section planned');
  element('h3', 'Planned work', planned);
  element('p', summary.pending + ' pending · ' + summary.approved + ' approved', planned, 'section-intro');
  action(planned, 'New dig request', openDraft, 'street-new', 'primary').id = 'street-new';
  const requests = element('div', '', planned, 'planned-list');
  if (!summary.requests.length) element('p', 'No requests on this street. Start a request to coordinate upcoming work.', requests, 'empty');
  for (const request of [...summary.requests].sort((a, b) => a.start.localeCompare(b.start))) {
    const card = element('article', '', requests, 'request-card');
    element('strong', request.id + ' · ' + request.status, card);
    element('p', agencyName(request), card);
    element('p', request.purpose, card, 'request-purpose');
    element('p', dateLabel(request.start) + ' to ' + dateLabel(request.end), card, 'request-dates');
    if (request.reason) element('p', 'Rejection reason: ' + request.reason, card);
    if (request.status !== 'Rejected') {
      const warnings = conflictDetails(request.area, request.streets, request.start, request.end, records, request.id);
      if (warnings.length) renderWarnings(element('div', '', card, 'warnings'), warnings, false);
    }
    action(card, 'View ' + request.id, () => openReview(request.id), 'view-' + request.id);
  }
  focusKey(focused, details);
}
function renderReview() {
  const request = records.find(record => record.id === reviewTrail.at(-1));
  const content = byId('review-content');
  content.replaceChildren();
  element('small', request.id + ' · ' + request.status, content);
  element('h2', request.purpose, content).id = 'review-title';
  element('p', agencyName(request), content, 'review-agency');
  element('p', request.area + ' · ' + request.streets.join(', '), content);
  element('p', dateLabel(request.start) + ' to ' + dateLabel(request.end), content);
  if (request.reason) element('p', 'Rejection reason: ' + request.reason, content);
  if (request.status !== 'Rejected') {
    const warnings = conflictDetails(request.area, request.streets, request.start, request.end, records, request.id);
    if (warnings.length) {
      element('h3', 'Coordination warnings', content);
      renderWarnings(element('div', '', content, 'warnings'), warnings);
      element('p', 'Coordinate timing and shared access with the named agency before digging. Warnings remain visible after approval.', content, 'form-note');
    }
  }
  if (request.status === 'Submitted' && byId('role').value === 'Coordinator') {
    const controls = element('div', '', content, 'review-controls');
    action(controls, 'Approve', () => reviewRequest(request, 'Approved'), null, 'primary');
    action(controls, 'Reject', () => {
      const reason = prompt('Why is this request being rejected?');
      if (reason === null) return;
      if (!reason.trim()) { alert('Enter a reason to reject the request.'); return; }
      request.reason = reason.trim();
      reviewRequest(request, 'Rejected');
    });
  } else if (request.status === 'Submitted') element('p', 'Switch the demo role to Coordinator to review this request.', content, 'form-note');
  byId('review-close').textContent = reviewTrail.length > 1 ? 'Return to ' + reviewTrail.at(-2)
    : dialog.open ? 'Return to draft' : 'Return to street';
}
function reviewRequest(request, status) {
  request.status = status;
  save(); render(); renderReview();
  byId('review-content').focus({ preventScroll: true });
  byId('status').textContent = request.id + ' ' + status.toLowerCase() + '. Map, registry and street record updated.';
}
function openReview(id) {
  if (!reviewDialog.open) { reviewOpener = rememberFocus(); reviewTrail = []; }
  reviewTrail.push(id);
  renderReview();
  if (!reviewDialog.open) reviewDialog.showModal();
  reviewDialog.scrollTop = 0;
  byId('review-content').focus({ preventScroll: true });
}
function closeReview() {
  if (reviewTrail.length > 1) { reviewTrail.pop(); renderReview(); byId('review-content').focus(); }
  else reviewDialog.close();
}
byId('review-close').onclick = closeReview;
reviewDialog.addEventListener('cancel', event => {
  if (reviewTrail.length > 1) { event.preventDefault(); closeReview(); }
});
reviewDialog.addEventListener('close', () => {
  if (dialog.open) updateForm();
  restoreFocus(reviewOpener);
});

for (const name of Object.keys(areas)) area.add(new Option(name, name));
area.value = initialArea;
byId('snapshot').textContent = dateLabel(demoDate);
for (const agency of agencies) form.elements.agency.add(new Option(agency, agency));
for (const [type, style] of Object.entries(utilities)) {
  const label = element('label', '', byId('layers'));
  const box = element('input', '', label);
  box.type = 'checkbox'; box.checked = true;
  sample(type, label);
  label.append(style.label);
  box.onchange = () => { if (box.checked) visible.add(type); else visible.delete(type); render(); };
}
function changeArea() {
  byId('search').value = '';
  selectStreet(areas[area.value][0].name);
}
area.onchange = changeArea;
byId('search').oninput = render;
byId('role').onchange = render;
function openDraft() {
  draftArea = area.value;
  draftOpener = rememberFocus();
  dialog.returnValue = '';
  form.reset();
  byId('draft-area').textContent = draftArea + ' · Simulated work request';
  byId('choices').replaceChildren();
  for (const { name } of areas[draftArea]) {
    const label = element('label', '', byId('choices'));
    const box = element('input', '', label);
    box.type = 'checkbox'; box.name = 'street'; box.value = name; box.checked = name === selected;
    label.append(' ' + name);
  }
  updateForm(); dialog.showModal();
}
byId('new').onclick = openDraft;
function updateForm() {
  const data = new FormData(form), streets = data.getAll('street');
  const start = data.get('start'), end = data.get('end');
  byId('choices').querySelector('input').setCustomValidity(streets.length ? '' : 'Select at least one street.');
  form.elements.end.min = start;
  const purpose = data.get('purpose').trim();
  form.elements.purpose.setCustomValidity(!purpose ? 'Enter a purpose.' : purpose.length > 120 ? 'Use at most 120 characters.' : '');
  form.elements.agency.setCustomValidity(agencies.includes(data.get('agency')) ? '' : 'Choose an agency.');
  form.elements.start.setCustomValidity(start && !isValidDate(start) ? 'Enter a valid date between years 0001 and 9999.' : '');
  form.elements.end.setCustomValidity(end && !isValidDate(end) ? 'Enter a valid date between years 0001 and 9999.' : start && end && end < start ? 'End date must be on or after the start date.' : '');
  renderWarnings(byId('warnings'), conflictDetails(draftArea, streets, start, end, records));
}
form.noValidate = true;
form.oninput = updateForm;
byId('cancel').onclick = () => dialog.close();
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'submitted') {
    if (narrow.matches && !sheet.open) {
      sheetOpener = { source: 'registry', name: selected };
      sheet.showModal();
    }
    byId('details').focus({ preventScroll: true });
  } else if (!reviewDialog.open) restoreFocus(draftOpener);
});
form.onsubmit = event => {
  event.preventDefault(); updateForm();
  if (!form.reportValidity()) return;
  const data = new FormData(form), id = nextRequestId(records);
  records.push({ id, area: draftArea, agency: data.get('agency'), streets: data.getAll('street'),
    purpose: data.get('purpose').trim(), start: data.get('start'), end: data.get('end'), status: 'Submitted' });
  save(); dialog.close('submitted'); render();
  byId('status').textContent = id + ' submitted. Map, registry and street record updated.';
};
function placeRecord() {
  byId('map').setAttribute('viewBox', narrow.matches ? '35 25 550 300' : '0 0 640 360');
  if (narrow.matches) sheet.append(byId('details'));
  else {
    if (sheet.open) sheet.close();
    byId('record-home').append(byId('details'));
  }
}
sheet.addEventListener('close', () => {
  if (!sheetOpener) return;
  if (sheetOpener.source === 'map') [...byId('map').querySelectorAll('g')]
    .find(node => node.dataset.street === sheetOpener.name)?.focus({ preventScroll: true });
  else focusKey('street-' + sheetOpener.name, byId('results'));
});
narrow.addEventListener('change', placeRecord);
byId('reset').onclick = () => {
  if (confirm('Replace saved requests in both demo areas with the original samples?')) {
    records = structuredClone(seedRequests); save(); changeArea();
  }
};
placeRecord(); changeArea();
