-- Flujo de novedades: Pendiente (ASIGNADA) -> En proceso (EN_ATENCION) -> Finalizada (CERRADA).
-- El responsable marca el inicio del trabajo; queda en el historial con este evento.
ALTER TYPE "IssueEventType" ADD VALUE 'INICIO_TRABAJO' AFTER 'REASIGNACION';
