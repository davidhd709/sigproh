import { IssueScope } from './issue.model';

export type UserRole =
  | 'ADMINISTRADOR'
  | 'DIRECTOR_OPERATIVO'
  | 'GERENTE'
  | 'AUXILIAR_GERENCIA'
  | 'COORDINADOR_OPERATIVO';

export interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  propertyAssignments?: { isLead: boolean; property: { id: string; name: string; code: string } }[];
  areaAssignments?: { isLead: boolean; internalArea: { id: string; name: string; code: string } }[];
}

export interface CreateUserPayload {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  password: string;
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'password'>>;

export interface AssignedPerson {
  id: string;
  isLead: boolean;
  isActive: boolean;
  user: { id: string; firstName: string; lastName: string; email: string; role: UserRole };
}

export interface ManagedProperty {
  id: string;
  name: string;
  code: string;
  address: string | null;
  nit: string | null;
  isActive: boolean;
  zones: { id: string; name: string; description: string | null }[];
  assignments: AssignedPerson[];
}

export interface ManagedArea {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  assignments: AssignedPerson[];
}

export interface ManagedCategory {
  id: string;
  scope: IssueScope;
  name: string;
  description: string | null;
  requiresEvidence: boolean;
  isActive: boolean;
  _count?: { issues: number };
}
