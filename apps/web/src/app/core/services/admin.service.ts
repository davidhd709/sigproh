import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiBaseUrl } from './auth.service';
import { IssueScope } from '../models/issue.model';
import {
  CreateUserPayload,
  ManagedArea,
  ManagedCategory,
  ManagedProperty,
  ManagedUser,
  UpdateUserPayload,
} from '../models/admin.model';

/** Configuración: usuarios, propiedades, áreas internas y categorías (RF-002 a RF-005). */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = getApiBaseUrl();

  // ---------- Usuarios ----------
  listUsers(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(`${this.apiUrl}/users`, { headers: this.headers() });
  }

  createUser(payload: CreateUserPayload): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(`${this.apiUrl}/users`, payload, { headers: this.headers() });
  }

  updateUser(id: string, payload: UpdateUserPayload): Observable<ManagedUser> {
    return this.http.patch<ManagedUser>(`${this.apiUrl}/users/${id}`, payload, { headers: this.headers() });
  }

  setUserActive(id: string, isActive: boolean): Observable<ManagedUser> {
    return this.http.patch<ManagedUser>(`${this.apiUrl}/users/${id}/status`, { isActive }, { headers: this.headers() });
  }

  resetPassword(id: string, password: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/users/${id}/password`, { password }, { headers: this.headers() });
  }

  // ---------- Propiedades ----------
  listProperties(): Observable<ManagedProperty[]> {
    return this.http.get<ManagedProperty[]>(`${this.apiUrl}/properties`, {
      headers: this.headers(),
      params: { includeInactive: 'true' },
    });
  }

  createProperty(payload: {
    name: string;
    code: string;
    address?: string;
    nit?: string;
    coordinatorId: string;
    directorId: string;
  }): Observable<ManagedProperty> {
    return this.http.post<ManagedProperty>(`${this.apiUrl}/properties`, payload, { headers: this.headers() });
  }

  updateProperty(
    id: string,
    payload: Partial<{ name: string; address: string; nit: string; isActive: boolean }>,
  ): Observable<ManagedProperty> {
    return this.http.patch<ManagedProperty>(`${this.apiUrl}/properties/${id}`, payload, { headers: this.headers() });
  }

  addZone(propertyId: string, payload: { name: string; description?: string }): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/properties/${propertyId}/zones`, payload, { headers: this.headers() });
  }

  updateZone(propertyId: string, zoneId: string, payload: Partial<{ name: string; isActive: boolean }>): Observable<unknown> {
    return this.http.patch(`${this.apiUrl}/properties/${propertyId}/zones/${zoneId}`, payload, { headers: this.headers() });
  }

  assignToProperty(propertyId: string, userId: string, isLead: boolean): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/properties/${propertyId}/assignments`, { userId, isLead }, { headers: this.headers() });
  }

  removeFromProperty(propertyId: string, userId: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/properties/${propertyId}/assignments/${userId}`, { headers: this.headers() });
  }

  // ---------- Áreas internas ----------
  listAreas(): Observable<ManagedArea[]> {
    return this.http.get<ManagedArea[]>(`${this.apiUrl}/internal-areas`, {
      headers: this.headers(),
      params: { includeInactive: 'true' },
    });
  }

  createArea(payload: { name: string; code: string; description?: string }): Observable<ManagedArea> {
    return this.http.post<ManagedArea>(`${this.apiUrl}/internal-areas`, payload, { headers: this.headers() });
  }

  updateArea(id: string, payload: Partial<{ name: string; description: string; isActive: boolean }>): Observable<ManagedArea> {
    return this.http.patch<ManagedArea>(`${this.apiUrl}/internal-areas/${id}`, payload, { headers: this.headers() });
  }

  assignToArea(areaId: string, userId: string, isLead: boolean): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/internal-areas/${areaId}/assignments`, { userId, isLead }, { headers: this.headers() });
  }

  removeFromArea(areaId: string, userId: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/internal-areas/${areaId}/assignments/${userId}`, { headers: this.headers() });
  }

  // ---------- Categorías ----------
  listCategories(): Observable<ManagedCategory[]> {
    return this.http.get<ManagedCategory[]>(`${this.apiUrl}/categories/manage`, { headers: this.headers() });
  }

  createCategory(payload: { scope: IssueScope; name: string; description?: string; requiresEvidence: boolean }): Observable<ManagedCategory> {
    return this.http.post<ManagedCategory>(`${this.apiUrl}/categories`, payload, { headers: this.headers() });
  }

  updateCategory(
    id: string,
    payload: Partial<{ name: string; description: string; requiresEvidence: boolean; isActive: boolean }>,
  ): Observable<ManagedCategory> {
    return this.http.patch<ManagedCategory>(`${this.apiUrl}/categories/${id}`, payload, { headers: this.headers() });
  }

  private headers(): Record<string, string> {
    const token = localStorage.getItem('sigproh_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

/** Mensaje legible a partir de un error HTTP de Nest (mensaje único o lista de validaciones). */
export function apiErrorMessage(err: any, fallback: string): string {
  const msg = err?.error?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  return msg || fallback;
}
