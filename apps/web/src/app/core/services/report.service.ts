import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateDistributionDto,
  CreateInstitutionalTemplateDto,
  CreateNewVersionDto,
  CreateReportDraftDto,
  InstitutionalTemplate,
  PropertyReportConfig,
  ReportDetail,
  ReportDistributionItem,
  ReportFilter,
  ReportListItem,
  ReportVersionItem,
  ReviewReportDto,
  UpdatePropertyReportConfigDto,
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

  // =========================================================================
  // GOBERNANZA DE PLANTILLAS Y CONFIGURACIÓN (RF-044 a RF-046, CP-29 a CP-31)
  // =========================================================================

  createInstitutionalTemplate(dto: CreateInstitutionalTemplateDto): Observable<InstitutionalTemplate> {
    return this.http.post<InstitutionalTemplate>(`${this.apiUrl}/reports/templates/institutional`, dto, {
      headers: this.getAuthHeaders(),
    });
  }

  getPublishedInstitutionalTemplate(): Observable<InstitutionalTemplate> {
    return this.http.get<InstitutionalTemplate>(`${this.apiUrl}/reports/templates/institutional/published`, {
      headers: this.getAuthHeaders(),
    });
  }

  updatePropertyReportConfig(propertyId: string, dto: UpdatePropertyReportConfigDto): Observable<PropertyReportConfig> {
    return this.http.put<PropertyReportConfig>(`${this.apiUrl}/reports/properties/${propertyId}/config`, dto, {
      headers: this.getAuthHeaders(),
    });
  }

  getPropertyReportConfig(propertyId: string): Observable<PropertyReportConfig> {
    return this.http.get<PropertyReportConfig>(`${this.apiUrl}/reports/properties/${propertyId}/config`, {
      headers: this.getAuthHeaders(),
    });
  }

  // =========================================================================
  // FLUJO DE REVISIÓN, APROBACIÓN Y VERSIONES (RF-037 a RF-041, CP-21 a CP-26)
  // =========================================================================

  finalize(id: string): Observable<ReportDetail> {
    return this.http.post<ReportDetail>(`${this.apiUrl}/reports/${id}/finalize`, {}, {
      headers: this.getAuthHeaders(),
    });
  }

  reviewReport(id: string, dto: ReviewReportDto): Observable<ReportDetail> {
    return this.http.post<ReportDetail>(`${this.apiUrl}/reports/${id}/review`, dto, {
      headers: this.getAuthHeaders(),
    });
  }

  createNewVersion(id: string, dto?: CreateNewVersionDto): Observable<ReportDetail> {
    return this.http.post<ReportDetail>(`${this.apiUrl}/reports/${id}/new-version`, dto || {}, {
      headers: this.getAuthHeaders(),
    });
  }

  getVersionHistory(id: string): Observable<ReportVersionItem[]> {
    return this.http.get<ReportVersionItem[]>(`${this.apiUrl}/reports/${id}/versions`, {
      headers: this.getAuthHeaders(),
    });
  }

  // =========================================================================
  // REGISTRO DE DISTRIBUCIÓN OFICIAL (RF-042, CP-27, CP-28)
  // =========================================================================

  distributeReport(id: string, dto: CreateDistributionDto): Observable<ReportDistributionItem> {
    return this.http.post<ReportDistributionItem>(`${this.apiUrl}/reports/${id}/distribute`, dto, {
      headers: this.getAuthHeaders(),
    });
  }

  getDistributions(id: string): Observable<ReportDistributionItem[]> {
    return this.http.get<ReportDistributionItem[]>(`${this.apiUrl}/reports/${id}/distributions`, {
      headers: this.getAuthHeaders(),
    });
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = localStorage.getItem('sigproh_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

