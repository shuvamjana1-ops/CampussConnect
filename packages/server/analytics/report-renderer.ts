// Renders report content to CSV (`csv-stringify`) or PDF (`pdfmake`). Both libraries load on first use.

import type { ReportFormat } from '@campusconnect/contracts';
import type { ReportContent, RenderedReport, ReportRenderer } from './report.types';

const HEADER = ['Department', 'Priority band', 'Created', 'Resolved', 'Escalated', 'SLA breached'] as const;

function tableRows(content: ReportContent): (string | number)[][] {
  return content.rows.map((r) => [r.department, r.band, r.created, r.resolved, r.escalated, r.breached]);
}

/** Cells that start with a formula character are prefixed so spreadsheets do not execute them. */
function csvSafe(cell: string | number): string | number {
  return typeof cell === 'string' && /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

type CsvStringify = (rows: readonly (readonly (string | number)[])[]) => string;

interface PdfDocument {
  on(event: 'data', listener: (chunk: Uint8Array) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (error: unknown) => void): void;
  end(): void;
}

type PdfPrinterCtor = new (fonts: Record<string, Record<string, string>>) => {
  createPdfKitDocument(definition: Record<string, unknown>): PdfDocument;
};

export class DefaultReportRenderer implements ReportRenderer {
  async render(format: ReportFormat, content: ReportContent): Promise<RenderedReport> {
    return format === 'csv' ? this.renderCsv(content) : this.renderPdf(content);
  }

  private async renderCsv(content: ReportContent): Promise<RenderedReport> {
    const specifier = 'csv-stringify/sync';
    const { stringify } = (await import(specifier)) as { stringify: CsvStringify };
    const text = stringify([[...HEADER], ...tableRows(content).map((row) => row.map(csvSafe))]);
    return { body: new TextEncoder().encode(text), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
  }

  private async renderPdf(content: ReportContent): Promise<RenderedReport> {
    const specifier = 'pdfmake';
    const module = (await import(specifier)) as { default: PdfPrinterCtor };
    const printer = new module.default({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
    const definition = {
      defaultStyle: { font: 'Helvetica', fontSize: 9 },
      content: [
        { text: content.title, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        { text: `${content.periodStart} to ${content.periodEnd}`, margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [HEADER.map((h) => ({ text: h, bold: true })), ...tableRows(content).map((r) => r.map(String))],
          },
        },
      ],
    };
    const document = printer.createPdfKitDocument(definition);
    const chunks: Uint8Array[] = [];
    const body = await new Promise<Uint8Array>((resolve, reject) => {
      document.on('data', (chunk) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.end();
    });
    return { body, contentType: 'application/pdf', extension: 'pdf' };
  }
}
