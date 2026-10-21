import { Role } from '../../generated/prisma/client';

export type AuthUserRecord = {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
};

export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<AuthUserRecord | null>;
}