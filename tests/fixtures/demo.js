// All alignments, depths, agencies and work records are fictional demo data.
// A fixed snapshot keeps the December coordination walkthrough repeatable.
const demoDate = '2026-11-26';
const utilities = {
  water: { label: 'Water', dash: '' },
  power: { label: 'Power', dash: '10 5' },
  fibre: { label: 'Telecom', dash: '2 5' }, // Preserve the existing fibre key.
  sewer: { label: 'Sewer', dash: '12 4 2 4' },
  gas: { label: 'Gas', dash: '6 3 6 7' }
};
const agencies = ['Municipal Roads (demo)', 'Water Board (demo)', 'Electricity Board (demo)',
  'Coastal Telecom (demo)', 'Metro Fibre (demo)', 'Sewage Department (demo)', 'Gas Utility (demo)'];
// A line is an individual asset, not a unique utility type. Add/edit lines here.
const areas = {
  Karunagappally: [
    { name: 'Market Road', points: '80,100 300,100 540,65', lines: [
      { id: 'MK-W1', type: 'water', agency: agencies[1], depth: 1.2, confidence: 'Surveyed', lastTouched: '2026-09-18' },
      { id: 'MK-T1', type: 'fibre', agency: agencies[3], depth: 0.6, confidence: 'Surveyed', lastTouched: '2026-04-09' },
      { id: 'MK-T2', type: 'fibre', agency: agencies[4], depth: 0.8, confidence: 'Estimated', lastTouched: '2026-02-16' }
    ], events: [
      { date: '2026-11-12', type: 'resurfacing', agency: agencies[0], purpose: 'Full-width resurfacing after drainage repairs' },
      { date: '2026-09-18', type: 'excavation', agency: agencies[1], purpose: 'Repair water service connection' },
      { date: '2026-04-09', type: 'excavation', agency: agencies[3], purpose: 'Replace telecom duct at the market entrance' },
      { date: '2026-02-16', type: 'excavation', agency: agencies[4], purpose: 'Install a second telecom cable' }
    ] },
    { name: 'Edakulangara', points: '300,100 330,210 490,285', lines: [
      { id: 'ED-P1', type: 'power', agency: agencies[2], depth: 0.9, confidence: 'Estimated', lastTouched: '2026-08-21' },
      { id: 'ED-G1', type: 'gas', agency: agencies[6], depth: 1.5, confidence: 'Estimated', lastTouched: '2025-05-07' }
    ], events: [
      { date: '2026-08-21', type: 'excavation', agency: agencies[2], purpose: 'Repair underground feeder' },
      { date: '2025-05-07', type: 'excavation', agency: agencies[6], purpose: 'Install gas distribution pipe' }
    ] },
    { name: 'Lalaji Junction', points: '75,250 200,210 330,210 560,200', lines: [
      { id: 'LJ-W1', type: 'water', agency: agencies[1], depth: 1.1, confidence: 'Surveyed', lastTouched: '2026-01-12' },
      { id: 'LJ-P1', type: 'power', agency: agencies[2], depth: 0.9, confidence: 'Surveyed', lastTouched: '2025-10-14' },
      { id: 'LJ-S1', type: 'sewer', agency: agencies[5], depth: 1.8, confidence: 'Estimated', lastTouched: '2026-10-05' }
    ], events: [
      { date: '2026-10-05', type: 'excavation', agency: agencies[5], purpose: 'Repair sewer chamber' },
      { date: '2026-01-12', type: 'excavation', agency: agencies[1], purpose: 'Replace water junction valve' },
      { date: '2025-10-14', type: 'excavation', agency: agencies[2], purpose: 'Lay power cable' }
    ] }
  ],
  Kollam: [
    { name: 'Chinnakkada', points: '70,75 215,110 350,110 535,155', lines: [
      { id: 'CH-W1', type: 'water', agency: agencies[1], depth: 1.3, confidence: 'Surveyed', lastTouched: '2026-10-20' },
      { id: 'CH-P1', type: 'power', agency: agencies[2], depth: 0.9, confidence: 'Surveyed', lastTouched: '2026-03-11' }
    ], events: [
      { date: '2026-11-08', type: 'resurfacing', agency: agencies[0], purpose: 'Resurface junction after water-main repairs' },
      { date: '2026-10-20', type: 'excavation', agency: agencies[1], purpose: 'Repair water main' },
      { date: '2026-03-11', type: 'excavation', agency: agencies[2], purpose: 'Replace power feeder joint' }
    ] },
    { name: 'Thevalli', points: '215,110 190,205 120,285', lines: [
      { id: 'TH-T1', type: 'fibre', agency: agencies[3], depth: 0.6, confidence: 'Estimated', lastTouched: '2026-06-17' },
      { id: 'TH-S1', type: 'sewer', agency: agencies[5], depth: 1.9, confidence: 'Estimated', lastTouched: '2025-12-03' }
    ], events: [
      { date: '2026-06-17', type: 'excavation', agency: agencies[3], purpose: 'Extend telecom duct' },
      { date: '2025-12-03', type: 'excavation', agency: agencies[5], purpose: 'Replace sewer connection' }
    ] },
    { name: 'Ashraamam', points: '65,190 190,205 350,255 550,230', lines: [
      { id: 'AS-P1', type: 'power', agency: agencies[2], depth: 1.0, confidence: 'Surveyed', lastTouched: '2026-07-22' },
      { id: 'AS-T1', type: 'fibre', agency: agencies[4], depth: 0.7, confidence: 'Surveyed', lastTouched: '2026-07-22' },
      { id: 'AS-G1', type: 'gas', agency: agencies[6], depth: 1.4, confidence: 'Estimated', lastTouched: '2026-01-28' }
    ], events: [
      { date: '2026-07-22', type: 'excavation', agency: agencies[2], purpose: 'Shared trench for power and telecom renewal' },
      { date: '2026-01-28', type: 'excavation', agency: agencies[6], purpose: 'Install gas service pipe' }
    ] }
  ]
};
const initialArea = 'Karunagappally';
const seedRequests = Object.keys(areas).map((area, i) => ({
  id: 'DG-' + (101 + i), area, streets: [areas[area][0].name], agency: agencies[1],
  purpose: 'Replace water valve', start: '2026-12-01', end: '2026-12-08', status: 'Submitted'
}));
