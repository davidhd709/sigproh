/**
 * Espejo en el cliente de PROVISIONAL_FILE_POLICY del backend
 * (apps/api/src/issues/infrastructure/provisional-file-policy.config.ts, PEN-07).
 * El backend es quien valida; aquí solo se avisa antes de subir. Mantener ambos sincronizados.
 */
export const FILE_POLICY = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxAttachmentsPerIssue: 20,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  documentTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
} as const;

export const ALLOWED_TYPES: readonly string[] = [...FILE_POLICY.imageTypes, ...FILE_POLICY.documentTypes];

/** Valor para el atributo `accept` de los campos de archivo. */
export const ACCEPT_IMAGES = FILE_POLICY.imageTypes.join(',');
export const ACCEPT_ANY = ALLOWED_TYPES.join(',');

export const ALLOWED_FORMATS_LABEL = 'JPG, PNG, WEBP, PDF, Word o Excel';
export const MAX_SIZE_LABEL = '10 MB';

/** Devuelve el motivo de rechazo o null si el archivo es válido. */
export function fileRejection(file: File, allowed: readonly string[] = ALLOWED_TYPES): string | null {
  if (!allowed.includes(file.type)) return `«${file.name}» no es un formato permitido.`;
  if (file.size > FILE_POLICY.maxFileSizeBytes) return `«${file.name}» supera ${MAX_SIZE_LABEL}.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
