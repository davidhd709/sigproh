import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Category,
  CreateIssuePayload,
  Issue,
  IssuePriority,
  IssueScope,
} from '../models/issue.model';
import { getApiBaseUrl } from './auth.service';

export interface CandidateUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isLead?: boolean;
  scopeAuthorized?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class IssuesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = getApiBaseUrl();

  getIssues(filters?: {
    scope?: IssueScope;
    priority?: IssuePriority;
    status?: string;
    isCritical?: boolean;
    pendingReview?: boolean;
    mine?: boolean;
  }): Observable<Issue[]> {
    let params = new HttpParams();
    if (filters?.scope) params = params.set('scope', filters.scope);
    if (filters?.priority) params = params.set('priority', filters.priority);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.isCritical !== undefined) {
      params = params.set('isCritical', String(filters.isCritical));
    }
    if (filters?.pendingReview !== undefined) {
      params = params.set('pendingReview', String(filters.pendingReview));
    }
    if (filters?.mine !== undefined) {
      params = params.set('mine', String(filters.mine));
    }

    return this.http.get<Issue[]>(`${this.apiUrl}/issues`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  getIssueById(id: string): Observable<Issue> {
    return this.http.get<Issue>(`${this.apiUrl}/issues/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createIssue(payload: CreateIssuePayload): Observable<Issue> {
    return this.http.post<Issue>(`${this.apiUrl}/issues`, payload, {
      headers: this.getAuthHeaders(),
    });
  }

  assignPrincipal(
    issueId: string,
    assignedUserId: string,
    reason?: string,
  ): Observable<Issue> {
    return this.http.patch<Issue>(
      `${this.apiUrl}/issues/${issueId}/assignment`,
      { assignedUserId, reason },
      { headers: this.getAuthHeaders() },
    );
  }

  updatePriority(
    issueId: string,
    priority: IssuePriority,
    reason: string,
  ): Observable<Issue> {
    return this.http.patch<Issue>(
      `${this.apiUrl}/issues/${issueId}/priority`,
      { priority, reason },
      { headers: this.getAuthHeaders() },
    );
  }

  addUrgentMeasure(issueId: string, measure: string): Observable<Issue> {
    return this.http.post<Issue>(
      `${this.apiUrl}/issues/${issueId}/urgent-measures`,
      { measure },
      { headers: this.getAuthHeaders() },
    );
  }

  getCandidates(issueId: string): Observable<CandidateUser[]> {
    return this.http.get<CandidateUser[]>(
      `${this.apiUrl}/issues/${issueId}/candidates`,
      { headers: this.getAuthHeaders() },
    );
  }

  getCategories(scope?: IssueScope): Observable<Category[]> {
    let params = new HttpParams();
    if (scope) params = params.set('scope', scope);
    return this.http.get<Category[]>(`${this.apiUrl}/categories`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  // --- F4: Actividades (RF-019 / CP-09 a CP-11) ---

  createActivity(
    issueId: string,
    payload: import('../models/issue.model').CreateActivityPayload,
  ): Observable<import('../models/issue.model').IssueActivity> {
    return this.http.post<import('../models/issue.model').IssueActivity>(
      `${this.apiUrl}/issues/${issueId}/activities`,
      payload,
      { headers: this.getAuthHeaders() },
    );
  }

  listActivities(
    issueId: string,
  ): Observable<import('../models/issue.model').IssueActivity[]> {
    return this.http.get<import('../models/issue.model').IssueActivity[]>(
      `${this.apiUrl}/issues/${issueId}/activities`,
      { headers: this.getAuthHeaders() },
    );
  }

  updateActivity(
    issueId: string,
    activityId: string,
    payload: import('../models/issue.model').UpdateActivityPayload,
  ): Observable<import('../models/issue.model').IssueActivity> {
    return this.http.patch<import('../models/issue.model').IssueActivity>(
      `${this.apiUrl}/issues/${issueId}/activities/${activityId}`,
      payload,
      { headers: this.getAuthHeaders() },
    );
  }

  assignActivity(
    issueId: string,
    activityId: string,
    payload: import('../models/issue.model').AssignActivityPayload,
  ): Observable<import('../models/issue.model').IssueActivity> {
    return this.http.patch<import('../models/issue.model').IssueActivity>(
      `${this.apiUrl}/issues/${issueId}/activities/${activityId}/assignment`,
      payload,
      { headers: this.getAuthHeaders() },
    );
  }

  // --- F4: Comentarios (RF-020) ---

  createComment(
    issueId: string,
    payload: import('../models/issue.model').CreateCommentPayload,
  ): Observable<import('../models/issue.model').IssueComment> {
    return this.http.post<import('../models/issue.model').IssueComment>(
      `${this.apiUrl}/issues/${issueId}/comments`,
      payload,
      { headers: this.getAuthHeaders() },
    );
  }

  listComments(
    issueId: string,
    activityId?: string,
  ): Observable<import('../models/issue.model').IssueComment[]> {
    let params = new HttpParams();
    if (activityId) params = params.set('activityId', activityId);
    return this.http.get<import('../models/issue.model').IssueComment[]>(
      `${this.apiUrl}/issues/${issueId}/comments`,
      { headers: this.getAuthHeaders(), params },
    );
  }

  getProperties(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/properties`, {
      headers: this.getAuthHeaders(),
    });
  }

  getInternalAreas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/internal-areas`, {
      headers: this.getAuthHeaders(),
    });
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = localStorage.getItem('sigproh_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
