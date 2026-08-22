import { getUserScope, patrolVisibleTo, incidentVisibleTo, incidentScopeFilter, userScopeFilter } from './scope';

jest.mock('../db/prisma', () => ({
  prisma: {
    range: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    beat: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    patrol: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
  checkDatabase: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../db/prisma') as {
  prisma: {
    range: { findMany: jest.Mock; findUnique: jest.Mock };
    beat: { findMany: jest.Mock; findUnique: jest.Mock };
    user: { findMany: jest.Mock };
    patrol: { findMany: jest.Mock; findUnique: jest.Mock };
  };
};

const baseUser = {
  id: 'u1',
  role: 'RANGER' as const,
  cader: 'FBO' as const,
  isAdmin: false,
};

describe('getUserScope', () => {
  it('DFO with division assignment → DIVISION', () => {
    const scope = getUserScope({ ...baseUser, cader: 'DFO', role: 'ADMIN', divisionId: 'PT_MARKAPUR' });
    expect(scope).toEqual({ kind: 'DIVISION', divisionId: 'PT_MARKAPUR' });
  });

  it('DyDFO with sub-division assignment → SUB_DIVISION', () => {
    const scope = getUserScope({ ...baseUser, cader: 'DyDFO', role: 'ADMIN', subDivisionId: 'sd-dornala' });
    expect(scope).toEqual({ kind: 'SUB_DIVISION', subDivisionId: 'sd-dornala' });
  });

  it('FRO with range assignment → RANGE', () => {
    const scope = getUserScope({ ...baseUser, cader: 'FRO', rangeId: 'r-dornal' });
    expect(scope).toEqual({ kind: 'RANGE', rangeId: 'r-dornal' });
  });

  it('FBO with beat assignment → BEAT', () => {
    const scope = getUserScope({ ...baseUser, cader: 'FBO', beatId: 'b-1' });
    expect(scope).toEqual({ kind: 'BEAT', beatId: 'b-1' });
  });

  it('DyFRO (DyRO) → OPERATIONAL, no forced geography', () => {
    const scope = getUserScope({ ...baseUser, cader: 'DyRO' });
    expect(scope.kind).toBe('OPERATIONAL');
  });

  it('FSO → OPERATIONAL, no forced geography', () => {
    const scope = getUserScope({ ...baseUser, cader: 'FSO' });
    expect(scope.kind).toBe('OPERATIONAL');
  });

  it('FBO without beat assignment → OPERATIONAL', () => {
    const scope = getUserScope({ ...baseUser, cader: 'FBO' });
    expect(scope.kind).toBe('OPERATIONAL');
  });

  it('legacy admin without scope columns stays division-wide', () => {
    const scope = getUserScope({ ...baseUser, cader: 'FRO', role: 'ADMIN', isAdmin: true });
    expect(scope.kind).toBe('DIVISION');
  });
});

describe('patrolVisibleTo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DyDFO can see a patrol owned by a Dornal(a) user', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    expect(await patrolVisibleTo(dy, { userId: 'officer-a', beat: null })).toBe(true);
  });

  it('DyDFO cannot see a patrol owned by a direct-range officer', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    expect(await patrolVisibleTo(dy, { userId: 'officer-markapur', beat: null })).toBe(false);
  });

  it('DyDFO sees a patrol whose beat text is in a Dornal(a) range', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    expect(await patrolVisibleTo(dy, { userId: 'someone', beat: 'KALANUTHALA' })).toBe(true);
  });

  it('field user only sees own patrols', async () => {
    const field = { ...baseUser, cader: 'FBO' as const };
    expect(await patrolVisibleTo(field, { userId: 'other', beat: null })).toBe(false);
    expect(await patrolVisibleTo(field, { userId: 'u1', beat: null })).toBe(true);
  });
});

describe('incidentVisibleTo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DyDFO cannot verify incidents outside Dornal(a)', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    expect(await incidentVisibleTo(dy, { userId: 'officer-markapur', patrolId: null })).toBe(false);
  });

  it('DyDFO can verify incidents from Dornal(a) users', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    expect(await incidentVisibleTo(dy, { userId: 'officer-a', patrolId: null })).toBe(true);
  });
});

describe('incidentScopeFilter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DyDFO gets a userId-in-scope OR filter', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    const filter = await incidentScopeFilter(dy);
    expect(filter).toEqual({ OR: [{ userId: { in: ['officer-a'] } }] });
  });

  it('division-wide user gets no filter', async () => {
    const dfo = { ...baseUser, cader: 'DFO' as const, role: 'ADMIN' as const, divisionId: 'PT_MARKAPUR' };
    expect(await incidentScopeFilter(dfo)).toBeUndefined();
  });
});

describe('userScopeFilter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DyDFO user list is restricted to Dornal(a) users', async () => {
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    const dy = { ...baseUser, cader: 'DyDFO' as const, role: 'ADMIN' as const, subDivisionId: 'sd-1' };
    const filter = await userScopeFilter(dy);
    expect(filter).toBeDefined();
    expect((filter as { OR: unknown[] }).OR.length).toBeGreaterThan(0);
  });

  it('field user sees only themselves', async () => {
    const field = { ...baseUser, cader: 'FBO' as const };
    expect(await userScopeFilter(field)).toEqual({ id: 'u1' });
  });
});
