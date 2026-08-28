/**
 * Official personnel import — PT Markapur Division roster.
 *
 * Creates one account per official post ID and binds organizational scope
 * per docs/nstr-organizational-authorization-updated.md §6:
 *   FRO      -> divisionId (+subDivisionId) + rangeId
 *   DyRO/FSO -> divisionId (+subDivisionId) only (boundaries not fixed yet)
 *   FBO/ABO  -> divisionId (+subDivisionId) + rangeId + beatId
 *               (special units: anti-poaching, rapid response, special duty/party,
 *                checkposts -> division scope, no beat)
 *
 * Usage:
 *   npm run import:personnel            # dry run — prints plan + warnings
 *   npm run import:personnel -- --apply # create/update users in DB
 *   npm run import:personnel -- --apply --reset-passwords
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Cader, PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const resetPasswords = process.argv.includes('--reset-passwords');
const handoutPath = fileURLToPath(new URL('../../docs/personnel-credentials.csv', import.meta.url));
const EMAIL_DOMAIN = 'nstrpatrol.gov.in';

// ---------------------------------------------------------------------------
// Roster: [official post id, db range name, db beat name | null]
// Beat null => special unit / range-level / not-yet-fixed geography.
// YADAVALLI posts map to the GIS beat EDAVALLI (same physical beat).
// ---------------------------------------------------------------------------
type Entry = [postId: string, rangeName: string, beatName: string | null];

const MARKAPUR: Entry[] = [
  ['FRO_MARKAPUR', 'MARKAPUR', null],
  ['DyRO_MARKAPUR', 'MARKAPUR', null],
  ['DyRO_NAGUAVARAM', 'MARKAPUR', null],
  ['FSO_ANTI-POACHING_MRK', 'MARKAPUR', null],
  ['FBO_KALANUTHALA', 'MARKAPUR', 'KALANUTHALA'],
  ['FBO_GUNDAMCHERLA', 'MARKAPUR', 'GUNDAMCHERLA'],
  ['FBO_GOTTIPADIYA', 'MARKAPUR', 'GOTTIPADIYA'],
  ['FBO_NAGULAVARAM_MRK', 'MARKAPUR', 'NAGULAVARAM'],
  ['FBO_DONAKONDA', 'MARKAPUR', 'DONAKONDA'],
  ['FBO_MAGUTUR', 'MARKAPUR', 'MAGUTUR'],
  ['FBO_BOMMILINGAM', 'MARKAPUR', 'BOMMILINGAM'],
  ['FBO_ANTI-POACHING_1_MRK', 'MARKAPUR', null],
  ['FBO_ANTI-POACHING_2_MRK', 'MARKAPUR', null],
  ['ABO_KALANUTHALA', 'MARKAPUR', 'KALANUTHALA'],
  ['ABO_GUNDAMCHERLA', 'MARKAPUR', 'GUNDAMCHERLA'],
  ['ABO_GOTTIPADIYA', 'MARKAPUR', 'GOTTIPADIYA'],
  ['ABO_NAGULAVARAM', 'MARKAPUR', 'NAGULAVARAM'],
  ['ABO_DONAKONDA', 'MARKAPUR', 'DONAKONDA'],
  ['ABO_MAGUTUR', 'MARKAPUR', 'MAGUTUR'],
  ['ABO_BOMMILINGAM', 'MARKAPUR', 'BOMMILINGAM'],
];

const DORNAL: Entry[] = [
  ['FRO_DORNALA', 'DORNAL', null],
  ['DyRO_CHINTHALA', 'DORNAL', null],
  ['DyRO_WILDLLIFE_CRIME_CONTROL_DORNALA', 'DORNAL', null],
  ['FSO_DORNALA', 'DORNAL', null],
  ['FSO_ANTI-POACHING_DORNALA', 'DORNAL', null],
  ['FSO_RAPID_RESPONSE_FORCE_DORNALA', 'DORNAL', null],
  ['FSO_SPECIAL_PARTY_DORNALA', 'DORNAL', null],
  ['FBO_ANTI-POACHING_DORNALA', 'DORNAL', null],
  ['FBO_RAPID_RESPONSE_FORCE_DORNALA', 'DORNAL', null],
  ['FBO_YADAVALLI', 'DORNAL', 'EDAVALLI'],
  ['FBO_CHILAKACHERLA', 'DORNAL', 'CHILAKACHERLA'],
  ['FBO_P.BOMMALAPURAM', 'DORNAL', 'P.BOMMALAPURAM'],
  ['FBO_CHINTHALA', 'DORNAL', 'CHINTHALA'],
  ['FBO_THUMMALABAILU', 'DORNAL', 'THUMMALABAILU'],
  ['FBO_GANAPATHI_CHECKPOST', 'DORNAL', null],
  ['ABO_YADAVALLI', 'DORNAL', 'EDAVALLI'],
  ['ABO_CHILAKACHERLA', 'DORNAL', 'CHILAKACHERLA'],
  ['ABO_P.BOMMALAPURAM', 'DORNAL', 'P.BOMMALAPURAM'],
  ['ABO_CHINTHALA', 'DORNAL', 'CHINTHALA'],
  ['ABO_THUMMALABAILU', 'DORNAL', 'THUMMALABAILU'],
];

const KORRAPROLU: Entry[] = [
  ['FRO_KORRAPROLU', 'KORRAPROLU', null],
  ['DyRO_P.MANTHANALA', 'KORRAPROLU', null],
  ['FSO_CH.MANTHANALA', 'KORRAPROLU', null],
  ['FBO_Y.C.PALLI', 'KORRAPROLU', 'Y.C.PALLI'],
  ['FBO_P.MANTHANALA', 'KORRAPROLU', 'P.MANTHANALA'],
  ['FBO_PEDDA CHAMA', 'KORRAPROLU', 'PEDDA CHAMA'],
  ['FBO_CH.MANTHANALA', 'KORRAPROLU', 'CH.MANTHANALA'],
  ['FBO_NALLAGUNTLA', 'KORRAPROLU', 'NALLAGUNTLA'],
  ['FBO_KORRAPROLU_CHECKPOST', 'KORRAPROLU', null],
  ['ABO_KORRAPROLU_CHECKPOST', 'KORRAPROLU', null],
  ['ABO_Y.C.PALLI', 'KORRAPROLU', 'Y.C.PALLI'],
  ['ABO_P.MANTHANALA', 'KORRAPROLU', 'P.MANTHANALA'],
  ['ABO_PEDDA CHAMA', 'KORRAPROLU', 'PEDDA CHAMA'],
  ['ABO_CH.MANTHANALA', 'KORRAPROLU', 'CH.MANTHANALA'],
  ['ABO_NALLAGUNTLA', 'KORRAPROLU', 'NALLAGUNTLA'],
];

const GANJIVARIPALLI: Entry[] = [
  ['FRO_GANJIVARIPALLI', 'G.V.PALLI', null],
  ['FSO_GANJIVARIPALLI', 'G.V.PALLI', null],
  ['FSO_PALUTLA', 'G.V.PALLI', null],
  ['FBO_GANJIVARIPALLI', 'G.V.PALLI', 'GANJIVARIPALLI'],
  ['FBO_REGUMANUPENTA', 'G.V.PALLI', 'REGUMANUPENTA'],
  ['FBO_PALUTLA', 'G.V.PALLI', 'PALUTLA'],
  ['FBO_BURUGUNDALA', 'G.V.PALLI', 'BURUGUNDALA'],
  ['ABO_GANJIVARIPALLI', 'G.V.PALLI', 'GANJIVARIPALLI'],
  ['ABO_REGUMANUPENTA', 'G.V.PALLI', 'REGUMANUPENTA'],
  ['ABO_PALUTLA', 'G.V.PALLI', 'PALUTLA'],
  ['ABO_BURUGUNDALA', 'G.V.PALLI', 'BURUGUNDALA'],
];

const YERRAGONDAPALEM: Entry[] = [
  ['FRO_YPALEM', 'Y.PALEM', null],
  ['DyRO_YPALEM', 'Y.PALEM', null],
  ['DyRO_PULLALACHERUVU', 'Y.PALEM', null],
  ['DyRO_SPECIAL_DUTY_YPALEM', 'Y.PALEM', null],
  ['FSO_KOLUKULA', 'Y.PALEM', null],
  ...[
    'VEERABHADRAPURAM',
    'BOYALAPALLI',
    'KOMAROLU',
    'MALLAPALEM',
    'VENKATAREDDYPALLI',
    'NAIDUPALEM',
    'AKKAPALEM',
    'RENTAPALLI',
    'PULLALACHERUVU',
    'KOLUKULA',
    'T.R.CHERUVU',
  ].flatMap((b): Entry[] => [
    [`FBO_${b}`, 'Y.PALEM', b],
    [`ABO_${b}`, 'Y.PALEM', b],
  ]),
];

const VIJAYAPURI_SOUTH: Entry[] = [
  ['FRO_VIJAYAPURI_SOUTH', 'V.P.SOUTH', null],
  ['FSO_VIJAYAPURI_SOUTH', 'V.P.SOUTH', null],
  ['FSO_SIRIGIRIPADU', 'V.P.SOUTH', null],
  ['FBO_SPECIAL_DUTY_VPSOUTH', 'V.P.SOUTH', null],
  ['FBO_SPECIAL_DUTY_SIRIGIRIPADU', 'V.P.SOUTH', null],
  ['FBO_SIRIGIRIPADU', 'V.P.SOUTH', 'SIRIGIRIPADU'],
  ['FBO_GANGALAKUNTA', 'V.P.SOUTH', 'GANGALAKUNTA'],
  ['FBO_GOTTIPALLA', 'V.P.SOUTH', 'GOTTIPALLA'],
  ['FBO_KANDLAKUNTA', 'V.P.SOUTH', 'KANDLAKUNTA'],
  ['FBO_ZAVUKU', 'V.P.SOUTH', 'ZAVUKU'],
  ['FBO_KOPPUNURU', 'V.P.SOUTH', 'KOPPUNURU'],
  ['FBO_NAGULAVARAM_VPSOUTH', 'V.P.SOUTH', 'NAGULAVARAM_VPSOUTH'],
  ['FBO_PASUVEMULA', 'V.P.SOUTH', 'PASUVEMULA'],
  ['FBO_TUMURUKOTA', 'V.P.SOUTH', 'TUMURUKOTA'],
  ...['SIRIGIRIPADU', 'GANGALAKUNTA', 'GOTTIPALLA', 'KANDLAKUNTA', 'ZAVUKU', 'KOPPUNURU', 'NAGULAVARAM_VPSOUTH', 'PASUVEMULA', 'TUMURUKOTA'].map(
    (b): Entry => [`ABO_${b}`, 'V.P.SOUTH', b],
  ),
];

const NEKKANTI: Entry[] = [
  ['FRO_Nekkanti', 'NEKKANTI', null],
  ['DyRO_Guttalachenu', 'NEKKANTI', null],
  ['FSO_Nekkanti', 'NEKKANTI', null],
  ['FBO_Chinnarutla', 'NEKKANTI', 'CHINNARUTLA'],
  ['FBO_Nekkanti', 'NEKKANTI', 'NEKKANTI'],
  ['FBO_Guttalachenu', 'NEKKANTI', 'GUTTALACHENU'],
  ['ABO_Chinnarutla', 'NEKKANTI', 'CHINNARUTLA'],
  ['ABO_Nekkanti', 'NEKKANTI', 'NEKKANTI'],
  ['ABO_Guttalachenu', 'NEKKANTI', 'GUTTALACHENU'],
];

const ROSTER: Entry[] = [
  ...MARKAPUR,
  ...DORNAL,
  ...KORRAPROLU,
  ...GANJIVARIPALLI,
  ...YERRAGONDAPALEM,
  ...VIJAYAPURI_SOUTH,
  ...NEKKANTI,
];

// ---------------------------------------------------------------------------

function caderOf(postId: string): Cader {
  const prefix = postId.split(/[_\s.]/)[0];
  const key = Object.keys(Cader).find((k) => k.toLowerCase() === prefix.toLowerCase());
  if (!key) throw new Error(`Unknown cadre prefix in "${postId}"`);
  return Cader[key as keyof typeof Cader];
}

function emailOf(postId: string): string {
  const local = postId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${local}@${EMAIL_DOMAIN}`;
}

function fullNameOf(postId: string): string {
  return postId
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((tok) =>
      tok.length === 1 ? tok.toUpperCase() : tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase(),
    )
    .join(' ');
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generatePassword(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
  return out;
}

async function main(): Promise<void> {
  console.log(`Roster entries: ${ROSTER.length} | mode: ${apply ? 'APPLY' : 'DRY RUN'}\n`);

  const divisionId = 'PT_MARKAPUR';

  const ranges = await prisma.range.findMany({ include: { subDivision: true } });
  const beats = await prisma.beat.findMany();

  const warnings: string[] = [];
  const handout: string[] = ['post_id,email,password,full_name,cadre,range,beat'];

  let created = 0;
  let updated = 0;

  for (const [postId, rangeName, beatName] of ROSTER) {
    if (postId === 'FBO_YADAVALLI' || postId === 'ABO_YADAVALLI') {
      warnings.push(`${postId}: roster "YADAVALLI" bound to GIS beat "EDAVALLI"`);
    }

    const range = ranges.find((r) => r.name === rangeName);
    if (!range) {
      warnings.push(`${postId}: RANGE "${rangeName}" NOT FOUND IN DB — skipped`);
      continue;
    }

    const beat = beatName ? beats.find((b) => b.name === beatName && b.rangeName === range.name) : undefined;
    if (beatName && !beat) {
      warnings.push(`${postId}: BEAT "${beatName}" not found under range ${range.name} — scope left at range level`);
    }

    const cader = caderOf(postId);
    const email = emailOf(postId);
    const fullName = fullNameOf(postId);

    const scope = {
      divisionId,
      subDivisionId: range.subDivisionId ?? null,
      rangeId: range.id,
      // FBO/ABO get beat scope; FRO stops at range; others division-level.
      beatId: cader === 'FBO' || cader === 'ABO' ? (beat?.id ?? null) : null,
    };

    const existing = await prisma.user.findUnique({ where: { email } });
    const password = existing && !resetPasswords ? null : generatePassword();
    if (password) handout.push(`"${postId}",${email},${password},"${fullName}",${cader},${range.name},${beat?.name ?? ''}`);

    console.log(
      `${existing ? '~' : '+'} ${postId.padEnd(40)} ${cader.padEnd(5)} ${range.name.padEnd(11)} ${beat?.name ?? '(division scope)'}`,
    );

    if (!apply) continue;

    const passwordToUse = password ?? generatePassword();
    const passwordHashToUse = await hashPassword(passwordToUse);
    const data = {
      role: Role.RANGER,
      isAdmin: false,
      cader,
      fullName,
      isActive: true,
      ...scope,
    };

    await prisma.user.upsert({
      where: { email },
      update: password ? { ...data, passwordHash: passwordHashToUse } : data,
      create: { email, ...data, passwordHash: passwordHashToUse },
    });
    if (existing) updated++;
    else created++;
  }

  console.log(`\nTotal: ${ROSTER.length} posts | ${created} new | ${updated} updates`);

  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  if (apply && handout.length > 1) {
    writeFileSync(handoutPath, handout.join('\n') + '\n', { mode: 0o600 });
    console.log(`\nCredentials handout written to ${handoutPath} (chmod 600 — distribute securely, then delete).`);
  } else if (!apply) {
    console.log('\nDry run only — re-run with --apply to write users.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
