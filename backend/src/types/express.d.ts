import type { Cader, Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        cader: Cader;
        isAdmin: boolean;
        divisionId?: string | null;
        subDivisionId?: string | null;
        rangeId?: string | null;
        beatId?: string | null;
      };
    }
  }
}

export {};
