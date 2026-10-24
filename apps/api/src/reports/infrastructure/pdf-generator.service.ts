import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ReportResponseDto } from '../presentation/dto/report-response.dto';

@Injectable()
export class PdfGeneratorService {
  /**
   * Genera el documento PDF oficial del informe utilizando PDFKit con protección contra cortes (CP-33, RF-036).
   */
  async generateReportPdf(
    report: ReportResponseDto,
    options?: {
      headerTitle?: string;
      headerSubtitle?: string;
      primaryColor?: string;
      secondaryColor?: string;
      footerText?: string;
      contactInfo?: string;
    },
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margins: { top: 50, bottom: 50, left: 45, right: 45 },
          bufferPages: true,
          info: {
            Title: `${report.code} - ${report.title}`,
            Author: report.createdByName,
            Subject: `Informe de Gestión Operativa - ${report.scope}`,
            Creator: 'EG S.A.S. - SIGPROH',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const opData = report.operationalData;
        const pageWidth = doc.page.width - 90; // 595.28 - 90 = 505.28 pt usable

        // Colores y textos de diseño institucional personalizables (RF-044, RF-045, RF-046)
        const primaryColor = options?.primaryColor || '#1B365D'; // Azul Marino de marca
        const secondaryColor = options?.secondaryColor || '#2D68C4'; // Azul Tecnológico de marca
        const headerTitle = options?.headerTitle || 'EG S.A.S. — PLATAFORMA SIGPROH';
        const headerSubtitle = options?.headerSubtitle || 'GESTIÓN Y CONTROL DE NOVEDADES OPERATIVAS';
        const globalFooterText = options?.footerText || 'EG S.A.S. — SIGPROH | Informe Oficial';
        const darkText = '#374151';
        const mutedText = '#6B7280';
        const lightBg = '#F3F4F6';
        const borderColor = '#E5E7EB';

        // Helper para comprobar salto de página y evitar cortes (CP-33)
        const checkPageBreak = (neededHeight: number) => {
          if (doc.y + neededHeight > doc.page.height - 60) {
            doc.addPage();
            renderRunningHeader();
          }
        };

        // Renderizado del encabezado recurrente para páginas subsecuentes
        const renderRunningHeader = () => {
          doc.save();
          doc
            .fontSize(8)
            .fillColor(mutedText)
            .text(
              `${headerTitle} | ${report.code} - ${report.title.substring(0, 45)}...`,
              45,
              30,
              { align: 'left', width: pageWidth / 2 },
            );
          doc.text(
            `Corte: ${report.cutoffDate} (UTC-5)`,
            45 + pageWidth / 2,
            30,
            { align: 'right', width: pageWidth / 2 },
          );
          doc
            .strokeColor(borderColor)
            .lineWidth(0.5)
            .moveTo(45, 42)
            .lineTo(45 + pageWidth, 42)
            .stroke();
          doc.restore();
          doc.y = 55;
        };

        // ==========================================
        // 1. ENCABEZADO INSTITUCIONAL DE PRIMERA PÁGINA
        // ==========================================
        doc
          .rect(45, 45, pageWidth, 6)
          .fill(primaryColor);

        doc.y = 60;
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text(headerTitle, 45, doc.y, { align: 'left' });

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(secondaryColor)
          .text(headerSubtitle, 45, doc.y + 3);

        if (options?.contactInfo) {
          doc
            .fontSize(8)
            .fillColor(mutedText)
            .text(`Contacto: ${options.contactInfo}`, 45, doc.y + 2);
        }

        doc.moveDown(0.8);


        // Título del informe y Código
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor(darkText)
          .text(report.title.toUpperCase(), 45, doc.y);

        doc.moveDown(0.4);

        // Barra de metadatos tipo tarjeta
        const metaBoxY = doc.y;
        doc
          .roundedRect(45, metaBoxY, pageWidth, 52, 4)
          .fillAndStroke(lightBg, borderColor);

        doc
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text(`CÓDIGO: ${report.code}`, 55, metaBoxY + 8)
          .text(`VERSIÓN: v${report.version}`, 200, metaBoxY + 8)
          .text(`ESTADO: ${report.status}`, 340, metaBoxY + 8);

        let locationLabel = `ÁMBITO: ${report.scope}`;
        if (report.propertyName) {
          locationLabel += ` | PROPIEDAD: ${report.propertyName}`;
        } else if (report.internalAreaName) {
          locationLabel += ` | ÁREA: ${report.internalAreaName}`;
        }

        doc
          .font('Helvetica')
          .fillColor(darkText)
          .text(locationLabel, 55, metaBoxY + 22)
          .text(
            `PERIODO: ${report.periodStart} al ${report.periodEnd} | CORTE (CP-34): ${report.cutoffDate} (UTC-5)`,
            55,
            metaBoxY + 36,
          );

        doc.y = metaBoxY + 62;

        // ==========================================
        // 2. INTRODUCCIÓN (Si está habilitada)
        // ==========================================
        if (report.showIntroduction && report.introduction) {
          checkPageBreak(80);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text('1. INTRODUCCIÓN', 45, doc.y);
          doc.moveDown(0.3);
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(darkText)
            .text(report.introduction, { align: 'justify', lineGap: 2 });
          doc.moveDown(0.8);
        }

        // ==========================================
        // 3. INDICADORES CLAVE (KPIs)
        // ==========================================
        if (report.showKpis && opData?.kpis) {
          checkPageBreak(110);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text('2. RESUMEN EJECUTIVO DE INDICADORES (CP-34)', 45, doc.y);
          doc.moveDown(0.4);

          const kpis = [
            {
              label: 'Registradas en Periodo',
              val: String(opData.kpis.totalRegisteredInPeriod),
              color: '#2D68C4',
            },
            {
              label: 'Cerradas en Periodo',
              val: String(opData.kpis.totalClosedInPeriod),
              color: '#10B981',
            },
            {
              label: 'Abiertas al Corte (CP-34)',
              val: String(opData.kpis.totalOpenAtCutoff),
              color: '#F59E0B',
            },
            {
              label: 'Novedades Críticas',
              val: String(opData.kpis.totalCriticalInPeriod),
              color: '#EF4444',
            },
            {
              label: 'Tiempo Promedio Res.',
              val: `${opData.kpis.averageResolutionDays}d (${opData.kpis.averageResolutionHours}h)`,
              color: '#1B365D',
            },
            {
              label: 'Cumplimiento Actividades',
              val: `${opData.activities?.completionRatePercent || 0}%`,
              color: '#8B5CF6',
            },
          ];

          const cardWidth = (pageWidth - 20) / 3;
          const cardHeight = 36;
          const startKpiY = doc.y;

          kpis.forEach((kpi, index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const x = 45 + col * (cardWidth + 10);
            const y = startKpiY + row * (cardHeight + 8);

            doc
              .roundedRect(x, y, cardWidth, cardHeight, 4)
              .fillAndStroke(lightBg, borderColor);

            doc
              .fontSize(11)
              .font('Helvetica-Bold')
              .fillColor(kpi.color)
              .text(kpi.val, x + 8, y + 6);

            doc
              .fontSize(7.5)
              .font('Helvetica')
              .fillColor(mutedText)
              .text(kpi.label, x + 8, y + 21, { width: cardWidth - 16 });
          });

          doc.y = startKpiY + 2 * (cardHeight + 8) + 8;
        }

        // ==========================================
        // 4. RELACIÓN DE NOVEDADES
        // ==========================================
        if (report.showIssuesList && opData?.issuesList && opData.issuesList.length > 0) {
          checkPageBreak(90);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text(`3. RELACIÓN DE NOVEDADES (${opData.issuesList.length} CASOS)`, 45, doc.y);
          doc.moveDown(0.4);

          // Cabecera de la tabla
          const colWidths = [70, 160, 75, 55, 65, 80]; // Total: 505 pt
          const renderTableHeader = (headerY: number) => {
            doc
              .rect(45, headerY, pageWidth, 16)
              .fill(primaryColor);
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF');
            doc.text('CÓDIGO', 50, headerY + 4, { width: colWidths[0] });
            doc.text('TÍTULO / UBICACIÓN', 50 + colWidths[0], headerY + 4, { width: colWidths[1] });
            doc.text('CATEGORÍA', 50 + colWidths[0] + colWidths[1], headerY + 4, { width: colWidths[2] });
            doc.text('PRIORIDAD', 50 + colWidths[0] + colWidths[1] + colWidths[2], headerY + 4, { width: colWidths[3] });
            doc.text('ESTADO', 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], headerY + 4, { width: colWidths[4] });
            doc.text('FECHAS / RESP.', 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], headerY + 4, { width: colWidths[5] });
          };

          renderTableHeader(doc.y);
          let currentY = doc.y + 18;

          for (const issue of opData.issuesList) {
            // Estimar altura de la fila para evitar cortes (CP-33)
            const rowHeight = 26;
            if (currentY + rowHeight > doc.page.height - 60) {
              doc.addPage();
              renderRunningHeader();
              renderTableHeader(doc.y);
              currentY = doc.y + 18;
            }

            // Alternar color de fondo
            doc
              .rect(45, currentY, pageWidth, rowHeight)
              .fillAndStroke(lightBg, borderColor);

            doc.fontSize(7.5).font('Helvetica-Bold').fillColor(primaryColor);
            doc.text(issue.code, 50, currentY + 4, { width: colWidths[0] });

            doc.font('Helvetica-Bold').fillColor(darkText);
            doc.text(
              issue.title.length > 32 ? issue.title.substring(0, 30) + '...' : issue.title,
              50 + colWidths[0],
              currentY + 4,
              { width: colWidths[1] },
            );
            doc.font('Helvetica').fillColor(mutedText);
            doc.text(
              issue.locationName,
              50 + colWidths[0],
              currentY + 14,
              { width: colWidths[1] },
            );

            doc.font('Helvetica').fillColor(darkText);
            doc.text(issue.categoryName, 50 + colWidths[0] + colWidths[1], currentY + 4, { width: colWidths[2] });

            // Color para prioridad
            let prioColor = '#2D68C4';
            if (issue.priority === 'CRITICA') prioColor = '#EF4444';
            else if (issue.priority === 'ALTA') prioColor = '#F59E0B';
            doc.font('Helvetica-Bold').fillColor(prioColor);
            doc.text(issue.priority, 50 + colWidths[0] + colWidths[1] + colWidths[2], currentY + 4, { width: colWidths[3] });

            doc.font('Helvetica').fillColor(darkText);
            doc.text(issue.status, 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], currentY + 4, { width: colWidths[4] });

            doc.font('Helvetica').fillColor(mutedText);
            doc.text(
              `Reg: ${issue.createdAt.split('T')[0]}`,
              50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
              currentY + 4,
              { width: colWidths[5] },
            );
            doc.text(
              issue.assignedUserName ? issue.assignedUserName.split(' ')[0] : 'Sin Asignar',
              50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
              currentY + 14,
              { width: colWidths[5] },
            );

            currentY += rowHeight + 2;
          }

          doc.y = currentY + 8;
        }

        // ==========================================
        // 5. DETALLE DE ACTIVIDADES (Si está habilitado)
        // ==========================================
        if (
          report.showActivities &&
          opData?.activitiesList &&
          opData.activitiesList.length > 0
        ) {
          checkPageBreak(80);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text(`4. GESTIONES Y ACTIVIDADES OPERATIVAS (${opData.activitiesList.length})`, 45, doc.y);
          doc.moveDown(0.4);

          for (const act of opData.activitiesList.slice(0, 20)) {
            checkPageBreak(28);
            doc
              .roundedRect(45, doc.y, pageWidth, 24, 3)
              .fillAndStroke('#FAFAFA', borderColor);

            const itemY = doc.y;
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor(secondaryColor);
            doc.text(`[${act.issueCode}] ${act.title}`, 52, itemY + 4, { width: 300 });

            doc.font('Helvetica').fillColor(mutedText);
            doc.text(
              `Asignado: ${act.assignedUserName || 'N/A'} | Estado: ${act.status}`,
              52,
              itemY + 13,
              { width: 300 },
            );

            doc.text(
              act.completedAt ? `Completada: ${act.completedAt.split('T')[0]}` : `Límite: ${act.dueDate ? act.dueDate.split('T')[0] : 'N/A'}`,
              370,
              itemY + 8,
              { width: 125, align: 'right' },
            );

            doc.y = itemY + 28;
          }
          doc.moveDown(0.5);
        }

        // ==========================================
        // 6. EVIDENCIAS SELECCIONADAS (Si están habilitadas)
        // ==========================================
        if (report.showEvidences && report.selectedAttachmentIds.length > 0) {
          checkPageBreak(80);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text(
              `5. EVIDENCIAS AUTORIZADAS SELECCIONADAS (${report.selectedAttachmentIds.length})`,
              45,
              doc.y,
            );
          doc.moveDown(0.4);

          const selectedEvs = (opData?.availableEvidences || []).filter((e) =>
            report.selectedAttachmentIds.includes(e.id),
          );

          for (const ev of selectedEvs) {
            checkPageBreak(30);
            doc
              .roundedRect(45, doc.y, pageWidth, 26, 3)
              .fillAndStroke(lightBg, borderColor);

            const evY = doc.y;
            doc.fontSize(8).font('Helvetica-Bold').fillColor(darkText);
            doc.text(`[${ev.issueCode}] ${ev.fileName}`, 52, evY + 4, { width: 340 });

            doc.font('Helvetica').fillColor(mutedText);
            doc.text(
              `Etapa: ${ev.stage} | Tipo: ${ev.mimeType} | Tamaño: ${Math.round(ev.fileSize / 1024)} KB | Subido: ${ev.createdAt.split('T')[0]}`,
              52,
              evY + 14,
              { width: 440 },
            );

            doc.y = evY + 30;
          }
          doc.moveDown(0.5);
        }

        // ==========================================
        // 7. OBSERVACIONES Y RECOMENDACIONES
        // ==========================================
        if (report.showObservations && report.observations) {
          checkPageBreak(70);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text('6. OBSERVACIONES GENERALES', 45, doc.y);
          doc.moveDown(0.3);
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(darkText)
            .text(report.observations, { align: 'justify', lineGap: 2 });
          doc.moveDown(0.8);
        }

        if (report.showRecommendations && report.recommendations) {
          checkPageBreak(70);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text('7. RECOMENDACIONES TÉCNICAS Y OPERATIVAS', 45, doc.y);
          doc.moveDown(0.3);
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(darkText)
            .text(report.recommendations, { align: 'justify', lineGap: 2 });
          doc.moveDown(0.8);
        }

        if (report.showFinalComments && report.finalComments) {
          checkPageBreak(70);
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text('8. COMENTARIOS FINALES', 45, doc.y);
          doc.moveDown(0.3);
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(darkText)
            .text(report.finalComments, { align: 'justify', lineGap: 2 });
          doc.moveDown(0.8);
        }

        // ==========================================
        // 8. CONTROL DE VERSIÓN Y FIRMA
        // ==========================================
        checkPageBreak(65);
        const signBoxY = doc.y;
        doc
          .roundedRect(45, signBoxY, pageWidth, 48, 4)
          .fillAndStroke(lightBg, borderColor);

        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text('CONTROL DOCUMENTAL Y VALIDEZ DEL INFORME', 55, signBoxY + 8);

        doc
          .font('Helvetica')
          .fillColor(darkText)
          .text(
            `Elaborado por: ${report.createdByName} | Fecha: ${report.createdAt.split('T')[0]} | Versión: v${report.version}`,
            55,
            signBoxY + 20,
          );

        const approvalText = report.approvedByName
          ? `Aprobado por: ${report.approvedByName} el ${report.approvedAt ? report.approvedAt.split('T')[0] : 'N/A'}${report.pdfSha256 ? ` | Integridad SHA-256: ${report.pdfSha256.substring(0, 16)}...` : ''}`
          : 'Documento en estado Borrador / Revisión preliminar (No constituye aprobación oficial definitiva)';

        doc
          .font('Helvetica')
          .fillColor(mutedText)
          .text(approvalText, 55, signBoxY + 32);

        // ==========================================
        // 9. PIE DE PÁGINA GLOBAL (PÁGINA X DE Y)
        // ==========================================
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc
            .strokeColor(borderColor)
            .lineWidth(0.5)
            .moveTo(45, doc.page.height - 35)
            .lineTo(45 + pageWidth, doc.page.height - 35)
            .stroke();

          doc
            .fontSize(8)
            .fillColor(mutedText)
            .text(
              `${globalFooterText} | ${report.code}`,
              45,
              doc.page.height - 25,
              { align: 'left', width: pageWidth / 2 },
            );

          doc.text(
            `Página ${i + 1} de ${range.count}`,
            45 + pageWidth / 2,
            doc.page.height - 25,
            { align: 'right', width: pageWidth / 2 },
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
