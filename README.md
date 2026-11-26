# UtiliSync

Open `index.html` in a modern browser. The workspace uses local HTML, CSS and JavaScript, with no installation or build step. Both Karunagappally and Kollam are available from the area selector.

## Demonstrate coordination

1. Select **Market Road** in the registry or map. Its record shows three individual utility lines, their demo owners and depths, completed work, and planned requests. The two telecom cables count separately.
2. Read the **12 November 2026** resurfacing event and **Water Board (demo)** request **DG-101**, scheduled for **1–8 December 2026**.
3. Select **New dig request** in Planned work. Market Road is checked; additional streets can be added. Choose **Coastal Telecom (demo)**, enter a purpose and **1–4 December 2026**.
4. The warnings identify the resurfacing date and the other agency, shared street, request ID and actual overlapping dates. Select **Inspect DG-101**, then **Return to draft**. Every field remains intact.
5. Submit, switch the demo role to **Coordinator**, and select **View DG-103** in Planned work. Approve it or reject it with a reason. The map, registry and street record update together. Approval retains advisory warnings and never creates a completed excavation event.
6. On a phone, switch to **Kollam** and select a street. The record opens in a scrollable sheet. Close it or press Escape to return focus to the registry row or map segment that opened it.

Street selection preserves area, search and layer settings. Registry search also matches agency names and request IDs/purposes, returning the streets affected by those records. Five labeled, patterned utility layers can be toggled independently. Pink is an outer selection casing, so the individual utility lines remain visible.

## Data and rules

Only the two area names identify real places. All street alignments, underground layouts, depths, demo agencies, requests and work events are simulated. The visible snapshot is fixed at **26 November 2026** so the demonstration remains repeatable. The 12-month strip covers December 2025 through November 2026 and is derived from recorded events up to that snapshot. Older work remains in the event list. Future requests are always separate from completed events.

Warnings use the original rules: inclusive overlapping dates on a shared street, and resurfacing from 0 through 89 days before the proposed start. Rejected requests do not block other work; a request is excluded from its own overlap check. Other recent excavation is shown in amber in history but does not trigger the reference prototype's broader recent-work warning. A coordinator can approve a request despite advisory warnings. Conflict flags represent overlaps and remain until the overlapping work is rejected or rescheduled; approval alone does not resolve them.

Requests persist under `utilisync.requests.v1` in this browser. Older saved requests without an agency display **Agency unrecorded**. Saved data is validated before loading, including IDs, streets, agencies, dates and review status. Unreadable data falls back to samples with a visible notice; the original stored value is kept until the next save. Unavailable or full storage leaves the session usable and displays a notice. Roles simulate a workflow on one device. Reset demo replaces requests in both areas with the samples.

## Check and test

Node.js 20 or newer is needed only for development checks:

```sh
npm run check
npm test
```

The 33 logic tests need no installed dependencies. They cover saved-data validation, legacy agencies, exact shared-street overlap information, unique IDs, dates, the 90-day boundary, linked summaries, individual line counts and completed-event activity buckets.

Install Playwright and Chromium for the 11 browser workflow checks:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Or use installed Microsoft Edge from PowerShell:

```powershell
$env:BROWSER_CHANNEL = 'msedge'
npm.cmd run test:browser
```

Use `npm.cmd` and `npx.cmd` if PowerShell blocks `.ps1` wrappers. Tests use isolated profiles and a temporary local server; they do not change normal browser data. They cover the acceptance flow, preserved drafts, agency validation and migration, review and persistence, linked keyboard selection, all utility layers, unavailable storage, literal text rendering, phone sheets and local-file startup. Visual QA screenshots are saved under ignored `test-results/`.

## Customize

- `demo.js`: snapshot date, agency names, geometry, individual utility lines, completed work events and seed requests. A street has `name`, `points`, `lines` and `events`. Each line has a unique `id`, `type`, `agency`, `depth` in metres, `confidence` and `lastTouched`. Each event has a `date`, `type` (`excavation` or `resurfacing`), `agency` and `purpose`. Keep future plans in requests, not completed events.
- Utility keys are `water`, `power`, `fibre`, `sewer` and `gas`. The existing `fibre` key is preserved and presented as **Telecom**. Edit line types in `demo.js`; each line is drawn independently. Dash patterns live with the utility definitions; colors live in `theme.css`.
- `requests.js`: saved-data validation, ID generation, structured coordination warnings and shared street summaries/activity. The `conflicts()` text API remains available.
- `theme.css`: survey palette, spacing, focus treatments, line colors and responsive layout.
- `index.html`: workspace and form structure. `map.js`: selectable schematic segments. `app.js`: linked selection, street records, forms, review dialogs and local persistence.

The desktop reference project is consulted for registry and history structure only and remains unchanged.
