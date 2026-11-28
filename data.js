/* The only adapter between project_data.json and the application. */
(function (root) {
  'use strict';
  const collections = ['maintenance_incidents', 'water_projects', 'official_work_observations'];
  const required = [...collections, 'coordination_dependencies', 'project_crosswalk', 'featured_cases', 'layers'];
  const municipalities = { karunagappally: 'Karunagappally', kollam: 'Kollam' };
  function point(lon, lat) {
    return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
  }
  function validate(data) {
    if (!data || data.schema_version !== '1.0.0' || !/^\d{4}-\d{2}-\d{2}$/.test(data.snapshot_date)) throw Error('Unsupported schema or missing snapshot date.');
    for (const key of required) if (!Array.isArray(data[key])) throw Error(key + ' must be an array.');
    const records = [], byId = new Map();
    for (const collection of collections) for (const raw of data[collection]) {
      if (!raw || typeof raw.record_id !== 'string' || !raw.record_id || byId.has(raw.record_id)) throw Error('Missing or duplicate record_id in ' + collection + '.');
      if (!Object.hasOwn(municipalities, raw.municipality_key)) throw Error('Unknown municipality_key on ' + raw.record_id + '.');
      if (collection === 'maintenance_incidents' && (typeof raw.incident_no !== 'string' || !raw.incident_no)) throw Error('Missing incident_no on ' + raw.record_id + '.');
      if (collection === 'water_projects' && typeof raw.project_id !== 'string') throw Error('Missing project_id on ' + raw.record_id + '.');
      for (const field of ['longitude', 'latitude', 'progress_percent_reported']) if (raw[field] != null && !Number.isFinite(raw[field])) throw Error('Invalid ' + field + ' on ' + raw.record_id + '.');
      if (raw.progress_percent_reported != null && (raw.progress_percent_reported < 0 || raw.progress_percent_reported > 100)) throw Error('Invalid progress on ' + raw.record_id + '.');
      if (raw.longitude != null && raw.latitude != null && !point(raw.longitude, raw.latitude)) throw Error('Invalid coordinates on ' + raw.record_id + '.');
      const record = { id: raw.record_id, collection, municipality: raw.municipality_key,
        title: raw.landmark || raw.title || raw.work || raw.record_id,
        status: raw.status_reported ?? raw.status ?? 'Unknown',
        date: raw.latest_status_date ?? raw.status_effective_date ?? raw.publication_date ?? raw.complaint_date_raw ?? null,
        coordinates: point(raw.longitude, raw.latitude), raw };
      records.push(record); byId.set(record.id, record);
    }
    for (const dependency of data.coordination_dependencies) {
      if (!dependency || !byId.has(dependency.dependent_record_id) || !byId.has(dependency.prerequisite_record_id)) throw Error('Unresolved coordination dependency.');
    }
    for (const feature of data.featured_cases) if (!feature || !byId.has(feature.source_record_id)) throw Error('Unresolved featured case.');
    for (const link of data.project_crosswalk) if (!link || !byId.has(link.works_record_id) || !records.some(r => r.collection === 'water_projects' && r.raw.project_id === link.pask_project_id)) throw Error('Unresolved project crosswalk.');
    for (const layer of data.layers) if (!layer || typeof layer.path !== 'string' || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+\.geojson$/.test(layer.path)) throw Error('Invalid optional layer path.');
    return { ...data, records, byId };
  }
  async function load(rootURL, fetcher = fetch) {
    let response;
    try { response = await fetcher(new URL('project_data.json', rootURL)); }
    catch { throw Error('Cannot read project_data.json. Start the app with npm start and open its local URL.'); }
    if (!response.ok) throw Error('project_data.json is unavailable (HTTP ' + response.status + ').');
    let data;
    try { data = await response.json(); } catch { throw Error('project_data.json is not valid JSON.'); }
    return validate(data);
  }
  async function loadLayers(data, rootURL, fetcher = fetch) {
    return Promise.all(data.layers.map(async layer => {
      try {
        const response = await fetcher(new URL(layer.path, rootURL));
        if (!response.ok) throw Error('HTTP ' + response.status);
        const geojson = await response.json();
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) throw Error('Invalid GeoJSON');
        if (layer.kind === 'source_maintenance_closure_points') {
          const points = new Map();
          for (const feature of geojson.features) {
            const coords = feature.geometry?.coordinates;
            const incident = feature.properties?.incident_no;
            if (incident != null && feature.geometry?.type === 'Point' && point(coords?.[0], coords?.[1])) {
              if (points.has(String(incident))) throw Error('Duplicate incident_no in point layer');
              points.set(String(incident), coords.slice(0, 2));
            }
          }
          for (const record of data.records.filter(r => r.collection === 'maintenance_incidents')) {
            const coords = points.get(record.raw.incident_no);
            if (coords) record.coordinates = coords;
          }
        }
        return { ...layer, available: true, geojson };
      } catch (error) { return { ...layer, available: false, error: error.message }; }
    }));
  }
  function migrateRequests(storage) {
    const key = 'utilisync.requests.v1';
    try {
      const saved = storage.getItem(key);
      if (saved == null) return { records: [], notice: '' };
      const rows = JSON.parse(saved);
      if (!Array.isArray(rows)) throw Error('Invalid saved requests');
      // DG-101 and DG-102 were reserved seed IDs in the previous application.
      const records = rows.filter(row => !row || !['DG-101', 'DG-102'].includes(row.id) && row.provenance !== 'demo' && row.provenance !== 'seed');
      let notice = '';
      if (records.length !== rows.length) {
        try { storage.setItem(key, JSON.stringify(records)); }
        catch { notice = 'Seed requests are hidden for this session; browser storage could not save the migration.'; }
      }
      return { records, notice };
    } catch { return { records: [], notice: 'Saved requests could not be read. The original stored value is preserved; no sample records were loaded.' }; }
  }
  function monthly(data, records) {
    const end = new Date(data.snapshot_date + 'T00:00:00Z');
    return Array.from({ length: 12 }, (_, i) => {
      const key = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7);
      return { key, complaints: records.filter(r => r.raw.complaint_date_raw?.startsWith(key)).length,
        closures: records.filter(r => r.raw.closed_date_raw?.startsWith(key)).length };
    });
  }
  const api = { validate, load, loadLayers, migrateRequests, monthly, municipalities };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ProjectData = api;
})(globalThis);
