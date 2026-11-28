# UtiliSync

UtiliSync displays the local `project_data.json` snapshot for Karunagappally and Kollam. Run `npm start` (or `npm.cmd start` in PowerShell) and open http://127.0.0.1:4173. Node.js 20+ is required. No build or external map service is required. The server resolves files from its own project root, independent of the working directory. Direct `file://` startup cannot fetch JSON in modern browsers and displays instructions to use the server.

## Source workspace

The registry, municipality/type/status/search filters, point map, detail cards, monthly maintenance chart, project progress, dependencies and featured cases use the root JSON file. Counts come from the loaded arrays. The supplied 27 November 2026 snapshot has 599 maintenance incidents (353 Karunagappally, 246 Kollam), 5 project snapshots, 15 official observations and 8 dependencies.

Click a registry record or maintenance point to inspect original source fields, URLs, source dates, quality notes and unknown values. Featured evidence opens `kwa-1572397` (Manoothara junction) and `KL-KOLLAM-6545` (recorded government cancellation), among other cases. Summary cards and charts follow the municipality; the registry and map also follow text, record type and status filters. Candidate cross-source links retain confidence and budget handling; records are never merged and amounts are never summed.

The map fits actual maintenance coordinates with north up and longitude/latitude axes. 595 records have source coordinates; four remain unmapped. Boundary exceptions are amber. Points can overlap; the registry retains every record. There are no invented road lines, underground networks or project alignments. Complaint and closure dates are not excavation/restoration dates. The 12-month chart counts source complaint/closure dates independently, so one record can appear in different months.

Optional GeoJSON files are resolved at the exact paths in `layers`. Put those files under the project root to enable boundary, roads and waterways layers with supplied attribution and licence. The maintenance point layer joins by `incident_no`, retaining GeoJSON longitude/latitude order. All seven optional files are absent from this checkout; the app explains each unavailable layer and uses the supplied JSON coordinates. Missing or invalid root JSON displays a loading error without samples; a valid empty dataset displays empty states.

## Browser data migration

The app removes only reserved seed IDs `DG-101` and `DG-102`, or rows explicitly marked with `provenance: demo` or `seed`, from `utilisync.requests.v1`. Other rows are preserved unchanged, shown in Preserved local requests, and excluded from source counts and the map. Rerunning is idempotent. Other storage keys/settings are untouched. Invalid storage remains unchanged with a notice. If storage cannot be written, samples remain hidden for that session and the limitation is shown. New street-based scheduling is unavailable because this dataset supplies no verified street network.

## Development and verification

- `npm run check`: JavaScript syntax checks. No build or type-check configuration exists.
- `npm test`: loader, counts, unknowns, migration, optional layers and legacy request logic. Historical demo fixtures and request rules are isolated in `tests/fixtures` and are never served by the app.
- `npm run test:browser`: Playwright checks the normal entry point, both municipalities, details, filters, source failures, optional layers, storage migration and mobile layout. Use `BROWSER_CHANNEL=msedge` for installed Edge if Chromium is unavailable. Tests intercept responses in isolated browser contexts; the source JSON is never modified. Screenshots are saved under ignored `test-results/`.

`data.js` owns validation/adaptation and storage migration; `app.js` renders source evidence; `map.js` draws geographical points/optional geometry; `server.cjs` serves only application assets and optional GeoJSON. Update `project_data.json` to replace the snapshot without embedding or duplicating it in JavaScript.
