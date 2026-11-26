# UtiliSync
## Run the workspace
Open index.html in a modern browser. All assets are local. Plain HTML, CSS and JavaScript keep the map editable without installing packages.

Choose Karunagappally or Kollam, inspect a street, then select New dig request. To demonstrate both conflict rules, use the first street and 1–4 December 2026. Switch the demo role to Coordinator to review a submitted request. Reset demo restores the sample requests in both areas.

Conflict warnings also appear on submitted and approved request details. They are advisory: a coordinator can still approve the request. Rejected requests do not block other work, and a request is excluded from its own overlap check.

Saved requests are validated before loading, including IDs, streets, dates and review status. Unreadable saved data falls back to the samples with a visible notice; the original stored value is kept until the next save. If browser storage is blocked or full, the workflow remains available for the current session and displays a notice.

## Check and test

Node.js 20 or newer is needed for development checks. The app itself requires no installation or build step.

```sh
npm run check
npm test
```

The 28 logic tests run without installing dependencies. They cover saved-data validation, unique IDs, calendar dates, inclusive overlaps, the 90-day resurfacing boundary and review exclusions.

For the nine browser workflow tests, install the development dependency and Chromium:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Alternatively, use an installed Microsoft Edge browser from PowerShell:

```powershell
npm.cmd ci
$env:BROWSER_CHANNEL = 'msedge'
npm.cmd run test:browser
```

On Windows, use `npm.cmd` and `npx.cmd` if PowerShell blocks the `.ps1` wrappers. Browser tests use isolated profiles and a temporary local server; they do not modify your normal browser's demo data. They exercise submission, validation, review, persistence, reset, keyboard focus, utility layers, invalid or unavailable storage, literal text rendering, mobile layout and local-file startup.

## Customize
- demo.js contains the initial area, street names, schematic coordinates, utility styles, work history and seed requests. Coordinates use the 640 × 360 drawing space. To add a utility type, define its label, colour and dash pattern and reference its key in a street record.
- requests.js contains request validation, ID generation and conflict rules.
- theme.css controls the palette, spacing and responsive layout.
- index.html contains the workspace and form labels. map.js draws the selectable streets. app.js handles forms, search, reviews and local persistence.

Only the two place names are real. All street alignments, utilities and requests are fictional. Warnings cover the same segment and inclusive overlapping dates, and resurfacing less than 90 days before the proposed start. Browser storage is local to the browser and may vary for local files. Roles simulate a workflow on one device.
