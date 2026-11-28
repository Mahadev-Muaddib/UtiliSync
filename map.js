/* Geographic point plot. No synthetic road or utility geometry. */
function drawMap(svg, records, selected, onSelect, layers) {
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  function node(tag, attrs, text, parent = svg) {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text != null) el.textContent = text;
    parent.append(el); return el;
  }
  const points = records.filter(r => r.coordinates && r.collection === 'maintenance_incidents');
  if (!points.length) { node('text', { x: 40, y: 220 }, 'No source maintenance coordinates match these filters.'); return; }
  const lons = points.map(r => r.coordinates[0]), lats = points.map(r => r.coordinates[1]);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons), latMin = Math.min(...lats), latMax = Math.max(...lats);
  const midLon = (lonMin + lonMax) / 2, midLat = (latMin + latMax) / 2;
  const cos = Math.cos(midLat * Math.PI / 180);
  const scale = Math.min(650 / Math.max((lonMax - lonMin) * cos, .008), 350 / Math.max(latMax - latMin, .008));
  const project = ([lon, lat]) => [400 + (lon - midLon) * cos * scale, 225 - (lat - midLat) * scale];
  const defs = node('defs', {}); const clip = node('clipPath', { id: 'map-clip' }, null, defs);
  node('rect', { x: 55, y: 30, width: 700, height: 375 }, null, clip);
  const base = node('g', { 'clip-path': 'url(#map-clip)' });
  function path(coords, close = false) {
    if (!Array.isArray(coords) || !coords.length || !coords.every(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))) return '';
    return coords.map((c, i) => (i ? 'L' : 'M') + project(c).join(',')).join(' ') + (close ? 'Z' : '');
  }
  function geometry(g, kind) {
    if (!g) return;
    let d = '';
    if (g.type === 'LineString') d = path(g.coordinates);
    if (g.type === 'MultiLineString') d = g.coordinates.map(c => path(c)).join(' ');
    if (g.type === 'Polygon') d = g.coordinates.map(c => path(c, true)).join(' ');
    if (g.type === 'MultiPolygon') d = g.coordinates.flatMap(p => p.map(c => path(c, true))).join(' ');
    if (g.type === 'GeometryCollection') g.geometries.forEach(c => geometry(c, kind));
    if (d) node('path', { d, class: 'geo-layer geo-' + kind, 'fill-rule': 'evenodd' }, null, base);
  }
  for (const layer of layers.filter(l => l.available && l.visible !== false && l.kind !== 'source_maintenance_closure_points')) for (const f of layer.geojson.features) geometry(f.geometry, layer.kind);
  for (let i = 0; i < 5; i++) {
    const x = 75 + i * 162.5, y = 50 + i * 87.5;
    node('line', { x1: x, x2: x, y1: 30, y2: 405, class: 'coordinate-grid' });
    node('line', { x1: 55, x2: 755, y1: y, y2: y, class: 'coordinate-grid' });
    node('text', { x, y: 435, 'text-anchor': 'middle', class: 'axis-label' }, (midLon + (x - 400) / (cos * scale)).toFixed(3) + '°E');
    node('text', { x: 7, y: y + 4, class: 'axis-label' }, (midLat - (y - 225) / scale).toFixed(3) + '°N');
  }
  node('text', { x: 765, y: 28, class: 'axis-label' }, 'N ↑');
  // Paint selection last so coincident points cannot obscure it; all remain accessible in the registry.
  for (const r of [...points].sort((a, b) => Number(a.id === selected) - Number(b.id === selected))) {
    const [cx, cy] = project(r.coordinates);
    const mark = node('circle', { cx, cy, r: r.id === selected ? 7 : 4.5, class: 'incident-point' + (r.raw.boundary_check === 'outside_osm_boundary_review' ? ' boundary-exception' : '') + (r.id === selected ? ' selected-point' : ''), role: 'button', tabindex: 0, 'aria-label': r.title + ' · ' + r.id, 'aria-pressed': r.id === selected, 'data-record-id': r.id });
    node('title', {}, r.title + ' · ' + r.id + ' · ' + r.raw.boundary_check, mark);
    mark.onclick = () => onSelect(r.id);
    mark.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(r.id); } };
    if (r.id === selected) node('text', { x: Math.min(cx + 12, 550), y: Math.max(cy - 13, 23), class: 'point-label' }, r.title.length > 38 ? r.title.slice(0, 35) + '…' : r.title);
  }
}
