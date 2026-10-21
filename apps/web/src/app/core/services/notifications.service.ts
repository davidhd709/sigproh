import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppNotification } from '../models/issue.model';
import { getApiBaseUrl } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = getApiBaseUrl();

  getNotifications(unreadOnly = false): Observable<AppNotification[]> {
    let params = new HttpParams();
    if (unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }
    return this.http.get<AppNotification[]>(`${this.apiUrl}/notifications`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  getUnreadCount(): Observable<{ unreadCount: number }> {
    return this.http.get<{ unreadCount: number }>(
      `${this.apiUrl}/notifications/unread-count`,
      { headers: this.getAuthHeaders() },
    );
  }

  markAsRead(notificationId: string): Observable<AppNotification> {
    return this.http.patch<AppNotification>(
      `${this.apiUrl}/notifications/${notificationId}/read`,
      {},
      { headers: this.getAuthHeaders() },
    );
  }

  markAllAsRead(): Observable<{ updatedCount: number }> {
    return this.http.patch<{ updatedCount: number }>(
      `${this.apiUrl}/notifications/read-all`,
      {},
      { headers: this.getAuthHeaders() },
    );
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = localStorage.getItem('sigproh_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
