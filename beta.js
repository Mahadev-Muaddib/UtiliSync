'use strict';
/* Optional, session-only simulation. No writes to source data or saved requests. */
window.BetaDig = (() => {
  const get = id => document.getElementById(id);
  let source = [], snapshot, openSource, map, zones, sourceLayer, draftLayer, tileLayer;
  let requests = [], sequence = 1, loading = false, initialized = false;
  const sourceMarkers = new Map();
  const field = name => get('beta-form').elements.namedItem(name);
  function node(tag, text, parent, className) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; if (parent) parent.append(n); return n; }
  function action(parent, title, handler) { const b = node('button', title, parent); b.type = 'button'; b.onclick = handler; return b; }
  function draft() {
    const number = name => field(name).value === '' ? NaN : Number(field(name).value);
    return { area: get('beta-area').value, agency: field('agency').value.trim(), purpose: field('purpose').value.trim(), latitude: number('latitude'), longitude: number('longitude'), radius: number('radius'), start: field('start').value, end: field('end').value };
  }
  function dated(offset) { const d = new Date(snapshot + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
  function areaRecords() { return source.filter(r => r.municipality === get('beta-area').value); }
  function setPoint(latitude, longitude, pan = false) {
    field('latitude').value = latitude.toFixed(7); field('longitude').value = longitude.toFixed(7);
    if (pan) map.setView([latitude, longitude], 16);
    renderDraft();
  }
  function fit() {
    const points = areaRecords().map(r => [r.coordinates[1], r.coordinates[0]]);
    points.push(...requests.filter(r => r.area === get('beta-area').value).map(r => [r.latitude, r.longitude]));
    if (points.length) map.fitBounds(points, { padding: [25, 25], maxZoom: 15 });
    else map.setView(get('beta-area').value === 'kollam' ? [8.89, 76.6] : [9.055, 76.535], 13);
  }
  function renderSources() {
    sourceLayer.clearLayers(); sourceMarkers.clear();
    const options = get('beta-landmark'); options.replaceChildren(); node('option', 'Choose a source landmark (optional)', options).value = '';
    for (const r of areaRecords()) {
      node('option', r.title + ' · ' + r.id, options).value = r.id;
      const popup = node('div', null, null, 'beta-popup');
      node('strong', 'SOURCE RECORD · ' + r.id, popup); node('h3', r.title, popup); node('p', r.status.replaceAll('_', ' '), popup);
      node('p', 'Latitude ' + r.coordinates[1] + ' · Longitude ' + r.coordinates[0], popup);
      node('p', r.raw.description || r.raw.latest_status_text || r.raw.work || 'No description supplied.', popup);
      node('p', 'Complaint: ' + (r.raw.complaint_date_raw || 'Unknown') + ' · Closure: ' + (r.raw.closed_date_raw || 'Unknown'), popup);
      node('p', 'Location: ' + (r.raw.coordinate_status || 'Source-reported') + ' · ' + (r.raw.boundary_check || 'Boundary check unknown'), popup);
      action(popup, 'Use point for mock draft', () => setPoint(r.coordinates[1], r.coordinates[0]));
      action(popup, 'Open full source details', () => openSource(r.id));
      const marker = L.circleMarker([r.coordinates[1], r.coordinates[0]], { radius: 5, color: '#125c92', weight: 1.5, fillColor: '#62a7d5', fillOpacity: .85, bubblingMouseEvents: false }).bindPopup(popup, { maxWidth: Math.min(330, get('beta-map').clientWidth - 70), maxHeight: 240 }).addTo(sourceLayer);
      marker.on('click', () => { options.value = r.id; setPoint(r.coordinates[1], r.coordinates[0]); });
      sourceMarkers.set(r.id, marker);
      const shape = marker.getElement();
      if (shape) {
        shape.setAttribute('tabindex', '0'); shape.setAttribute('role', 'button'); shape.setAttribute('aria-label', 'Source ' + r.title + ' · ' + r.id); shape.dataset.sourceId = r.id;
        shape.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); marker.fire('click'); marker.openPopup(); } });
      }
    }
  }
  function renderDraft() {
    if (!map) return;
    draftLayer.clearLayers(); const r = draft();
    if (BetaRules.validZone(r)) L.circle([r.latitude, r.longitude], { radius: r.radius, color: '#c92d6d', fillOpacity: .12, dashArray: '5 5', interactive: false }).addTo(draftLayer);
    const parent = get('beta-warnings'); parent.replaceChildren();
    const error = BetaRules.validation({ ...r, agency: r.agency || 'Draft', purpose: r.purpose || 'Draft' });
    if (error) { node('p', error, parent); return; }
    const overlaps = BetaRules.conflicts(r, requests);
    if (!overlaps.length) node('p', 'No simulated overlaps with active mock requests.', parent);
    for (const overlap of overlaps) node('p', 'Simulated overlap with ' + overlap.id + ' (' + overlap.agency + '), ' + overlap.distance + ' m between centres, ' + overlap.start + ' to ' + overlap.end + '.', parent);
  }
  function renderRequests() {
    zones.clearLayers(); const list = get('beta-requests'); list.replaceChildren();
    const rows = requests.filter(r => r.area === get('beta-area').value);
    get('beta-count').textContent = rows.length + ' mock requests in this area · ' + requests.length + ' total';
    if (!rows.length) node('p', 'No mock requests. Submit a test or add an example overlap.', list, 'empty');
    for (const r of rows) {
      const overlaps = BetaRules.conflicts(r, requests);
      const color = r.status === 'Rejected' ? '#71808b' : overlaps.length ? '#a76500' : '#6d49ad';
      const popup = node('div', null, null, 'beta-popup'); node('strong', 'MOCK ONLY · ' + r.id, popup); node('p', r.purpose, popup); node('p', r.agency + ' · ' + r.status, popup); node('p', r.start + ' to ' + r.end, popup); node('p', 'Latitude ' + r.latitude + ' · Longitude ' + r.longitude, popup);
      const circle = L.circle([r.latitude, r.longitude], { radius: r.radius, color, fillOpacity: .17, dashArray: r.status === 'Rejected' ? '4 5' : undefined, bubblingMouseEvents: false }).bindPopup(popup).addTo(zones);
      const card = node('article', null, list, 'beta-request'); card.dataset.mockId = r.id;
      node('strong', r.id + ' · MOCK · ' + r.status, card); node('h3', r.purpose, card); node('p', r.agency, card); node('p', r.start + ' to ' + r.end + ' · ' + r.radius + ' m test radius', card);
      node('p', 'Latitude ' + r.latitude + ' · Longitude ' + r.longitude, card, 'muted');
      if (overlaps.length) node('p', 'Simulated overlaps: ' + overlaps.map(o => o.id).join(', '), card, 'quality-note');
      const controls = node('div', null, card, 'beta-request-actions');
      action(controls, 'Show on map', () => { map.setView([r.latitude, r.longitude], 17); circle.openPopup(); get('beta-map').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      if (r.status === 'Submitted') {
        action(controls, 'Simulate approval', () => review(r.id, 'Approved'));
        action(controls, 'Simulate rejection', () => review(r.id, 'Rejected'));
      }
    }
    renderDraft();
  }
  function review(id, status) {
    requests.find(r => r.id === id).status = status; renderRequests();
    get('beta-action-status').textContent = id + ': mock ' + status.toLowerCase() + '. No official action was taken.';
    get('beta-action-status').focus();
  }
  function append(values) { requests.push({ ...values, id: 'BETA-' + sequence++, status: 'Submitted' }); }
  function loadAsset(tag, url) {
    return new Promise((resolve, reject) => {
      const asset = document.createElement(tag); if (tag === 'link') { asset.rel = 'stylesheet'; asset.href = url; } else asset.src = url;
      const timer = setTimeout(() => { asset.remove(); reject(Error('Map assets timed out.')); }, 12000);
      asset.onload = () => { clearTimeout(timer); resolve(); }; asset.onerror = () => { clearTimeout(timer); asset.remove(); reject(Error('Leaflet assets unavailable. Run npm install, then retry.')); };
      document.head.append(asset);
    });
  }
  async function open() {
    if (map) { requestAnimationFrame(() => map.invalidateSize()); return; }
    if (loading) return; loading = true; get('beta-retry').hidden = true; get('beta-load-status').textContent = 'Loading Leaflet map…';
    try {
      await Promise.all([loadAsset('link', 'vendor/leaflet.css'), window.L ? Promise.resolve() : loadAsset('script', 'vendor/leaflet.js')]);
      get('beta-workspace').hidden = false;
      map = L.map('beta-map', { scrollWheelZoom: false, minZoom: 3, maxZoom: 19 }).setView([9.055, 76.535], 13);
      tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      tileLayer.on('tileerror', () => { get('beta-tile-status').textContent = 'Some map tiles could not load. Source markers, coordinate entry and mock testing remain available; the background may be incomplete.'; });
      L.control.scale({ imperial: false }).addTo(map);
      sourceLayer = L.layerGroup().addTo(map); zones = L.layerGroup().addTo(map); draftLayer = L.layerGroup().addTo(map);
      map.on('click', event => { get('beta-landmark').value = ''; setPoint(event.latlng.lat, event.latlng.wrap().lng); });
      field('start').value = dated(7); field('end').value = dated(10);
      renderSources(); fit(); renderRequests();
      get('beta-load-status').textContent = 'BETA ready · Click a source marker for details or any map location to set draft coordinates.';
      requestAnimationFrame(() => map.invalidateSize());
    } catch (error) {
      if (map) { map.remove(); map = null; } get('beta-workspace').hidden = true;
      get('beta-load-status').textContent = error.message; get('beta-retry').hidden = false;
    } finally { loading = false; }
  }
  function init(records, snapshotDate, sourceCallback) {
    if (initialized) return; initialized = true;
    // Clone just the source context; simulation state never shares mutable source rows.
    source = structuredClone(records.filter(r => r.coordinates)); snapshot = snapshotDate; openSource = sourceCallback;
    get('beta-playground').addEventListener('toggle', () => { if (get('beta-playground').open) open(); });
    get('beta-retry').onclick = open; get('beta-fit').onclick = fit;
    get('beta-area').onchange = () => { field('latitude').value = ''; field('longitude').value = ''; renderSources(); fit(); renderRequests(); };
    get('beta-landmark').onchange = () => { const r = source.find(r => r.id === get('beta-landmark').value); if (r) { setPoint(r.coordinates[1], r.coordinates[0], true); sourceMarkers.get(r.id)?.openPopup(); } };
    get('beta-form').addEventListener('input', event => { if (['latitude', 'longitude'].includes(event.target.name)) get('beta-landmark').value = ''; field('end').setCustomValidity(''); renderDraft(); });
    get('beta-form').onsubmit = event => {
      event.preventDefault(); const values = draft(), error = BetaRules.validation(values);
      if (error) { get('beta-warnings').textContent = error; return; }
      append(values); renderRequests(); get('beta-action-status').textContent = requests.at(-1).id + ' submitted as a mock request. Source data is unchanged.';
    };
    get('beta-sample').onclick = () => {
      let values = draft();
      if (!BetaRules.validZone(values)) {
        const reference = areaRecords().find(r => r.id === 'kwa-1572397') || areaRecords()[0];
        const centre = reference ? [reference.coordinates[1], reference.coordinates[0]] : [map.getCenter().lat, map.getCenter().lng];
        field('radius').value = '50'; setPoint(...centre, true);
      }
      values = { ...draft(), agency: 'Example water crew (mock)', purpose: 'Example connection repair (mock)' };
      if (BetaRules.validation(values)) { field('start').value = dated(7); field('end').value = dated(10); values = { ...values, start: field('start').value, end: field('end').value }; }
      append(values); append({ ...values, agency: 'Example telecom crew (mock)', purpose: 'Example duct inspection (mock)' });
      renderRequests(); get('beta-action-status').textContent = 'Added two fictional requests at the same point and dates to demonstrate an overlap.';
    };
    get('beta-reset').onclick = () => { requests = []; renderRequests(); get('beta-action-status').textContent = 'All mock requests cleared. Source records and saved user requests are unchanged.'; };
    if (get('beta-playground').open) open();
  }
  return { init };
})();
