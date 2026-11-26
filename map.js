function drawMap(svg, roads, visible, selected, selectRoad, summaries) {
  const focusedRoad = svg.contains(document.activeElement)
    ? document.activeElement.getAttribute('aria-label') : null;
  svg.replaceChildren();
  function add(tag, attrs, parent = svg) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent.append(el);
    return el;
  }
  add('path', { d: 'M0 325 Q180 265 275 335 T640 300 L640 360 L0 360Z', class: 'map-water' });
  add('path', { d: 'M30 40H610 M30 155H600 M40 310H590 M140 20V320 M430 20V330', class: 'map-base' });
  for (const street of roads) {
    const { name, points, lines } = street;
    const summary = summaries.get(name);
    const group = add('g', { tabindex: 0, role: 'button', 'aria-label': name,
      'aria-pressed': selected === name, 'data-street': name, 'data-status': summary.status });
    add('title', {}, group).textContent = name + ' · ' + summary.lineCount + ' utility lines · ' + summary.status;
    group.onclick = () => selectRoad(name, 'map');
    group.onkeydown = event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectRoad(name, 'map'); }
    };
    const width = Math.max(21, lines.length * 5 + 10);
    add('polyline', { points, class: 'road-casing' + (selected === name ? ' selected-casing' : ''),
      'stroke-width': width + 7 }, group);
    add('polyline', { points, class: 'road-surface', 'stroke-width': width }, group);
    lines.forEach((line, index) => {
      if (!visible.has(line.type)) return;
      const attrs = { points, transform: 'translate(0 ' + ((index - (lines.length - 1) / 2) * 5) + ')',
        'stroke-dasharray': utilities[line.type].dash };
      if (line.type === 'gas') add('polyline', { ...attrs, class: 'gas-casing', 'stroke-width': 5 }, group);
      add('polyline', { ...attrs, class: 'utility utility-' + line.type, 'data-line': line.id,
        'stroke-width': 3 }, group);
    });
    const [x, y] = points.split(' ')[0].split(',').map(Number);
    add('text', { x, y: y - 29, class: 'road-label' }, group).textContent = name;
    add('text', { x, y: y - 12, class: 'map-status' + (summary.flagged ? ' conflict-text' : '') }, group).textContent = summary.status;
    if (name === focusedRoad) group.focus({ preventScroll: true });
  }
}
