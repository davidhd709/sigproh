/**
 * Configuración provisional para la gestión de archivos y evidencias (F4 / PEN-07).
 *
 * NOTA IMPORTANTE (PEN-07):
 * El punto PEN-07 continúa pendiente de definición formal por parte del cliente.
 * Los formatos permitidos, tamaños máximos, cuotas por novedad y tipo de almacenamiento
 * aquí definidos constituyen una CONFIGURACIÓN PROVISIONAL técnica de referencia,
 * y NO deben presentarse como decisiones de negocio aprobadas ni definitivas.
 */
export const PROVISIONAL_FILE_POLICY = {
  isProvisional: true,
  penReference: 'PEN-07',
  disclaimer:
    'Configuración provisional sujeta a aprobación formal del cliente en PEN-07. No constituye decisión definitiva.',
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB provisional
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  ],
  maxAttachmentsPerIssue: 20, // provisional
  storageProvider: 'LOCAL_PRIVATE', // Almacenamiento privado; las rutas físicas NUNCA se exponen a los clientes
} as const;
