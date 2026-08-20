import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Canonical organizational seed for the fixed PT Markapur Division deployment.
 *
 * - Ranges: upserted by canonical DB name (abbreviations preserved: G.V.PALLI,
 *   Y.PALEM, V.P.SOUTH). Range names must match `Beat.rangeName` (the free-text
 *   linkage used by scope resolution).
 * - Beats: canonicalized in place by {rangeName, currentName} → canonicalName.
 *   Only the `name` column changes; id, geometry, section, rangeName, division
 *   are untouched. No beats are created or deleted here.
 * - Postings: organizational cadre positions (FRO_MARKAPUR, FBO_KALANUTHALA,
 *   …) kept as structured metadata ONLY — never materialized as User records.
 *   A User record is required for authentication/RBAC when a real officer is
 *   onboarded; that step is outside this seed.
 *
 * Idempotent, deterministic, non-destructive — safe to re-run.
 */

export const DIVISION_PT_MARKAPUR = 'PT_MARKAPUR';
export const SUB_DIVISION_DORNALA = 'DORNALA';

export const DORNALA_RANGES = ['DORNAL', 'G.V.PALLI', 'KORRAPROLU', 'NEKKANTI'];
export const DIRECT_RANGES = ['MARKAPUR', 'Y.PALEM', 'V.P.SOUTH'];

/** Approved beat canonicalizations (Phase 2). apply only if the source row
 *  exists and the target name is not already taken inside the same range. */
export const BEAT_CANONICALIZATIONS: { range: string; from: string; to: string }[] = [
  // MARKAPUR
  { range: 'MARKAPUR', from: 'GOTTIPADIA', to: 'GOTTIPADIYA' },
  { range: 'MARKAPUR', from: 'DONKAONDA', to: 'DONAKONDA' },
  // V.P.SOUTH
  { range: 'V.P.SOUTH', from: 'GANGALGUNTA', to: 'GANGALAKUNTA' },
  { range: 'V.P.SOUTH', from: 'GOTTIPALLI', to: 'GOTTIPALLA' },
  { range: 'V.P.SOUTH', from: 'KANDLGUNTA', to: 'KANDLAKUNTA' },
  { range: 'V.P.SOUTH', from: 'ZUVUKU', to: 'ZAVUKU' },
  { range: 'V.P.SOUTH', from: 'TUMMURUKOTA', to: 'TUMURUKOTA' },
  { range: 'V.P.SOUTH', from: 'NAGULAVARAM', to: 'NAGULAVARAM_VPSOUTH' },
  // DORNAL
  { range: 'DORNAL', from: 'P. BOMMALAPURAM', to: 'P.BOMMALAPURAM' },
  { range: 'DORNAL', from: 'CHINTALA', to: 'CHINTHALA' },
  { range: 'DORNAL', from: 'TUMMALABAILU', to: 'THUMMALABAILU' },
  // G.V.PALLI
  { range: 'G.V.PALLI', from: 'G.V.PALLI', to: 'GANJIVARIPALLI' },
  { range: 'G.V.PALLI', from: 'REGUMANIPENTA', to: 'REGUMANUPENTA' },
  // KORRAPROLU
  { range: 'KORRAPROLU', from: 'CH.MANTANALA', to: 'CH.MANTHANALA' },
  { range: 'KORRAPROLU', from: 'PEDDACHAMA', to: 'PEDDA CHAMA' },
  { range: 'KORRAPROLU', from: 'PEDDAMANTANALA', to: 'P.MANTHANALA' },
  { range: 'KORRAPROLU', from: 'Y.CHERLOPALLI', to: 'Y.C.PALLI' },
];

/** Held: possible source spelling mismatch with YADAVALLI; awaiting confirmation. */
export const EDAVALLI_HOLD = 'EDAVALLI';

/** Held: checkposts with pending geographic classification (not Beats; no
 *  geometry exists; must not be created as Beats until classified by the
 *  forest organizational authority). */
export const PENDING_GEOGRAPHIC_CLASSIFICATION: { range: string; label: string }[] = [
  { range: 'DORNAL', label: 'GANAPATHI_CHECKPOST' },
  { range: 'KORRAPROLU', label: 'KORRAPROLU_CHECKPOST' },
];

type Posting = {
  cadre: 'FRO' | 'DyRO' | 'FSO' | 'FBO' | 'ABO';
  id: string;
  range: string;
  /** Canonical Beat.name when the posting is a fixed geographic assignment. */
  beat?: string;
  /** Operational responsibility — never a geographic Beat. */
  specialDuty?: string;
};

/** Organizational postings (source identifiers). Metadata only — no User
 *  records are created from these. Beats use canonical names. */
export const POSTINGS: Posting[] = [
  // MARKAPUR range
  { cadre: 'FRO', id: 'FRO_MARKAPUR', range: 'MARKAPUR' },
  { cadre: 'DyRO', id: 'DyRO_MARKAPUR', range: 'MARKAPUR' },
  { cadre: 'DyRO', id: 'DyRO_NAGUAVARAM', range: 'MARKAPUR' },
  { cadre: 'FSO', id: 'FSO_ANTI-POACHING_MRK', range: 'MARKAPUR', specialDuty: 'ANTI-POACHING' },
  { cadre: 'FBO', id: 'FBO_KALANUTHALA', range: 'MARKAPUR', beat: 'KALANUTHALA' },
  { cadre: 'FBO', id: 'FBO_GUNDAMCHERLA', range: 'MARKAPUR', beat: 'GUNDAMCHERLA' },
  { cadre: 'FBO', id: 'FBO_GOTTIPADIYA', range: 'MARKAPUR', beat: 'GOTTIPADIYA' },
  { cadre: 'FBO', id: 'FBO_NAGULAVARAM_MRK', range: 'MARKAPUR', beat: 'NAGULAVARAM' },
  { cadre: 'FBO', id: 'FBO_DONAKONDA', range: 'MARKAPUR', beat: 'DONAKONDA' },
  { cadre: 'FBO', id: 'FBO_MAGUTUR', range: 'MARKAPUR', beat: 'MAGUTUR' },
  { cadre: 'FBO', id: 'FBO_BOMMILINGAM', range: 'MARKAPUR', beat: 'BOMMILINGAM' },
  { cadre: 'FBO', id: 'FBO_ANTI-POACHING_1_MRK', range: 'MARKAPUR', specialDuty: 'ANTI-POACHING' },
  { cadre: 'FBO', id: 'FBO_ANTI-POACHING_2_MRK', range: 'MARKAPUR', specialDuty: 'ANTI-POACHING' },
  { cadre: 'ABO', id: 'ABO_KALANUTHALA', range: 'MARKAPUR', beat: 'KALANUTHALA' },
  { cadre: 'ABO', id: 'ABO_GUNDAMCHERLA', range: 'MARKAPUR', beat: 'GUNDAMCHERLA' },
  { cadre: 'ABO', id: 'ABO_GOTTIPADIYA', range: 'MARKAPUR', beat: 'GOTTIPADIYA' },
  { cadre: 'ABO', id: 'ABO_NAGULAVARAM', range: 'MARKAPUR', beat: 'NAGULAVARAM' },
  { cadre: 'ABO', id: 'ABO_DONAKONDA', range: 'MARKAPUR', beat: 'DONAKONDA' },
  { cadre: 'ABO', id: 'ABO_MAGUTUR', range: 'MARKAPUR', beat: 'MAGUTUR' },
  { cadre: 'ABO', id: 'ABO_BOMMILINGAM', range: 'MARKAPUR', beat: 'BOMMILINGAM' },
  // DORNAL range (Dornal(a))
  { cadre: 'FRO', id: 'FRO_DORNALA', range: 'DORNAL' },
  { cadre: 'DyRO', id: 'DyRO_CHINTHALA', range: 'DORNAL' },
  { cadre: 'DyRO', id: 'DyRO_WILDLLIFE_CRIME_CONTROL_DORNALA', range: 'DORNAL', specialDuty: 'WILDLIFE_CRIME_CONTROL' },
  { cadre: 'FSO', id: 'FSO_DORNALA', range: 'DORNAL' },
  { cadre: 'FSO', id: 'FSO_ANTI-POACHING_DORNALA', range: 'DORNAL', specialDuty: 'ANTI-POACHING' },
  { cadre: 'FSO', id: 'FSO_RAPID_RESPONSE_FORCE_DORNALA', range: 'DORNAL', specialDuty: 'RAPID_RESPONSE_FORCE' },
  { cadre: 'FSO', id: 'FSO_SPECIAL_PARTY_DORNALA', range: 'DORNAL', specialDuty: 'SPECIAL_PARTY' },
  { cadre: 'FBO', id: 'FBO_ANTI-POACHING_DORNALA', range: 'DORNAL', specialDuty: 'ANTI-POACHING' },
  { cadre: 'FBO', id: 'FBO_RAPID_RESPONSE_FORCE_DORNALA', range: 'DORNAL', specialDuty: 'RAPID_RESPONSE_FORCE' },
  { cadre: 'FBO', id: 'FBO_YADAVALLI', range: 'DORNAL', beat: 'YADAVALLI' },
  { cadre: 'FBO', id: 'FBO_CHILAKACHERLA', range: 'DORNAL', beat: 'CHILAKACHERLA' },
  { cadre: 'FBO', id: 'FBO_P.BOMMALAPURAM', range: 'DORNAL', beat: 'P.BOMMALAPURAM' },
  { cadre: 'FBO', id: 'FBO_CHINTHALA', range: 'DORNAL', beat: 'CHINTHALA' },
  { cadre: 'FBO', id: 'FBO_THUMMALABAILU', range: 'DORNAL', beat: 'THUMMALABAILU' },
  { cadre: 'FBO', id: 'FBO_GANAPATHI_CHECKPOST', range: 'DORNAL', specialDuty: 'CHECKPOST' },
  { cadre: 'ABO', id: 'ABO_YADAVALLI', range: 'DORNAL', beat: 'YADAVALLI' },
  { cadre: 'ABO', id: 'ABO_CHILAKACHERLA', range: 'DORNAL', beat: 'CHILAKACHERLA' },
  { cadre: 'ABO', id: 'ABO_P.BOMMALAPURAM', range: 'DORNAL', beat: 'P.BOMMALAPURAM' },
  { cadre: 'ABO', id: 'ABO_CHINTHALA', range: 'DORNAL', beat: 'CHINTHALA' },
  { cadre: 'ABO', id: 'ABO_THUMMALABAILU', range: 'DORNAL', beat: 'THUMMALABAILU' },
  // KORRAPROLU range (Dornal(a))
  { cadre: 'FRO', id: 'FRO_KORRAPROLU', range: 'KORRAPROLU' },
  { cadre: 'DyRO', id: 'DyRO_P.MANTHANALA', range: 'KORRAPROLU' },
  { cadre: 'FSO', id: 'FSO_CH.MANTHANALA', range: 'KORRAPROLU', beat: 'CH.MANTHANALA' },
  { cadre: 'FBO', id: 'FBO_Y.C.PALLI', range: 'KORRAPROLU', beat: 'Y.C.PALLI' },
  { cadre: 'FBO', id: 'FBO_P.MANTHANALA', range: 'KORRAPROLU', beat: 'P.MANTHANALA' },
  { cadre: 'FBO', id: 'FBO_PEDDA CHAMA', range: 'KORRAPROLU', beat: 'PEDDA CHAMA' },
  { cadre: 'FBO', id: 'FBO_CH.MANTHANALA', range: 'KORRAPROLU', beat: 'CH.MANTHANALA' },
  { cadre: 'FBO', id: 'FBO_NALLAGUNTLA', range: 'KORRAPROLU', beat: 'NALLAGUNTLA' },
  { cadre: 'FBO', id: 'FBO_KORRAPROLU_CHECKPOST', range: 'KORRAPROLU', specialDuty: 'CHECKPOST' },
  { cadre: 'ABO', id: 'ABO_KORRAPROLU_CHECKPOST', range: 'KORRAPROLU', specialDuty: 'CHECKPOST' },
  { cadre: 'ABO', id: 'ABO_Y.C.PALLI', range: 'KORRAPROLU', beat: 'Y.C.PALLI' },
  { cadre: 'ABO', id: 'ABO_P.MANTHANALA', range: 'KORRAPROLU', beat: 'P.MANTHANALA' },
  { cadre: 'ABO', id: 'ABO_PEDDA CHAMA', range: 'KORRAPROLU', beat: 'PEDDA CHAMA' },
  { cadre: 'ABO', id: 'ABO_CH.MANTHANALA', range: 'KORRAPROLU', beat: 'CH.MANTHANALA' },
  { cadre: 'ABO', id: 'ABO_NALLAGUNTLA', range: 'KORRAPROLU', beat: 'NALLAGUNTLA' },
  // G.V.PALLI range (Dornal(a))
  { cadre: 'FRO', id: 'FRO_GANJIVARIPALLI', range: 'G.V.PALLI' },
  { cadre: 'FSO', id: 'FSO_GANJIVARIPALLI', range: 'G.V.PALLI', beat: 'GANJIVARIPALLI' },
  { cadre: 'FSO', id: 'FSO_PALUTLA', range: 'G.V.PALLI', beat: 'PALUTLA' },
  { cadre: 'FBO', id: 'FBO_GANJIVARIPALLI', range: 'G.V.PALLI', beat: 'GANJIVARIPALLI' },
  { cadre: 'FBO', id: 'FBO_REGUMANUPENTA', range: 'G.V.PALLI', beat: 'REGUMANUPENTA' },
  { cadre: 'FBO', id: 'FBO_PALUTLA', range: 'G.V.PALLI', beat: 'PALUTLA' },
  { cadre: 'FBO', id: 'FBO_BURUGUNDALA', range: 'G.V.PALLI', beat: 'BURUGUNDALA' },
  { cadre: 'ABO', id: 'ABO_GANJIVARIPALLI', range: 'G.V.PALLI', beat: 'GANJIVARIPALLI' },
  { cadre: 'ABO', id: 'ABO_REGUMANUPENTA', range: 'G.V.PALLI', beat: 'REGUMANUPENTA' },
  { cadre: 'ABO', id: 'ABO_PALUTLA', range: 'G.V.PALLI', beat: 'PALUTLA' },
  { cadre: 'ABO', id: 'ABO_BURUGUNDALA', range: 'G.V.PALLI', beat: 'BURUGUNDALA' },
  // Y.PALEM range (direct)
  { cadre: 'FRO', id: 'FRO_YPALEM', range: 'Y.PALEM' },
  { cadre: 'DyRO', id: 'DyRO_YPALEM', range: 'Y.PALEM' },
  { cadre: 'DyRO', id: 'DyRO_PULLALACHERUVU', range: 'Y.PALEM' },
  { cadre: 'DyRO', id: 'DyRO_SPECIAL_DUTY_YPALEM', range: 'Y.PALEM', specialDuty: 'SPECIAL_DUTY' },
  { cadre: 'FSO', id: 'FSO_KOLUKULA', range: 'Y.PALEM', beat: 'KOLUKULA' },
  { cadre: 'FBO', id: 'FBO_VEERABHADRAPURAM', range: 'Y.PALEM', beat: 'VEERABHADRAPURAM' },
  { cadre: 'FBO', id: 'FBO_BOYALAPALLI', range: 'Y.PALEM', beat: 'BOYALAPALLI' },
  { cadre: 'FBO', id: 'FBO_KOMAROLU', range: 'Y.PALEM', beat: 'KOMAROLU' },
  { cadre: 'FBO', id: 'FBO_MALLAPALEM', range: 'Y.PALEM', beat: 'MALLAPALEM' },
  { cadre: 'FBO', id: 'FBO_VENKATAREDDYPALLI', range: 'Y.PALEM', beat: 'VENKATAREDDYPALLI' },
  { cadre: 'FBO', id: 'FBO_NAIDUPALEM', range: 'Y.PALEM', beat: 'NAIDUPALEM' },
  { cadre: 'FBO', id: 'FBO_AKKAPALEM', range: 'Y.PALEM', beat: 'AKKAPALEM' },
  { cadre: 'FBO', id: 'FBO_RENTAPALLI', range: 'Y.PALEM', beat: 'RENTAPALLI' },
  { cadre: 'FBO', id: 'FBO_PULLALACHERUVU', range: 'Y.PALEM', beat: 'PULLALACHERUVU' },
  { cadre: 'FBO', id: 'FBO_KOLUKULA', range: 'Y.PALEM', beat: 'KOLUKULA' },
  { cadre: 'FBO', id: 'FBO_T.R.CHERUVU', range: 'Y.PALEM', beat: 'T.R.CHERUVU' },
  { cadre: 'ABO', id: 'ABO_VEERABHADRAPURAM', range: 'Y.PALEM', beat: 'VEERABHADRAPURAM' },
  { cadre: 'ABO', id: 'ABO_BOYALAPALLI', range: 'Y.PALEM', beat: 'BOYALAPALLI' },
  { cadre: 'ABO', id: 'ABO_KOMAROLU', range: 'Y.PALEM', beat: 'KOMAROLU' },
  { cadre: 'ABO', id: 'ABO_MALLAPALEM', range: 'Y.PALEM', beat: 'MALLAPALEM' },
  { cadre: 'ABO', id: 'ABO_VENKATAREDDYPALLI', range: 'Y.PALEM', beat: 'VENKATAREDDYPALLI' },
  { cadre: 'ABO', id: 'ABO_NAIDUPALEM', range: 'Y.PALEM', beat: 'NAIDUPALEM' },
  { cadre: 'ABO', id: 'ABO_AKKAPALEM', range: 'Y.PALEM', beat: 'AKKAPALEM' },
  { cadre: 'ABO', id: 'ABO_RENTAPALLI', range: 'Y.PALEM', beat: 'RENTAPALLI' },
  { cadre: 'ABO', id: 'ABO_PULLALACHERUVU', range: 'Y.PALEM', beat: 'PULLALACHERUVU' },
  { cadre: 'ABO', id: 'ABO_KOLUKULA', range: 'Y.PALEM', beat: 'KOLUKULA' },
  { cadre: 'ABO', id: 'ABO_T.R.CHERUVU', range: 'Y.PALEM', beat: 'T.R.CHERUVU' },
  // V.P.SOUTH range (direct)
  { cadre: 'FRO', id: 'FRO_VIJAYAPURI_SOUTH', range: 'V.P.SOUTH' },
  { cadre: 'FSO', id: 'FSO_VIJAYAPURI_SOUTH', range: 'V.P.SOUTH' },
  { cadre: 'FSO', id: 'FSO_SIRIGIRIPADU', range: 'V.P.SOUTH', beat: 'SIRIGIRIPADU' },
  { cadre: 'FBO', id: 'FBO_SPECIAL_DUTY_VPSOUTH', range: 'V.P.SOUTH', specialDuty: 'SPECIAL_DUTY' },
  { cadre: 'FBO', id: 'FBO_SPECIAL_DUTY_SIRIGIRIPADU', range: 'V.P.SOUTH', specialDuty: 'SPECIAL_DUTY' },
  { cadre: 'FBO', id: 'FBO_SIRIGIRIPADU', range: 'V.P.SOUTH', beat: 'SIRIGIRIPADU' },
  { cadre: 'FBO', id: 'FBO_GANGALAKUNTA', range: 'V.P.SOUTH', beat: 'GANGALAKUNTA' },
  { cadre: 'FBO', id: 'FBO_GOTTIPALLA', range: 'V.P.SOUTH', beat: 'GOTTIPALLA' },
  { cadre: 'FBO', id: 'FBO_KANDLAKUNTA', range: 'V.P.SOUTH', beat: 'KANDLAKUNTA' },
  { cadre: 'FBO', id: 'FBO_ZAVUKU', range: 'V.P.SOUTH', beat: 'ZAVUKU' },
  { cadre: 'FBO', id: 'FBO_KOPPUNURU', range: 'V.P.SOUTH', beat: 'KOPPUNURU' },
  { cadre: 'FBO', id: 'FBO_NAGULAVARAM_VPSOUTH', range: 'V.P.SOUTH', beat: 'NAGULAVARAM_VPSOUTH' },
  { cadre: 'FBO', id: 'FBO_PASUVEMULA', range: 'V.P.SOUTH', beat: 'PASUVEMULA' },
  { cadre: 'FBO', id: 'FBO_TUMURUKOTA', range: 'V.P.SOUTH', beat: 'TUMURUKOTA' },
  { cadre: 'ABO', id: 'ABO_SIRIGIRIPADU', range: 'V.P.SOUTH', beat: 'SIRIGIRIPADU' },
  { cadre: 'ABO', id: 'ABO_GANGALAKUNTA', range: 'V.P.SOUTH', beat: 'GANGALAKUNTA' },
  { cadre: 'ABO', id: 'ABO_GOTTIPALLA', range: 'V.P.SOUTH', beat: 'GOTTIPALLA' },
  { cadre: 'ABO', id: 'ABO_KANDLAKUNTA', range: 'V.P.SOUTH', beat: 'KANDLAKUNTA' },
  { cadre: 'ABO', id: 'ABO_ZAVUKU', range: 'V.P.SOUTH', beat: 'ZAVUKU' },
  { cadre: 'ABO', id: 'ABO_KOPPUNURU', range: 'V.P.SOUTH', beat: 'KOPPUNURU' },
  { cadre: 'ABO', id: 'ABO_NAGULAVARAM_VPSOUTH', range: 'V.P.SOUTH', beat: 'NAGULAVARAM_VPSOUTH' },
  { cadre: 'ABO', id: 'ABO_PASUVEMULA', range: 'V.P.SOUTH', beat: 'PASUVEMULA' },
  { cadre: 'ABO', id: 'ABO_TUMURUKOTA', range: 'V.P.SOUTH', beat: 'TUMURUKOTA' },
  // NEKKANTI range (Dornal(a))
  { cadre: 'FRO', id: 'FRO_NEKKANTI', range: 'NEKKANTI' },
  { cadre: 'DyRO', id: 'DyRO_GUTTALACHENU', range: 'NEKKANTI' },
  { cadre: 'FSO', id: 'FSO_NEKKANTI', range: 'NEKKANTI' },
  { cadre: 'FBO', id: 'FBO_CHINNARUTLA', range: 'NEKKANTI', beat: 'CHINNARUTLA' },
  { cadre: 'FBO', id: 'FBO_NEKKANTI', range: 'NEKKANTI', beat: 'NEKKANTI' },
  { cadre: 'FBO', id: 'FBO_GUTTALACHENU', range: 'NEKKANTI', beat: 'GUTTALACHENU' },
  { cadre: 'ABO', id: 'ABO_CHINNARUTLA', range: 'NEKKANTI', beat: 'CHINNARUTLA' },
  { cadre: 'ABO', id: 'ABO_NEKKANTI', range: 'NEKKANTI', beat: 'NEKKANTI' },
  { cadre: 'ABO', id: 'ABO_GUTTALACHENU', range: 'NEKKANTI', beat: 'GUTTALACHENU' },
];

/** Resolves a posting to the current DB Beat row, warning on unresolved
 *  geography (EDAVALLI hold / pending checkposts). */
export const POSTING_NOTE_ALIASES: Record<string, string> = {
  FBO_YADAVALLI: 'Possible source spelling mismatch with DB EDAVALLI; awaiting confirmation.',
  FBO_GANAPATHI_CHECKPOST: 'PENDING GEOGRAPHIC CLASSIFICATION — checkpost, not a Beat.',
  ABO_KORRAPROLU_CHECKPOST: 'PENDING GEOGRAPHIC CLASSIFICATION — checkpost, not a Beat.',
};

async function canonicalizeBeats(): Promise<number> {
  let updated = 0;
  for (const { range, from, to } of BEAT_CANONICALIZATIONS) {
    const existing = await prisma.beat.findFirst({ where: { rangeName: range, name: from } });
    const target = await prisma.beat.findFirst({ where: { rangeName: range, name: to } });
    if (!existing && target) {
      console.log(`  = ${range} ${from} -> ${to}: already canonical`);
      continue;
    }
    if (!existing) {
      console.warn(`  ⚠ ${range} ${from}: not found — skipped`);
      continue;
    }
    if (target) {
      console.warn(`  ⚠ ${range} ${from} -> ${to}: target already exists — skipped (no overwrite)`);
      continue;
    }
    await prisma.beat.update({ where: { id: existing.id }, data: { name: to } });
    updated += 1;
    console.log(`  ✔ ${range} ${from} -> ${to}`);
  }
  return updated;
}

async function main() {
  const subDivision = await prisma.subDivision.upsert({
    where: { code: SUB_DIVISION_DORNALA },
    update: { name: 'Dornal(a) Sub-Division' },
    create: { code: SUB_DIVISION_DORNALA, name: 'Dornal(a) Sub-Division' },
  });
  console.log('✔ SubDivision ready:', subDivision.code);

  for (const name of DORNALA_RANGES) {
    await prisma.range.upsert({
      where: { name },
      update: { subDivisionId: subDivision.id },
      create: { name, subDivisionId: subDivision.id },
    });
    console.log(`✔ Range ready (Dornal(a)): ${name}`);
  }
  for (const name of DIRECT_RANGES) {
    await prisma.range.upsert({
      where: { name },
      update: { subDivisionId: null },
      create: { name, subDivisionId: null },
    });
    console.log(`✔ Range ready (direct): ${name}`);
  }

  console.log('Beat canonicalization:');
  const updated = await canonicalizeBeats();
  console.log(`  beats renamed: ${updated}, held: ${EDAVALLI_HOLD} (confirmed pending), checkposts: ${PENDING_GEOGRAPHIC_CLASSIFICATION.length} (pending classification)`);
  console.log(`Postings metadata ready: ${POSTINGS.length} positions (not materialized as users)`);
}

main()
  .catch((e) => {
    console.error('Error seeding organization:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });