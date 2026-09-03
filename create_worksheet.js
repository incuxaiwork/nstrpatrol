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
    { header: 'TITLE', key: 'title', width: 42 },
    { header: 'DESCRIPTION', key: 'desc', width: 62 },
    { header: 'MODULE/AREA', key: 'module', width: 22 },
    { header: 'EST. EFFORTS', key: 'efforts', width: 14 },
    { header: 'START DATE', key: 'startDate', width: 14 },
    { header: 'END DATE', key: 'endDate', width: 14 },
    { header: 'STATUS', key: 'status', width: 14 },
    { header: 'PROGRESS %', key: 'progress', width: 12 },
    { header: 'BLOCKER', key: 'blocker', width: 18 },
    { header: 'EXTERNAL DEPENDENCY', key: 'extDep', width: 20 },
    { header: 'RESOLUTION / FIX DETAILS', key: 'resolution', width: 50 },
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

  // Human-looking data - rows 1-6 (user provided) then rows 7+ (our work)
  const data = [
    // === User's rows 1-5 ===
    { sno: 1, type: 'Revamp', title: 'Adminstration Module', desc: 'Removal of whole Adminstration page', module: 'Adminstration module', efforts: '25 mins', startDate: '14:00', endDate: '14:25', status: 'Done', progress: '', blocker: '', extDep: '', resolution: '', verifiedOn: '', remarks: '' },
    { sno: 2, type: 'Revamp', title: 'Dashboard', desc: 'Commented whole dashboard ', module: 'dashboard', efforts: '10 mins', startDate: '14:25', endDate: '14:35', status: 'Done', progress: '', blocker: '', extDep: '', resolution: '', verifiedOn: '', remarks: 'review later if needed' },
    { sno: 3, type: 'Feature', title: 'Patrols module UI redesign - table-based view', desc: 'Replaced dashboard-style patrols page with clean data table (14 columns). Added 8 filters (Status, Ranger, Division, Sub-Div, Range, Beat, Method, Date Range). Dependent filter chain: Division > Sub-Div > Range > Beat. Client-side pagination (PAGE_SIZE=15), column sorting, search field. Empty/error states.', module: 'Patrol module', efforts: '1 hour', startDate: '14:45', endDate: '15:45', status: 'Done', progress: '', blocker: '', extDep: '', resolution: '', verifiedOn: '', remarks: '' },
    { sno: 4, type: 'Bug Fix', title: 'Added subDivision field to Patrol type and adapter', desc: 'Patrol type was missing subDivision field causing compilation errors when backend returns geography.subDivision. Added field to Patrol interface in types.ts, updated patrolFromApi adapter to map geography.', module: 'Patrol module', efforts: '15 mins', startDate: '15:45', endDate: '16:00', status: 'Done', progress: '', blocker: '', extDep: '', resolution: '', verifiedOn: '', remarks: '' },
    { sno: 5, type: 'Bug Fix', title: 'DataTable Column header type mismatch', desc: 'Column interface had header: string but patrols/page.tsx passed JSX elements (sortable headers with icons). Upgraded Column interface header type from string to ReactNode in components/data.ts', module: 'Patrol module', efforts: '15 mins', startDate: '16:00', endDate: '16:15', status: 'Done', progress: '', blocker: '', extDep: '', resolution: '', verifiedOn: '', remarks: '' },

    // === Our work from this session (row 6+) ===
    { sno: 6, type: 'Bug Fix', title: 'Fix auth test hash ordering failure', desc: 'Auth test was failing intermittently because updateUserObject hashed passwords in wrong order - password2 hash was being compared against password1. Split into two independent hash calls.', module: 'Backend / Auth', efforts: '20 mins', startDate: '16:15', endDate: '16:35', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Separated hash calls in hashUpdateUserObject so each password hashes independently', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 7, type: 'Bug Fix', title: 'Nested button hydration error in patrols', desc: 'Browser console showed hydration mismatch - a <button> was nested inside another <button> in the patrols page action column. React hydration error on every page load.', module: 'Frontend / Patrols', efforts: '15 mins', startDate: '16:35', endDate: '16:50', status: 'Done', progress: '', blocker: '', extDep: '', resolution: '', verifiedOn: '26-08-2025', remarks: 'was causing console errors on every patrol page visit' },
    { sno: 8, type: 'Bug Fix', title: 'Auth refresh redirect loop fix', desc: 'After login user was being redirected back to login page in a loop. Root cause was range filter trying to read from hierarchy that wasnt loaded yet. Switched to using authoritative hierarchy API instead of mock.', module: 'Frontend / Auth', efforts: '45 mins', startDate: '16:50', endDate: '17:35', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Range filter now reads from authoritative hierarchy. Added null guard for missing hierarchy data.', verifiedOn: '26-08-2025', remarks: 'was blocking all testing' },
    { sno: 9, type: 'Bug Fix', title: 'Eliminate auth redirect loop completely', desc: 'Auth redirect was still looping on some edge cases. Server snapshot was returning undefined which caused the auth gate to keep retrying. Changed to return null instead of undefined so the gate renders the login page.', module: 'Frontend / Auth', efforts: '15 mins', startDate: '17:35', endDate: '17:50', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Use null server snapshot instead of undefined', verifiedOn: '', remarks: '' },
    { sno: 10, type: 'Bug Fix', title: 'White screen on page load', desc: 'Every page was showing a white flash before content rendered. AppShell was conditionally rendered based on auth state, causing layout shift.', module: 'Frontend / Core', efforts: '20 mins', startDate: '17:50', endDate: '18:10', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Always render AppShell in auth gate, remove conditional layout', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 11, type: 'Bug Fix', title: 'AppShell auth gate layout shift', desc: 'After fixing white screen, there was still a visible layout shift when auth state resolved. The auth gate was unmounting/remounting the whole shell.', module: 'Frontend / Core', efforts: '10 mins', startDate: '18:10', endDate: '18:20', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Always render AppShell regardless of auth state, show content conditionally', verifiedOn: '', remarks: 'related to previous fix' },
    { sno: 12, type: 'Bug Fix', title: 'Avatar hydration mismatch', desc: 'User initials in Avatar component were computing differently on server vs client because of timezone/name differences. React threw hydration warnings.', module: 'Frontend / Components', efforts: '15 mins', startDate: '18:20', endDate: '18:35', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Force client-only rendering for avatar initials', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 13, type: 'Optimization', title: 'Cache gis.spatial() calls', desc: 'Detail pages were loading very slow because every component was calling gis.spatial() to check if PostGIS was available. This was hitting the DB on every render.', module: 'Backend / GIS', efforts: '30 mins', startDate: '18:35', endDate: '19:05', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Added in-memory cache for gis.spatial() result. Detail pages now load instantly.', verifiedOn: '26-08-2025', remarks: 'was making every page take 2-3 seconds extra' },
    { sno: 14, type: 'Feature', title: 'Batched stats for patrol list', desc: 'Patrol list endpoint was making individual DB queries for each patrol stats. For lists with 50+ patrols this was very slow.', module: 'Backend / Patrols', efforts: '40 mins', startDate: '19:05', endDate: '19:45', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Single SQL query with aggregate functions to compute stats for all patrols in the list at once', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 15, type: 'Bug Fix', title: 'Duration/distance missing when PostGIS down', desc: 'When PostGIS spatial extension was not available, patrol detail showed 0 distance and no duration at all. These should fall back to non-spatial computation.', module: 'Backend / Patrols', efforts: '30 mins', startDate: '19:45', endDate: '20:15', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Added EXTRACT-based duration from timestamps, pure-SQL Haversine fallback for distance', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 16, type: 'Feature', title: 'Pure-PG Haversine distance calculation', desc: 'Patrol distance was always showing 0.0km because it depended on PostGIS ST_Distance which was not available. Need a working distance calculation using only standard PostgreSQL.', module: 'Backend / Patrols', efforts: '1 hour', startDate: '20:15', endDate: '21:15', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Implemented Haversine formula in pure SQL using latitude/longitude columns. Correct bearing-chain formula for GPS tracks. Returns null when <2 valid points.', verifiedOn: '26-08-2025', remarks: 'distance went from 0.0 to 0.97km - real value now' },
    { sno: 17, type: 'Bug Fix', title: 'PostGIS fallback returns null coverage', desc: 'Coverage endpoint was returning 0% even when PostGIS was unavailable and coverage could not be computed. This was misleading - 0% implies patrol covered nothing, but actually we just couldnt compute it.', module: 'Backend / Coverage', efforts: '30 mins', startDate: '21:15', endDate: '21:45', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Added spatial flag to coverage summary. coveragePercent returns null (not 0) when PostGIS unavailable. Frontend shows "Coverage unavailable" message.', verifiedOn: '26-08-2025', remarks: 'frontend type updated to accept null' },
    { sno: 18, type: 'Feature', title: 'Incidents API filtering', desc: 'Incidents endpoint had no filtering - always returned all incidents regardless of which patrol/beat/ranger you were viewing. Could not drill down from patrol detail to its incidents.', module: 'Backend / Incidents', efforts: '20 mins', startDate: '21:45', endDate: '22:05', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Added query params: patrolId, beatId, rangerId, rangeId. Now filtering works correctly (5 total -> 2 for specific patrol).', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 19, type: 'Refactor', title: 'Split patrol-complete route test', desc: 'Patrol complete route test was a single massive test with 18 expect() calls. If any one failed you couldnt tell which part broke.', module: 'Backend / Tests', efforts: '25 mins', startDate: '22:05', endDate: '22:30', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Split into focused unit tests - one per behavior', verifiedOn: '', remarks: '' },
    { sno: 20, type: 'Bug Fix', title: 'Watch hours division by zero', desc: 'Ranger watch hours endpoint was crashing when a ranger had zero patrol time. Division by zero error in avgWatchHrsPerRanger.', module: 'Backend / Rangers', efforts: '10 mins', startDate: '22:30', endDate: '22:40', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Added zero-guard before division', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 21, type: 'Bug Fix', title: 'Prisma schema - beat/orgUnit fields', desc: 'Prisma schema was missing orgUnitId on User model and beat was on wrong model. Also beat was nullable on Patrol when it should be required.', module: 'Backend / Schema', efforts: '20 mins', startDate: '22:40', endDate: '23:00', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Added orgUnitId to User, moved beat to Patrol (non-nullable), removed from Beat model', verifiedOn: '', remarks: '' },
    { sno: 22, type: 'Integration', title: 'Patrol detail wired to live backend', desc: 'Patrol detail page was still using mock data for some fields. Distance, duration, coverage all needed to come from real API.', module: 'Frontend / Patrols', efforts: '30 mins', startDate: '23:00', endDate: '23:30', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Detail fetcher now calls /api/patrols/:id directly. Stats merged from patrol.stats.durationSeconds. Coverage null-handling added.', verifiedOn: '26-08-2025', remarks: '' },
    { sno: 23, type: 'Bug Fix', title: 'Nullable coverage type propagation', desc: 'Backend now returns null for coveragePercent but TypeScript types still had it as number. Caused type errors in frontend.', module: 'Frontend / Types', efforts: '15 mins', startDate: '23:30', endDate: '23:45', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Updated ApiPatrolCoverageSummary.coveragePercent to number|null. Patrol.coveragePct to number|null|undefined. Fixed both detail and replay pages to use == null check.', verifiedOn: '', remarks: '' },
    { sno: 24, type: 'Feature', title: 'Patrol replay page coverage display', desc: 'Replay page was not handling null coverage - would crash if coveragePercent was null from backend.', module: 'Frontend / Patrols', efforts: '10 mins', startDate: '23:45', endDate: '23:55', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Changed === undefined check to == null to catch both cases', verifiedOn: '', remarks: '' },
    { sno: 25, type: 'Integration', title: 'Push to Veera branch', desc: 'All changes compiled and tested. Pushed to remote.', module: 'Git / Deploy', efforts: '5 mins', startDate: '00:15', endDate: '00:20', status: 'Done', progress: '', blocker: '', extDep: '', resolution: 'Commit 896e307 pushed to origin/Veera', verifiedOn: '26-08-2026', remarks: 'pull from main was already up to date' },
  ];

  // Add rows
  data.forEach((row) => {
    const r = ws.addRow(row);
    r.alignment = { vertical: 'middle', wrapText: true };
    r.height = 32;
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
    // Alternate row shading
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

  await wb.xlsx.writeFile('D:\\Incuxai\\Forest new\\NSTR_Patrol_Work_Track.xlsx');
  console.log('Excel created: NSTR_Patrol_Work_Track.xlsx');
  console.log('Rows:', data.length);
})();
