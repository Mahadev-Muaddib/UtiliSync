# UtiliSync real data migration

Replace the mock records used by the UtiliSync app with the real records in `<UtiliSync root>/project_data.json`. In that project, the root is the directory containing the app's configuration or entry point. Resolve the file relative to that root so the app works from other machines and working directories.

## Replace the active data source

1. Inspect the app's current loader, seed scripts, fixtures, persisted demo state, and UI components for mock data. Trace the data used by the dashboard, map, filters, detail views, and derived counts.
2. Read and validate `project_data.json` at the app's data-loading boundary. Use its actual field names. Map records into existing app types in one place, with explicit handling for missing fields. Keep test fixtures isolated from runtime code.
3. Switch each affected runtime view to the real dataset. Replace existing seeded mock rows, including any mock rows persisted by earlier app versions. Identify demo rows by known seed IDs or provenance. Preserve user-created records and settings, and avoid broad storage resets. Make the migration safe to rerun without duplicating records.
4. Remove runtime mock imports, seed paths, and fallback data for the migrated views. If the real file is missing or invalid, show a clear loading error. For a valid empty result, show an empty state. Avoid blending mock and real rows in any list, count, or map. Apply the same rule to features with no real data coverage.

## Map the source fields

| JSON field | Use |
| --- | --- |
| `maintenance_incidents` | Maintenance lists and incident cards. Use `record_id` as the stable key and `municipality_key` for filtering. |
| `water_projects` | Water project tracker records. Preserve the reported status, observation date, and data quality notes. |
| `official_work_observations` | Dated work, tender and government decision records. Keep amount types and status dates visible. |
| `coordination_dependencies` | Documented project relationships. Resolve endpoints by `record_id`. |
| `project_crosswalk` | Candidate links across sources. Preserve the source's confidence and avoid automatically merging records or summing related budgets. |
| `featured_cases` | Curated entry points into existing records. Resolve `source_record_id` against the loaded data. |
| `layers` | Optional map files. Resolve each `path` from the project root and use the supplied attribution. Show an unavailable layer state if a referenced file is missing. |

Preserve source IDs, URLs, snapshot dates, and quality flags. Keep null values unknown. A complaint or closure date describes the maintenance record. Use verified excavation and restoration dates only when those fields are populated. Map coordinates describe source-reported maintenance points. Keep boundary exceptions flagged and avoid inferring pipe routes or road joins. When joining the maintenance point layer, match on `incident_no` and preserve GeoJSON coordinate order, longitude then latitude.

## Verify before finishing

- Run the project's available build, type checks, and relevant tests. Open the app through its normal entry point and check the migrated lists, map, detail views and filters for both municipalities.
- Reconcile unfiltered counts against the input arrays. The supplied 27 November 2026 snapshot has **599 maintenance records** (353 Karunagappally and 246 Kollam), **5 water project snapshots**, **15 official work observations**, and **8 dependencies**. Use the loaded arrays to derive counts so future snapshots can differ.
- Open maintenance record `kwa-1572397` and confirm it shows the Manoothara junction incident. Check that `KL-KOLLAM-6545` displays the recorded cancellation.
- Check a fresh launch and a launch with old demo state. Confirm the visible records and counts contain zero mock rows. Verify that running the migration twice introduces no duplicates and preserves user-created data.
- Exercise a missing or invalid JSON file and a missing optional map layer in a disposable test copy. Confirm the app explains the failure without loading mock data. Restore the real file before delivery.
- Report the changes, checks run, and any unavailable source fields or map layers.

If the root data file is absent in the target project, the source copy in the YIP workspace is `data/utilisync/project_data.json`. Use that exact file to stage the root copy. The optional GeoJSON assets are separate files and should retain the relative paths listed in `layers`.
