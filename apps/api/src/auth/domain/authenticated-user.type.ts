import { Role } from '../../generated/prisma/client';

export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
};
