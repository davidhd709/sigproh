-- Flujo simplificado de novedades: Por asignar (EN_REVISION) -> En proceso (EN_ATENCION) -> Cerrada.
-- ASIGNADA y PENDIENTE_CIERRE dejan de usarse; las novedades en esos estados pasan a "en proceso".
UPDATE "issues" SET "status" = 'EN_ATENCION', "updatedAt" = NOW()
WHERE "status" IN ('ASIGNADA', 'PENDIENTE_CIERRE');

-- Sin el paso de devolución, las novedades devueltas vuelven a "por asignar".
UPDATE "issues" SET "status" = 'EN_REVISION', "updatedAt" = NOW()
WHERE "status" = 'REGISTRADA';
