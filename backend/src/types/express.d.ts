import type { Cader, Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        cader: Cader;
        isAdmin: boolean;
      };
    }
  }
}

export {};
