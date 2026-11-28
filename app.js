'use strict';
const byId = id => document.getElementById(id);
const labels = { maintenance_incidents: 'Maintenance incidents', water_projects: 'Water projects', official_work_observations: 'Official observations' };
let dataset, layers = [], selected = '', localRequests = [];
function el(tag, text, parent, className) {
  const node = document.createElement(tag); if (text != null) node.textContent = text;
  if (className) node.className = className; parent.append(node); return node;
}
function button(parent, label, handler, className) { const node = el('button', label, parent, className); node.type = 'button'; node.onclick = handler; return node; }
function human(value) { return String(value).replaceAll('_', ' '); }
function valueText(value) { return value == null || value === '' ? 'Unknown' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); }
function sourceLink(parent, url, label = 'View source') {
  try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) return; const a = el('a', label, parent); a.href = parsed.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } catch { /* Missing/invalid URLs remain visible in raw fields. */ }
}
function field(parent, label, value) { const item = el('div', null, parent, 'fact'); el('dt', label, item); el('dd', valueText(value), item); }
function scopeRecords() { return dataset.records.filter(r => byId('area').value === 'all' || r.municipality === byId('area').value); }
function filteredRecords() {
  const query = byId('search').value.trim().toLowerCase();
  return scopeRecords().filter(r => (byId('kind').value === 'all' || r.collection === byId('kind').value) && (byId('record-status').value === 'all' || r.status === byId('record-status').value) && (!query || JSON.stringify(r.raw).toLowerCase().includes(query)));
}
function selectRecord(id, reveal = true) {
  if (!dataset.byId.has(id)) return;
  selected = id; renderRegistry(); renderMap(); renderDetails();
  byId('status').textContent = dataset.byId.get(id).title + ' selected.';
  if (reveal) { byId('details').scrollIntoView({ block: 'start', behavior: 'smooth' }); byId('details').focus({ preventScroll: true }); }
}
function navigateRecord(id) {
  const r = dataset.byId.get(id); if (!r) return;
  if (byId('area').value !== 'all' && byId('area').value !== r.municipality) byId('area').value = r.municipality;
  byId('kind').value = 'all'; byId('search').value = ''; byId('record-status').value = 'all'; selected = id; render(); selectRecord(id);
}
function statusOptions() {
  const old = byId('record-status').value; byId('record-status').replaceChildren();
  el('option', 'All statuses', byId('record-status')).value = 'all';
  for (const status of [...new Set(scopeRecords().filter(r => byId('kind').value === 'all' || r.collection === byId('kind').value).map(r => r.status))].sort()) el('option', human(status), byId('record-status')).value = status;
  if ([...byId('record-status').options].some(o => o.value === old)) byId('record-status').value = old;
}
function renderStats() {
  const parent = byId('stats'); parent.replaceChildren(); const records = scopeRecords();
  for (const [key, label] of Object.entries(labels)) { const card = el('div', null, parent, 'stat'); el('strong', records.filter(r => r.collection === key).length, card); el('span', label, card); }
  const card = el('div', null, parent, 'stat'); el('strong', dependenciesInScope().length, card); el('span', 'Documented dependencies', card);
}
function renderRegistry() {
  const rows = filteredRecords(), parent = byId('results');
  const focusedId = parent.contains(document.activeElement) ? document.activeElement.dataset.recordId : null;
  parent.replaceChildren(); byId('record-count').textContent = rows.length + ' / ' + scopeRecords().length;
  if (!rows.length) el('p', 'No source records match these filters.', parent, 'empty');
  for (const r of rows) {
    const row = button(parent, '', () => selectRecord(r.id), 'registry-row'); row.dataset.recordId = r.id; row.setAttribute('aria-pressed', selected === r.id);
    el('span', r.id + ' · ' + ProjectData.municipalities[r.municipality], row, 'record-id'); el('strong', r.title, row);
    el('span', human(r.status), row, 'pill' + (r.status.includes('cancelled') ? ' conflict' : ''));
    if (r.raw.boundary_check === 'outside_osm_boundary_review') el('span', 'Boundary review', row, 'quality-tag');
  }
  if (focusedId) [...parent.children].find(n => n.dataset.recordId === focusedId)?.focus({ preventScroll: true });
}
function renderMap() {
  const rows = filteredRecords(), pointRows = rows.filter(r => r.collection === 'maintenance_incidents' && r.coordinates);
  const applicable = layers.filter(l => !l.municipality_key || byId('area').value === 'all' || l.municipality_key === byId('area').value);
  drawMap(byId('map'), rows, selected, selectRecord, applicable);
  byId('map-summary').textContent = pointRows.length + ' source points · ' + rows.filter(r => !r.coordinates).length + ' records without coordinates · ' + pointRows.filter(r => r.raw.boundary_check === 'outside_osm_boundary_review').length + ' boundary exceptions. Coincident points may overlap; every record is listed in the registry.';
  const parent = byId('layers'); parent.replaceChildren();
  for (const layer of applicable) {
    const item = el('div', null, parent, 'layer-item');
    if (layer.available && layer.kind !== 'source_maintenance_closure_points') {
      const label = el('label', null, item); const checkbox = el('input', null, label); checkbox.type = 'checkbox'; checkbox.checked = layer.visible !== false;
      el('span', human(layer.kind) + ' · ' + (layer.municipality_key || 'both municipalities'), label);
      checkbox.onchange = () => { layer.visible = checkbox.checked; renderMap(); };
    } else el('strong', human(layer.kind) + ' · ' + (layer.available ? 'Loaded' : 'Unavailable (' + layer.error + ')'), item);
    el('p', layer.path, item, 'muted'); el('p', (layer.attribution || 'Attribution unrecorded') + ' · ' + (layer.licence || 'Licence unrecorded'), item, 'muted');
  }
}
function renderDetails() {
  const parent = byId('details'); parent.replaceChildren(); const r = dataset.byId.get(selected);
  if (!r) { el('p', 'Select a record or a map point to inspect the source.', parent, 'empty'); return; }
  const raw = r.raw; const header = el('div', null, parent, 'record-heading'); const heading = el('div', null, header);
  el('small', labels[r.collection] + ' / ' + r.id, heading); el('h2', r.title, heading);
  el('span', human(r.status), header, 'pill' + (r.status.includes('cancelled') ? ' conflict' : ''));
  el('p', raw.description || raw.latest_status_text || raw.reason_summary || raw.source_title || raw.work || 'No additional description supplied.', parent, 'record-description');
  const facts = el('dl', null, parent, 'facts'); field(facts, 'Municipality', ProjectData.municipalities[r.municipality]);
  if (r.collection === 'maintenance_incidents') {
    field(facts, 'Complaint date (source)', raw.complaint_date_raw); field(facts, 'Closure date (source)', raw.closed_date_raw);
    field(facts, 'Verified excavation start', raw.verified_excavation_start); field(facts, 'Verified restoration date', raw.verified_restoration_date);
    field(facts, 'Pipe material / diameter', valueText(raw.pipe_material) + ' / ' + (raw.pipe_diameter_mm == null ? 'Unknown' : raw.pipe_diameter_mm + ' mm'));
    field(facts, 'Coordinates (longitude, latitude)', r.coordinates?.join(', ')); field(facts, 'Coordinate status', raw.coordinate_status);
    field(facts, 'Boundary check', raw.boundary_check); field(facts, 'Date quality', raw.date_check);
    el('p', 'Complaint and closure dates describe maintenance records. They do not verify excavation or restoration dates.', parent, 'source-note');
  } else {
    field(facts, 'Status observation / effective date', r.date);
    if (r.collection === 'water_projects') {
      field(facts, 'Progress reported', raw.progress_percent_reported == null ? null : raw.progress_percent_reported + '%');
      field(facts, 'Administrative sanction (INR)', raw.administrative_sanction_inr?.toLocaleString('en-IN'));
      field(facts, 'Technical sanction (INR)', raw.technical_sanction_inr?.toLocaleString('en-IN'));
      field(facts, 'Completion date (raw source)', raw.actual_completion_date_raw); field(facts, 'Verified completion date', raw.actual_completion_date_verified);
      field(facts, 'Latest supplied / laid length', raw.supplied_length_m_latest == null && raw.laid_length_m_latest == null ? null : valueText(raw.supplied_length_m_latest) + ' / ' + valueText(raw.laid_length_m_latest) + ' m');
    } else {
      field(facts, 'Amount (INR)', raw.amount_inr?.toLocaleString('en-IN')); field(facts, 'Amount basis', raw.amount_basis);
      field(facts, 'Status evidence', raw.status_observed_in); field(facts, 'Submission deadline', raw.submission_deadline);
      field(facts, 'Current live status', raw.status_is_current_live);
    }
    field(facts, 'Location precision', raw.spatial_precision || raw.coordinate_accuracy || raw.geographic_scope);
    el('p', 'Amounts retain their source types. Related sanctions, tender values and components are not added together.', parent, 'source-note');
  }
  field(facts, 'Source retrieved', raw.retrieved_on || raw.retrieved_at || raw.retrieved_date);
  for (const key of ['data_quality_notes', 'limitations', 'scope_basis', 'municipality_assignment']) if (raw[key]) el('p', human(key) + ': ' + valueText(raw[key]), parent, 'quality-note');
  sourceLink(parent, raw.source_url); if (raw.detail_source_url) sourceLink(parent, raw.detail_source_url, 'Detailed evidence');
  const links = dataset.project_crosswalk.filter(link => link.works_record_id === r.id || link.pask_project_id === raw.project_id);
  if (links.length) {
    el('h3', 'Candidate links across sources', parent);
    for (const link of links) {
      const block = el('div', null, parent, 'crosswalk'); const other = r.id === link.works_record_id ? dataset.records.find(p => p.collection === 'water_projects' && p.raw.project_id === link.pask_project_id) : dataset.byId.get(link.works_record_id);
      button(block, other.id + ' · ' + other.title, () => navigateRecord(other.id));
      el('p', 'Relationship: ' + human(link.relationship), block); el('p', 'Confidence: ' + link.confidence, block); el('p', link.budget_handling, block);
    }
  }
  const related = dataset.coordination_dependencies.filter(d => d.prerequisite_record_id === r.id || d.dependent_record_id === r.id);
  if (related.length) { el('h3', 'Documented relationships', parent); for (const d of related) dependencyCard(parent, d); }
  const rawDetails = el('details', null, parent, 'raw-details'); el('summary', 'All original source fields', rawDetails);
  const all = el('dl', null, rawDetails, 'raw-fields'); for (const [key, value] of Object.entries(raw)) field(all, key, value);
}
function dependenciesInScope() { const ids = new Set(scopeRecords().map(r => r.id)); return dataset.coordination_dependencies.filter(d => ids.has(d.prerequisite_record_id) || ids.has(d.dependent_record_id)); }
function dependencyCard(parent, d) {
  const card = el('article', null, parent, 'dependency'); const chain = el('div', null, card, 'dependency-chain');
  for (const [index, id] of [d.prerequisite_record_id, d.dependent_record_id].entries()) {
    if (index) el('span', '→', chain, 'connector');
    const node = button(chain, '', () => navigateRecord(id), 'dependency-node'); el('strong', id, node); el('span', dataset.byId.get(id).title, node);
  }
  el('p', human(d.relationship) + ' · Evidence ' + valueText(d.evidence_date), card);
  el('p', d.interpretation, card, 'muted'); sourceLink(card, d.source_url);
}
function renderCharts() {
  const records = scopeRecords(), activity = byId('activity'); activity.replaceChildren();
  const months = ProjectData.monthly(dataset, records.filter(r => r.collection === 'maintenance_incidents'));
  const max = Math.max(1, ...months.flatMap(m => [m.complaints, m.closures])); const chart = el('div', null, activity, 'month-chart');
  for (const m of months) {
    const column = el('div', null, chart, 'month-column'); column.title = m.key + ': ' + m.complaints + ' complaints, ' + m.closures + ' closures';
    column.setAttribute('aria-label', column.title); const bars = el('div', null, column, 'month-bars');
    for (const [key, color] of [['complaints', 'complaint-bar'], ['closures', 'closure-bar']]) { const bar = el('div', null, bars, color); bar.style.height = (m[key] / max * 130) + 'px'; el('span', m[key], bar); }
    el('span', new Date(m.key + '-01T00:00:00Z').toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }), column, 'month-label');
  }
  el('p', months[0].key + ' – ' + months.at(-1).key + ' · Blue: complaints · Pink: closures', activity, 'chart-legend');
  const tableDetails = el('details', null, activity); el('summary', 'View monthly counts', tableDetails);
  const table = el('table', null, tableDetails); const head = el('tr', null, el('thead', null, table)); for (const label of ['Month', 'Complaints', 'Closures']) el('th', label, head);
  const body = el('tbody', null, table); for (const m of months) { const row = el('tr', null, body); for (const v of [m.key, m.complaints, m.closures]) el('td', v, row); }
  const progress = byId('progress'); progress.replaceChildren();
  const projects = records.filter(r => r.collection === 'water_projects');
  if (!projects.length) el('p', 'No water project snapshots in this scope.', progress, 'empty');
  for (const r of projects) {
    const card = el('div', null, progress, 'progress-card'); button(card, r.title, () => navigateRecord(r.id), 'text-button');
    el('p', human(r.status) + ' · Status date: ' + valueText(r.raw.latest_status_date), card, 'muted');
    if (r.raw.progress_percent_reported == null) el('p', 'Progress unknown', card);
    else { const meter = el('progress', null, card); meter.max = 100; meter.value = r.raw.progress_percent_reported; meter.setAttribute('aria-label', r.title + ' reported progress'); el('strong', r.raw.progress_percent_reported + '% reported', card); }
    el('p', r.raw.progress_basis, card, 'muted');
  }
  const dependencies = byId('dependencies'); dependencies.replaceChildren();
  const related = dependenciesInScope(); if (!related.length) el('p', 'No documented dependencies in this scope.', dependencies, 'empty'); related.forEach(d => dependencyCard(dependencies, d));
  const featured = byId('featured'); featured.replaceChildren();
  const cases = dataset.featured_cases.filter(f => records.some(r => r.id === f.source_record_id));
  if (!cases.length) el('p', 'No featured cases in this scope.', featured, 'empty');
  for (const f of cases) { const card = el('article', null, featured, 'feature'); button(card, f.title, () => navigateRecord(f.source_record_id), 'text-button'); el('p', f.finding, card); el('p', f.evidence_date + ' · ' + f.place, card, 'muted'); el('p', f.prototype_use, card, 'muted'); sourceLink(card, f.source_url); }
}
function renderLocal() {
  const parent = byId('local-requests'); parent.replaceChildren();
  if (!localRequests.length) el('p', 'No preserved user-created requests.', parent, 'empty');
  for (const raw of localRequests) {
    const item = el('details', null, parent, 'local-request'); el('summary', valueText(raw?.id) + ' · ' + valueText(raw?.purpose), item);
    el('pre', JSON.stringify(raw, null, 2), item);
  }
}
function render() {
  byId('title').textContent = byId('area').value === 'all' ? 'Works, grounded in evidence.' : ProjectData.municipalities[byId('area').value];
  statusOptions(); if (!filteredRecords().some(r => r.id === selected)) selected = '';
  renderStats(); renderRegistry(); renderMap(); renderDetails(); renderCharts();
}
async function start() {
  try {
    dataset = await ProjectData.load(new URL('.', document.baseURI));
    const migration = ProjectData.migrateRequests(localStorage); localRequests = migration.records;
    if (migration.notice) { byId('notice').textContent = migration.notice; byId('notice').hidden = false; }
  } catch (error) {
    // Storage can be disabled independently of the source loader.
    if (!dataset) { byId('loading').hidden = true; byId('error').textContent = 'Unable to load project data. ' + error.message; byId('error').hidden = false; byId('snapshot').textContent = 'Unavailable'; return; }
    byId('notice').textContent = 'Browser storage is unavailable. Source records are still available.'; byId('notice').hidden = false;
  }
  layers = await ProjectData.loadLayers(dataset, new URL('.', document.baseURI));
  byId('snapshot').textContent = dataset.snapshot_date; byId('scope').textContent = dataset.scope;
  byId('loading').hidden = true; byId('content').hidden = false;
  byId('area').onchange = render; byId('kind').onchange = render; byId('record-status').onchange = render; byId('search').oninput = () => { if (!filteredRecords().some(r => r.id === selected)) selected = ''; renderRegistry(); renderMap(); renderDetails(); };
  byId('clear').onclick = () => { byId('search').value = ''; byId('kind').value = 'all'; byId('record-status').value = 'all'; render(); };
  byId('fit-map').onclick = renderMap; render(); renderLocal();
}
start();
