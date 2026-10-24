import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportResponseDto } from '../presentation/dto/report-response.dto';

@Injectable()
export class ExcelGeneratorService {
  /**
   * Genera el libro de Excel (.xlsx) estructurado y estilizado con los datos operativos autorizados del informe (RF-043, RN-098).
   */
  async generateReportExcel(report: ReportResponseDto): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SIGPROH - EG S.A.S.';
    workbook.created = new Date();

    const opData = report.operationalData;

    // Colores corporativos EG S.A.S.
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B365D' }, // Azul Marino de marca
    };
    const subHeaderFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D68C4' }, // Azul Tecnológico de marca
    };
    const headerFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    const titleFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 14,
      bold: true,
      color: { argb: 'FF1B365D' },
    };
    const boldFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 11,
      bold: true,
    };
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    // ==========================================
    // HOJA 1: RESUMEN EJECUTIVO E INDICADORES
    // ==========================================
    const summarySheet = workbook.addWorksheet('Resumen Ejecutivo');
    summarySheet.views = [{ showGridLines: true }];

    // Título institucional
    summarySheet.addRow(['EG S.A.S. — PLATAFORMA SIGPROH']);
    summarySheet.getCell('A1').font = titleFont;
    summarySheet.addRow([`INFORME OPERATIVO: ${report.title.toUpperCase()}`]);
    summarySheet.getCell('A2').font = boldFont;
    summarySheet.addRow([`Código: ${report.code} | Versión: v${report.version} | Estado: ${report.status}`]);
    summarySheet.addRow([]);

    // Metadatos
    summarySheet.addRow(['METADATOS DEL INFORME', '']);
    const metaRow = summarySheet.lastRow!;
    metaRow.getCell(1).fill = subHeaderFill;
    metaRow.getCell(1).font = headerFont;
    metaRow.getCell(2).fill = subHeaderFill;

    summarySheet.addRow(['Ámbito:', report.scope]);
    if (report.propertyName) {
      summarySheet.addRow(['Propiedad:', `${report.propertyName} (${report.propertyCode || ''})`]);
    }
    if (report.internalAreaName) {
      summarySheet.addRow(['Área Interna:', `${report.internalAreaName} (${report.internalAreaCode || ''})`]);
    }
    summarySheet.addRow(['Periodo de Análisis:', `${report.periodStart} al ${report.periodEnd}`]);
    summarySheet.addRow(['Fecha de Corte (CP-34):', `${report.cutoffDate} (Zona Horaria Colombia UTC-5)`]);
    summarySheet.addRow(['Elaborado por:', report.createdByName]);
    summarySheet.addRow(['Fecha de Generación:', new Date().toISOString()]);
    summarySheet.addRow([]);

    // Indicadores Clave (KPIs)
    if (opData?.kpis) {
      summarySheet.addRow(['INDICADOR OPERATIVO', 'VALOR']);
      const kpiHeader = summarySheet.lastRow!;
      kpiHeader.getCell(1).fill = headerFill;
      kpiHeader.getCell(1).font = headerFont;
      kpiHeader.getCell(2).fill = headerFill;
      kpiHeader.getCell(2).font = headerFont;

      const kpiItems = [
        ['Novedades Registradas en el Periodo', opData.kpis.totalRegisteredInPeriod],
        ['Novedades Cerradas en el Periodo', opData.kpis.totalClosedInPeriod],
        ['Novedades Abiertas a la Fecha de Corte (CP-34)', opData.kpis.totalOpenAtCutoff],
        ['Novedades Críticas Registradas', opData.kpis.totalCriticalInPeriod],
        ['Novedades Descartadas', opData.kpis.totalDiscardedInPeriod],
        ['Tiempo Promedio de Resolución (Horas)', opData.kpis.averageResolutionHours],
        ['Tiempo Promedio de Resolución (Días)', opData.kpis.averageResolutionDays],
        ['Total Actividades Operativas', opData.activities?.totalActivities || 0],
        ['Actividades Completadas', opData.activities?.completed || 0],
        ['Tasa de Cumplimiento de Actividades (%)', `${opData.activities?.completionRatePercent || 0}%`],
      ];

      for (const [name, val] of kpiItems) {
        const row = summarySheet.addRow([name, val]);
        row.getCell(1).border = thinBorder;
        row.getCell(2).border = thinBorder;
        row.getCell(2).alignment = { horizontal: 'right' };
      }
      summarySheet.addRow([]);
    }

    // Distribución por Estado
    if (opData?.byStatus && opData.byStatus.length > 0) {
      summarySheet.addRow(['ESTADO', 'CANTIDAD', 'PORCENTAJE']);
      const stHeader = summarySheet.lastRow!;
      stHeader.getCell(1).fill = subHeaderFill;
      stHeader.getCell(1).font = headerFont;
      stHeader.getCell(2).fill = subHeaderFill;
      stHeader.getCell(2).font = headerFont;
      stHeader.getCell(3).fill = subHeaderFill;
      stHeader.getCell(3).font = headerFont;

      for (const item of opData.byStatus) {
        const row = summarySheet.addRow([item.status, item.count, `${item.percentage}%`]);
        row.getCell(1).border = thinBorder;
        row.getCell(2).border = thinBorder;
        row.getCell(3).border = thinBorder;
        row.getCell(2).alignment = { horizontal: 'right' };
        row.getCell(3).alignment = { horizontal: 'right' };
      }
      summarySheet.addRow([]);
    }

    summarySheet.getColumn(1).width = 45;
    summarySheet.getColumn(2).width = 25;
    summarySheet.getColumn(3).width = 20;

    // ==========================================
    // HOJA 2: NOVEDADES DETALLADAS
    // ==========================================
    const issuesSheet = workbook.addWorksheet('Novedades');
    issuesSheet.views = [{ showGridLines: true }];

    const issueColumns = [
      'Código',
      'Ámbito',
      'Ubicación',
      'Categoría',
      'Prioridad',
      'Estado',
      'Título',
      'Descripción',
      'Reportado Por',
      'Responsable Asignado',
      'Fecha Registro',
      'Fecha Cierre',
      'N° Actividades',
      'N° Evidencias',
    ];

    const issueHeaderRow = issuesSheet.addRow(issueColumns);
    issueHeaderRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    if (opData?.issuesList && opData.issuesList.length > 0) {
      for (const issue of opData.issuesList) {
        const row = issuesSheet.addRow([
          issue.code,
          issue.scope,
          issue.locationName,
          issue.categoryName,
          issue.priority,
          issue.status,
          issue.title,
          issue.description,
          issue.createdByName,
          issue.assignedUserName || 'Sin Asignar',
          issue.createdAt.split('T')[0],
          issue.closedAt ? issue.closedAt.split('T')[0] : 'N/A',
          issue.activitiesCount,
          issue.evidencesCount,
        ]);
        row.eachCell((cell) => {
          cell.border = thinBorder;
        });
      }
    }

    // Auto-ajustar anchos de columnas
    issuesSheet.columns.forEach((col, idx) => {
      let maxLen = issueColumns[idx]?.length || 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen && len < 60) maxLen = len;
      });
      col.width = Math.max(maxLen + 3, 12);
    });

    // ==========================================
    // HOJA 3: ACTIVIDADES OPERATIVAS
    // ==========================================
    const activitiesSheet = workbook.addWorksheet('Actividades');
    activitiesSheet.views = [{ showGridLines: true }];

    const actColumns = [
      'Código Novedad',
      'Título Novedad',
      'Título Actividad',
      'Descripción',
      'Estado',
      'Motivo de Estado',
      'Asignado a',
      'Fecha Límite',
      'Fecha Completada',
      'Fecha Registro',
    ];

    const actHeaderRow = activitiesSheet.addRow(actColumns);
    actHeaderRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    if (opData?.activitiesList && opData.activitiesList.length > 0) {
      for (const act of opData.activitiesList) {
        const row = activitiesSheet.addRow([
          act.issueCode,
          act.issueTitle,
          act.title,
          act.description,
          act.status,
          act.statusReason || '',
          act.assignedUserName || 'Sin Asignar',
          act.dueDate ? act.dueDate.split('T')[0] : 'N/A',
          act.completedAt ? act.completedAt.split('T')[0] : 'N/A',
          act.createdAt.split('T')[0],
        ]);
        row.eachCell((cell) => {
          cell.border = thinBorder;
        });
      }
    }

    activitiesSheet.columns.forEach((col, idx) => {
      let maxLen = actColumns[idx]?.length || 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen && len < 60) maxLen = len;
      });
      col.width = Math.max(maxLen + 3, 12);
    });

    // ==========================================
    // HOJA 4: EVIDENCIAS AUTORIZADAS
    // ==========================================
    const evidencesSheet = workbook.addWorksheet('Evidencias');
    evidencesSheet.views = [{ showGridLines: true }];

    const evColumns = [
      'Código Novedad',
      'Etapa',
      'Nombre de Archivo',
      'Tamaño (KB)',
      'Tipo MIME',
      'Subido Por',
      'Fecha de Registro',
    ];

    const evHeaderRow = evidencesSheet.addRow(evColumns);
    evHeaderRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    if (opData?.availableEvidences && opData.availableEvidences.length > 0) {
      for (const ev of opData.availableEvidences) {
        const row = evidencesSheet.addRow([
          ev.issueCode,
          ev.stage,
          ev.fileName,
          Math.round(ev.fileSize / 1024),
          ev.mimeType,
          ev.uploadedByName,
          ev.createdAt.split('T')[0],
        ]);
        row.eachCell((cell) => {
          cell.border = thinBorder;
        });
      }
    }

    evidencesSheet.columns.forEach((col, idx) => {
      let maxLen = evColumns[idx]?.length || 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen && len < 60) maxLen = len;
      });
      col.width = Math.max(maxLen + 3, 12);
    });

    // ==========================================
    // HOJA 5: TEXTOS NARRATIVOS (Si existen)
    // ==========================================
    if (
      report.introduction ||
      report.observations ||
      report.recommendations ||
      report.finalComments
    ) {
      const textsSheet = workbook.addWorksheet('Observaciones y Textos');
      textsSheet.views = [{ showGridLines: true }];

      textsSheet.addRow(['SECCIONES REDACTADAS DEL INFORME']);
      textsSheet.getCell('A1').font = titleFont;
      textsSheet.addRow([]);

      const sections = [
        ['INTRODUCCIÓN', report.introduction],
        ['OBSERVACIONES GENERALES', report.observations],
        ['RECOMENDACIONES', report.recommendations],
        ['COMENTARIOS FINALES', report.finalComments],
      ];

      for (const [title, content] of sections) {
        if (content) {
          const header = textsSheet.addRow([title]);
          header.getCell(1).fill = subHeaderFill;
          header.getCell(1).font = headerFont;
          const bodyRow = textsSheet.addRow([content]);
          bodyRow.getCell(1).alignment = { wrapText: true };
          textsSheet.addRow([]);
        }
      }

      textsSheet.getColumn(1).width = 90;
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }
}
