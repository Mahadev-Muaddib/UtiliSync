/* Simulation rules only; never applied to the real source registry. */
(function (root) {
  'use strict';
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function validZone(r) {
    return Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 85 && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180 && Number.isInteger(r.radius) && r.radius >= 10 && r.radius <= 500;
  }
  function validation(r) {
    if (!['karunagappally', 'kollam'].includes(r.area)) return 'Choose a test municipality.';
    if (!validZone(r)) return 'Choose valid coordinates and a whole-number radius from 10 to 500 metres.';
    if (!validDate(r.start) || !validDate(r.end)) return 'Choose valid start and end dates.';
    if (r.end < r.start) return 'End date must be on or after the start date.';
    if (typeof r.agency !== 'string' || !r.agency.trim() || r.agency.length > 100) return 'Enter a test agency (up to 100 characters).';
    if (typeof r.purpose !== 'string' || !r.purpose.trim() || r.purpose.length > 200) return 'Enter a purpose (up to 200 characters).';
    return '';
  }
  function distance(a, b) {
    const rad = degrees => degrees * Math.PI / 180;
    const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function conflicts(draft, requests) {
    if (!validZone(draft) || !validDate(draft.start) || !validDate(draft.end) || draft.end < draft.start || draft.status === 'Rejected') return [];
    return requests.filter(r => r.id !== draft.id && r.status !== 'Rejected' && validZone(r) && validDate(r.start) && validDate(r.end) && r.end >= r.start && draft.start <= r.end && draft.end >= r.start && distance(draft, r) <= draft.radius + r.radius)
      .map(r => ({ id: r.id, agency: r.agency, distance: Math.round(distance(draft, r)), start: draft.start > r.start ? draft.start : r.start, end: draft.end < r.end ? draft.end : r.end }));
  }
  const api = { validation, validZone, conflicts, distance };
  if (typeof module !== 'undefined') module.exports = api; else root.BetaRules = api;
})(globalThis);
