const ExcelJS = require('exceljs');

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Work Track', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  // Column headers
  ws.columns = [
    { header: 'SNO', key: 'sno', width: 6 },
    { header: 'TYPE', key: 'type', width: 14 },
    { header: 'TITLE', key: 'title', width: 44 },
    { header: 'DESCRIPTION', key: 'desc', width: 66 },
    { header: 'MODULE/AREA', key: 'module', width: 22 },
    { header: 'EST. EFFORTS', key: 'efforts', width: 14 },
    { header: 'START DATE', key: 'startDate', width: 14 },
    { header: 'END DATE', key: 'endDate', width: 14 },
    { header: 'STATUS', key: 'status', width: 14 },
    { header: 'PROGRESS %', key: 'progress', width: 12 },
    { header: 'BLOCKER', key: 'blocker', width: 18 },
    { header: 'EXTERNAL DEPENDENCY', key: 'extDep', width: 20 },
    { header: 'RESOLUTION / FIX DETAILS', key: 'resolution', width: 52 },
    { header: 'VERIFIED ON', key: 'verifiedOn', width: 14 },
    { header: 'REMARKS', key: 'remarks', width: 30 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 10 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
  headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;

  const data = [
    // === 29 Aug (Sat) ===
    { sno: 1, type: 'Feature', title: 'Non-PostGIS beats fallback from bundled assets', desc: 'Added a non-PostGIS fallback for the GIS beats layer so real beat geometry is still served when the PostGIS extension is unavailable. The backend reads the bundled mobile asset (mark_beat.json) and joins each beat to its DB record, keeping the authoritative polygon geometry instead of returning empty.', module: 'Backend / GIS', efforts: '1 hour', startDate: '08:15', endDate: '09:15', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'fallbackBeats() in routes/gis.ts loads the bundled mark_beat.json asset and serves it with DB joins when spatial SQL fails.', verifiedOn: '29-08-2026', remarks: '' },
    { sno: 2, type: 'Feature', title: 'Non-PostGIS compartments fallback + coverage tests', desc: 'Mirrored the beats fallback for compartments: served the authoritative compartment geometry from the bundled mark_comp.json asset with DB joins and orphan/empty-beat handling when PostGIS is down. Updated the coverage beat test expectations to match the fallback behavior.', module: 'Backend / GIS', efforts: '1 hour', startDate: '09:15', endDate: '10:15', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'fallbackCompartments() in routes/gis.ts + coverage-beats.test.ts updates. Both fallback serializers share one asset dir authority.', verifiedOn: '29-08-2026', remarks: '' },
    { sno: 3, type: 'Bug Fix', title: 'Telemetry GPS point ingest createMany fix', desc: 'GPS point ingest in telemetry/sync failed against the merged main branch because createManyAndReturn made Prisma emit SQL against a phantom "new" column in PatrolPoint. Switched the ingest to createMany (no RETURNING) while keeping the idempotent GPS dedupe that filters first and then inserts.', module: 'Backend / Telemetry / Sync', efforts: '40 mins', startDate: '10:15', endDate: '10:55', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Replace createManyAndReturn with createMany in telemetry.ts + sync.ts; retain GPS dedupe; updated patrols-live.test.ts mock (commit 1377c90).', verifiedOn: '29-08-2026', remarks: 'reconciled the main-into-Veera merge' },

    // === 30 Aug (Sun) ===
    { sno: 4, type: 'Feature', title: 'Blocks layer (Facing logic) & /api/gis/blocks dissolve', desc: 'Added a Blocks layer to the GIS module. A block is a set of compartments facing each other under a Region notification. Created a block-registry that canonicalizes the messy raw BLOCK attribute on every compartment (Eastern-Nagaram series variants collapse to one block; native names are normalized, never wrongly merged) and a dissolve endpoint that groups compartments into canonical block polygons (ST_Union on PostGIS, same grouping without it). Included a data-driven gis-contract audit test.', module: 'Backend / GIS', efforts: '2 hours', startDate: '21:30', endDate: '23:30', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'New backend/src/gis/block-registry.ts + /api/gis/blocks dissolve + gis-contract.test.ts audit table. See commit 692f6ec.', verifiedOn: '30-08-2026', remarks: '' },
    { sno: 5, type: 'Feature', title: 'Safe GIS geometry restoration script', desc: 'Built a safety-first restore-gis-geometry script that re-creates PostGIS-backed spatial layers dropped by a DROP EXTENSION postgis CASCADE. It never deletes rows, preserves FK ids, resolves ambiguous beat matches to the record that owns compartments/users, gates boundary/grid derivation behind a flag, and supports --dry-run / --validate-only.', module: 'Backend / GIS / Scripts', efforts: '1 hour 30 mins', startDate: '23:30', endDate: '01:00', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'New backend/scripts/restore-gis-geometry.ts + associated Prisma migrations (ensure_postgis, compartment_block).', verifiedOn: '30-08-2026', remarks: '' },
    { sno: 6, type: 'Feature', title: 'Asset-fallback compartments with holes + orphan join + atlas default basemap', desc: 'Extended the compartment fallback so multi-ring compartment geometry with interior holes renders correctly, orphan compartments without an unambiguous beat join are dropped (never mis-filed), and the web GIS map defaults to the offline Atlas (MBTiles) basemap instead of requiring an external satellite host.', module: 'Backend / GIS + Web / GIS', efforts: '2 hours', startDate: '21:30', endDate: '23:30', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Hole/ring handling + orphan join in routes/gis.ts & web map-space; DEFAULT_LAYER_STATE.basemap set to "atlas". Commit 692f6ec.', verifiedOn: '30-08-2026', remarks: '' },

    // === 31 Aug (Mon) ===
    { sno: 7, type: 'Revamp', title: 'Remove Block hierarchy - compartments map directly to Beats', desc: 'Re-aligned the GIS hierarchy to the authoritative model Forest > Range > Beat > Compartment by removing the Blocks layer added the previous day. Compartments now associate directly with their Beat (never a Block). Dropped the Blocks and legacy Reference ForestGrid layers from the map, layer state, adapters and services.', module: 'Web / GIS Hierarchy', efforts: '2 hours', startDate: '16:45', endDate: '18:45', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Removed blocks/grids keys from ForestLayerState, /api/gis/blocks wiring, block-registry imports and Blocks map layer. See commit 68851fc.', verifiedOn: '31-08-2026', remarks: 'keeps Beat > Compartment as required' },
    { sno: 8, type: 'Bug Fix', title: 'Unique compartment ids across map, filter, hover and detail', desc: 'Compartment identity previously collided because ids were derived from (Beat, COMP_NO), and many compartments legitimately share COMP_NO "0" within a beat (dozens of ENCLOSURE polygons) - causing duplicate React keys and grouped selection. Switched the single compartment identity to the authoritative backend feature id everywhere.', module: 'Web / GIS Map', efforts: '1 hour', startDate: '18:45', endDate: '19:45', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Use the backend UUID feature id (strip -pN sibling suffix for MultiPolygon parts) in backend-adapters hierarchy and tagCompartments so map compId, filter value, hover and selectedDetail all align and stay unique.', verifiedOn: '31-08-2026', remarks: 'resolves the duplicate-key console error' },
    { sno: 9, type: 'Validation', title: 'GIS projection verification script update + clean build', desc: 'Updated the verify-gis-projection script to match the hierarchy clean-up (removed stale blocks/forest-grid checks, pinned the mark_beat.json dissolve expectation) and ran TypeScript, ESLint and the production build to confirm the layer/hierarchy rework compiles cleanly.', module: 'Validation / GIS', efforts: '40 mins', startDate: '19:45', endDate: '20:25', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'web/scripts/verify-gis-projection.mjs updated; tsc --noEmit clean, eslint clean (0 errors), npm run build success.', verifiedOn: '31-08-2026', remarks: 'pushed to Veera branch (68851fc)' },
  ];

  // Add rows
  data.forEach((row) => {
    const r = ws.addRow(row);
    r.alignment = { vertical: 'middle', wrapText: true };
    r.height = 34;
  });

  // Style: alternate row colors + borders
  const borderStyle = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  const border = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };

  for (let i = 2; i <= data.length + 1; i++) {
    const row = ws.getRow(i);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = border;
      cell.font = { size: 10 };
    });
    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    }
  }

  // Status column color coding
  for (let i = 2; i <= data.length + 1; i++) {
    const cell = ws.getRow(i).getCell('status');
    if (cell.value === 'Done') {
      cell.font = { color: { argb: 'FF2E7D32' }, bold: true, size: 10 };
    } else if (cell.value === 'In Progress') {
      cell.font = { color: { argb: 'FFED6C02' }, bold: true, size: 10 };
    } else if (cell.value === 'Blocked') {
      cell.font = { color: { argb: 'FFD32F2F' }, bold: true, size: 10 };
    }
  }

  // Auto-filter
  ws.autoFilter = {
    from: 'A1',
    to: 'O1'
  };

  const out = 'D:\\Incuxai\\Forest new\\NSTR_Patrol_Work_Track_28-31August.xlsx';
  await wb.xlsx.writeFile(out);
  console.log('Excel created: NSTR_Patrol_Work_Track_28-31August.xlsx');
  console.log('Rows:', data.length);
})();
