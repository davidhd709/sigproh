import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateReportDraftDto,
  ReportDetail,
  ReportFilter,
  ReportListItem,
  UpdateReportDraftDto,
} from '../models/report.model';
import { getApiBaseUrl } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = getApiBaseUrl();

  getReports(filter?: ReportFilter): Observable<ReportListItem[]> {
    let params = new HttpParams();
    if (filter?.scope) params = params.set('scope', filter.scope);
    if (filter?.status) params = params.set('status', filter.status);
    if (filter?.propertyId) params = params.set('propertyId', filter.propertyId);
    if (filter?.internalAreaId) params = params.set('internalAreaId', filter.internalAreaId);
    if (filter?.search) params = params.set('search', filter.search);

    return this.http.get<ReportListItem[]>(`${this.apiUrl}/reports`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  getReportById(id: string): Observable<ReportDetail> {
    return this.http.get<ReportDetail>(`${this.apiUrl}/reports/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createDraft(dto: CreateReportDraftDto): Observable<ReportDetail> {
    return this.http.post<ReportDetail>(`${this.apiUrl}/reports/draft`, dto, {
      headers: this.getAuthHeaders(),
    });
  }

  updateDraft(id: string, dto: UpdateReportDraftDto): Observable<ReportDetail> {
    return this.http.put<ReportDetail>(`${this.apiUrl}/reports/${id}`, dto, {
      headers: this.getAuthHeaders(),
    });
  }

  refreshSourceData(id: string): Observable<ReportDetail> {
    return this.http.post<ReportDetail>(`${this.apiUrl}/reports/${id}/refresh`, {}, {
      headers: this.getAuthHeaders(),
    });
  }

  downloadPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/${id}/pdf`, {
      headers: this.getAuthHeaders(),
      responseType: 'blob',
    });
  }

  downloadExcel(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/${id}/excel`, {
      headers: this.getAuthHeaders(),
      responseType: 'blob',
    });
  }

  deleteDraft(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/reports/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = localStorage.getItem('sigproh_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
