import { Injectable, inject } from '@angular/core';
import { AuthService, CurrentUserProfile } from './auth.service';
import { IssuePriority, IssueScope } from '../models/issue.model';

/**
 * «Borrador»: lo que la persona sigue editando.
 * «Pendiente de envío»: ya tocó Enviar, pero el servidor no confirmó (sin señal, respuesta perdida).
 */
export type IssueDraftStatus = 'BORRADOR' | 'PENDIENTE_ENVIO';

export interface IssueDraftFields {
  scope: IssueScope;
  propertyId: string;
  propertyZoneId: string;
  internalAreaId: string;
  categoryId: string;
  title: string;
  description: string;
  priority: IssuePriority;
  urgentMeasures: string;
}

/** Los archivos no se guardan en el navegador; solo su nombre, para pedir que se elijan de nuevo. */
export interface IssueDraftAttachment {
  name: string;
  kind: 'PHOTO' | 'QUOTE';
}

export interface IssueDraft {
  version: 1;
  status: IssueDraftStatus;
  /** Identificador estable del envío: el servidor lo usa para no duplicar el caso al reintentar. */
  clientRequestId: string;
  fields: IssueDraftFields;
  attachments: IssueDraftAttachment[];
  updatedAt: string;
}

const PREFIX = 'sigproh:issue-draft';

/**
 * Guarda el reporte en curso en este dispositivo, separado por organización y usuario:
 * sobrevive a salir, recargar o volver a iniciar sesión con la misma cuenta, y otra cuenta
 * en el mismo equipo no lo ve.
 */
@Injectable({ providedIn: 'root' })
export class IssueDraftService {
  private readonly auth = inject(AuthService);

  static storageKey(user: Pick<CurrentUserProfile, 'id' | 'organizationId'>): string {
    return `${PREFIX}:${user.organizationId ?? 'sin-org'}:${user.id}`;
  }

  private key(): string | null {
    const user = this.auth.currentUser();
    return user ? IssueDraftService.storageKey(user) : null;
  }

  load(): IssueDraft | null {
    const key = this.key();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const draft = JSON.parse(raw) as IssueDraft;
      return draft?.version === 1 && draft.fields ? draft : null;
    } catch {
      return null;
    }
  }

  save(draft: Omit<IssueDraft, 'version' | 'updatedAt'>): void {
    const key = this.key();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ ...draft, version: 1, updatedAt: new Date().toISOString() }));
    } catch {
      // Sin almacenamiento (modo privado o lleno): el formulario sigue funcionando sin borrador
    }
  }

  clear(): void {
    const key = this.key();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Nada que limpiar
    }
  }

  /** Hay algo escrito que valga la pena ofrecer para continuar. */
  static hasContent(fields: IssueDraftFields): boolean {
    return Boolean(fields.title.trim() || fields.description.trim() || fields.urgentMeasures.trim() || fields.categoryId);
  }

  static newRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // Respaldo para navegadores sin randomUUID (contexto no seguro)
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
