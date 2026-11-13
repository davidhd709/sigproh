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

/**
 * Devuelve por qué se rechaza el archivo y cómo corregirlo, o null si es válido.
 * Se muestra tal cual a quien reporta, que puede no saber qué es un «formato».
 */
export function fileRejection(file: File, allowed: readonly string[] = ALLOWED_TYPES): string | null {
  const onlyImages = allowed.every((t) => t.startsWith('image/'));
  if (!allowed.includes(file.type)) {
    return onlyImages
      ? `«${file.name}» no es una foto que podamos recibir. Elige una foto JPG, PNG o WEBP; en iPhone, ` +
          'activa Ajustes › Cámara › Formatos › «Más compatible».'
      : `«${file.name}» no se puede adjuntar. Usa una foto (JPG, PNG o WEBP) o un documento PDF, Word o Excel.`;
  }
  if (file.size > FILE_POLICY.maxFileSizeBytes) {
    return (
      `«${file.name}» pesa ${formatBytes(file.size)} y el máximo es ${MAX_SIZE_LABEL}. ` +
      (file.type.startsWith('image/')
        ? 'Toma la foto de nuevo con menor resolución o envíala por otro medio y adjúntala después.'
        : 'Reduce el tamaño del archivo o adjunta solo las páginas necesarias.')
    );
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
