import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  DashboardFilterParams,
  DashboardMetricsResponse,
} from '../models/dashboard.model';
import { getApiBaseUrl } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = getApiBaseUrl();

  getMetrics(filter?: DashboardFilterParams): Observable<DashboardMetricsResponse> {
    let params = new HttpParams();
    if (filter?.startDate) params = params.set('startDate', filter.startDate);
    if (filter?.endDate) params = params.set('endDate', filter.endDate);
    if (filter?.scope) params = params.set('scope', filter.scope);
    if (filter?.propertyId) params = params.set('propertyId', filter.propertyId);
    if (filter?.internalAreaId) params = params.set('internalAreaId', filter.internalAreaId);
    if (filter?.assignedUserId) params = params.set('assignedUserId', filter.assignedUserId);
    if (filter?.categoryId) params = params.set('categoryId', filter.categoryId);
    if (filter?.priority) params = params.set('priority', filter.priority);
    if (filter?.status) params = params.set('status', filter.status);

    return this.http.get<DashboardMetricsResponse>(`${this.apiUrl}/dashboard/metrics`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = localStorage.getItem('sigproh_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
