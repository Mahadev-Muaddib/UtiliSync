const utilities = {
  water: { label: 'Water', color: '#1964a3', dash: '' },
  power: { label: 'Power', color: '#ad4a27', dash: '8 4' },
  fibre: { label: 'Fibre', color: '#7145a1', dash: '2 4' }
};
// Coordinates are drawing units. Each record describes a fictional road.
const areas = {
  Karunagappally: [
    ['Market Road', '80,100 300,100 540,65', ['water', 'fibre'], 'Surveyed', '2026-11-12'],
    ['Edakulangara', '300,100 330,210 490,285', ['power'], 'Estimated', null],
    ['Lalaji Junction', '75,250 200,210 330,210 560,200', ['water', 'power'], 'Surveyed', null]
  ],
  Kollam: [
    ['Chinnakkada', '70,75 215,110 350,110 535,155', ['water', 'power'], 'Surveyed', '2026-11-08'],
    ['Thevalli', '215,110 190,205 120,285', ['fibre'], 'Estimated', null],
    ['Ashraamam', '65,190 190,205 350,255 550,230', ['power', 'fibre'], 'Surveyed', null]
  ]
};
const initialArea = 'Karunagappally';
const seedRequests = Object.keys(areas).map((area, i) => ({
  id: 'DG-' + (101 + i), area, streets: [areas[area][0][0]], purpose: 'Replace water valve',
  start: '2026-12-01', end: '2026-12-08', status: 'Submitted'
}));
