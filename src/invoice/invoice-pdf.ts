import PDFDocument from 'pdfkit';
import type { QuotationPdfInvoice, QuotationPdfItem, QuotationPdfOrg } from '../quotation/quotation-pdf.js';
import {
  drawRule,
  formatQuotationDate,
  money,
  pctInParens,
  tryFetchLogoBuffer,
} from '../quotation/quotation-pdf.js';

export type InvoicePdfPayment = {
  payment_date: string | null;
  payment_method: string | null;
  reference_number: string | null;
  amount: number;
  notes: string | null;
};

/**
 * Same layout as service quotations, plus a payments table and paid / balance summary.
 */
export async function buildInvoicePdfBuffer(params: {
  org: QuotationPdfOrg;
  invoice: QuotationPdfInvoice;
  items: QuotationPdfItem[];
  payments: InvoicePdfPayment[];
  amountPaidTotal: number;
  balanceDue: number;
}): Promise<Buffer> {
  const { org, invoice, items, payments, amountPaidTotal, balanceDue } = params;
  const logoBuffer = await tryFetchLogoBuffer(org.logo);

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const marginLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - marginLeft - doc.page.margins.right;
  let y = doc.page.margins.top;

  const headerTop = y;
  const logoSlotW = 108;
  const logoMaxH = 58;
  let headerBottom = headerTop;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, marginLeft, headerTop, { fit: [logoSlotW, logoMaxH] });
      headerBottom = Math.max(headerBottom, headerTop + logoMaxH);
    } catch {
      // skip logo
    }
  }

  const orgBlockX = marginLeft + (logoBuffer ? logoSlotW + 16 : 0);
  const orgBlockW = pageWidth - (orgBlockX - marginLeft);
  doc.fillColor('#000000');
  doc.fontSize(15).font('Helvetica-Bold');
  doc.text(org.company_name || 'Organization', orgBlockX, headerTop, {
    width: orgBlockW,
    align: 'right',
  });
  let orgY = doc.y + 5;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  if (org.address) {
    doc.text(org.address, orgBlockX, orgY, { width: orgBlockW, align: 'right' });
    orgY = doc.y + 3;
  }
  if (org.phone) {
    doc.text(`Phone: ${org.phone}`, orgBlockX, orgY, { width: orgBlockW, align: 'right' });
    orgY = doc.y + 3;
  }
  if (org.gst) {
    doc.text(`GST: ${org.gst}`, orgBlockX, orgY, { width: orgBlockW, align: 'right' });
    orgY = doc.y + 3;
  }
  if (org.pan) {
    doc.text(`PAN: ${org.pan}`, orgBlockX, orgY, { width: orgBlockW, align: 'right' });
    orgY = doc.y + 3;
  }
  headerBottom = Math.max(headerBottom, doc.y);
  doc.fillColor('#000000');

  y = headerBottom + 18;
  drawRule(doc, y, marginLeft, pageWidth);
  y += 14;

  doc.fontSize(17).font('Helvetica-Bold').fillColor('#1a1a1a');
  doc.text('INVOICE', marginLeft, y, { width: pageWidth, align: 'center' });
  y = doc.y + 12;
  drawRule(doc, y, marginLeft, pageWidth);
  y += 14;

  const colGap = 28;
  const colW = (pageWidth - colGap) / 2;
  const rightColX = marginLeft + colW + colGap;
  const sectionStartY = y;

  let leftY = sectionStartY;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
  doc.text('Bill to', marginLeft, leftY, { width: colW });
  leftY = doc.y + 5;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  doc.text(invoice.customer_name, marginLeft, leftY, { width: colW });
  leftY = doc.y + 4;
  if (invoice.customer_phone) {
    doc.text(invoice.customer_phone, marginLeft, leftY, { width: colW });
    leftY = doc.y + 4;
  }
  if (invoice.customer_address) {
    doc.text(invoice.customer_address, marginLeft, leftY, { width: colW });
    leftY = doc.y + 4;
  }
  const leftColBottom = doc.y;

  let rightY = sectionStartY;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
  doc.text('Invoice details', rightColX, rightY, { width: colW });
  rightY = doc.y + 5;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  doc.text(`Invoice no: ${invoice.invoice_number}`, rightColX, rightY, { width: colW });
  rightY = doc.y + 4;
  doc.text(`Date: ${formatQuotationDate(invoice.created_at)}`, rightColX, rightY, {
    width: colW,
  });
  const rightColBottom = doc.y;

  y = Math.max(leftColBottom, rightColBottom) + 16;
  drawRule(doc, y, marginLeft, pageWidth);
  y += 14;

  const colDesc = marginLeft;
  const colQty = marginLeft + pageWidth * 0.52;
  const colPrice = marginLeft + pageWidth * 0.66;
  const colTotal = marginLeft + pageWidth * 0.82;
  const descW = colQty - colDesc - 8;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
  doc.text('Item', colDesc, y);
  doc.text('Qty', colQty, y, { width: colPrice - colQty - 6, align: 'right' });
  doc.text('Price', colPrice, y, { width: colTotal - colPrice - 6, align: 'right' });
  doc.text('Total', colTotal, y, { width: marginLeft + pageWidth - colTotal, align: 'right' });
  y = doc.y + 6;
  drawRule(doc, y, marginLeft, pageWidth, '#aaaaaa', 0.5);
  y += 10;

  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 180;

  for (const row of items) {
    const block = [row.title];
    if (row.description) block.push(row.description);
    const itemText = block.join('\n');
    const h = doc.heightOfString(itemText, { width: descW });
    if (y + h > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.text(itemText, colDesc, y, { width: descW });
    const rowTop = y;
    doc.text(String(row.quantity), colQty, rowTop, {
      width: colPrice - colQty - 6,
      align: 'right',
    });
    doc.text(money(row.price), colPrice, rowTop, {
      width: colTotal - colPrice - 6,
      align: 'right',
    });
    doc.text(money(row.total), colTotal, rowTop, {
      width: marginLeft + pageWidth - colTotal,
      align: 'right',
    });
    y = Math.max(doc.y, rowTop + h) + 8;
  }

  if (items.length === 0) {
    doc.fillColor('#666666').text('No line items', colDesc, y);
    y = doc.y + 12;
    doc.fillColor('#000000');
  }

  y = Math.max(y, doc.y) + 16;
  if (y > bottomLimit) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  drawRule(doc, y, marginLeft, pageWidth);
  y += 14;

  const totalsX = marginLeft + pageWidth * 0.55;
  const labelW = pageWidth * 0.22;
  const valW = pageWidth * 0.23;
  const rowH = 30;
  const outerPad = 12;
  const colGutter = 10;
  const fontSize = 10;
  const rows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal', value: money(invoice.subtotal) },
    {
      label: `Discount${pctInParens(invoice.discount_percentage)}`,
      value: money(invoice.discount),
    },
    {
      label: `Tax${pctInParens(invoice.tax_percentage)}`,
      value: money(invoice.tax),
    },
    { label: 'Total', value: money(invoice.total), bold: true },
  ];

  const colSplitX = totalsX + labelW;
  const tableLeft = totalsX - outerPad;
  const tableRight = colSplitX + valW + outerPad;
  const tableW = tableRight - tableLeft;
  const tableTop = y;
  const tableH = rowH * rows.length;

  const labelTextX = tableLeft + outerPad;
  const labelTextW = Math.max(40, colSplitX - colGutter - labelTextX);
  const valueTextX = colSplitX + colGutter;
  const valueTextW = Math.max(40, tableRight - outerPad - valueTextX);
  const textBaselineOffset = (rowH - fontSize) / 2 + 1;

  const lastRowIndex = rows.length - 1;
  doc.save();
  doc.fillColor('#f2f2f2');
  doc.rect(tableLeft, tableTop + lastRowIndex * rowH, tableW, rowH).fill();
  doc.restore();

  doc.save();
  doc.strokeColor('#555555').lineWidth(0.65);
  doc.rect(tableLeft, tableTop, tableW, tableH).stroke();
  for (let i = 1; i < rows.length; i++) {
    const lineY = tableTop + i * rowH;
    doc.moveTo(tableLeft, lineY).lineTo(tableLeft + tableW, lineY).stroke();
  }
  doc.moveTo(colSplitX, tableTop).lineTo(colSplitX, tableTop + tableH).stroke();
  doc.restore();

  doc.fillColor('#000000').fontSize(fontSize);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const textY = tableTop + i * rowH + textBaselineOffset;
    if (r.bold) doc.font('Helvetica-Bold');
    else doc.font('Helvetica');
    doc.text(r.label, labelTextX, textY, { width: labelTextW, align: 'right' });
    doc.text(r.value, valueTextX, textY, { width: valueTextW, align: 'right' });
  }

  y = tableTop + tableH + 20;
  drawRule(doc, y, marginLeft, pageWidth);
  y += 14;

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a');
  doc.text('Payment history', marginLeft, y);
  y = doc.y + 10;

  const payDateW = pageWidth * 0.2;
  const payMethodW = pageWidth * 0.18;
  const payRefW = pageWidth * 0.28;
  const payAmtW = pageWidth * 0.16;
  const payNotesX = marginLeft + payDateW + payMethodW + payRefW + payAmtW + 8;
  const payNotesW = Math.max(60, marginLeft + pageWidth - payNotesX);

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
  doc.text('Date', marginLeft, y, { width: payDateW });
  doc.text('Method', marginLeft + payDateW, y, { width: payMethodW });
  doc.text('Reference', marginLeft + payDateW + payMethodW, y, { width: payRefW });
  doc.text('Amount', marginLeft + payDateW + payMethodW + payRefW, y, {
    width: payAmtW,
    align: 'right',
  });
  doc.text('Notes', payNotesX, y, { width: payNotesW });
  y = doc.y + 5;
  drawRule(doc, y, marginLeft, pageWidth, '#aaaaaa', 0.5);
  y += 8;

  doc.font('Helvetica').fontSize(8).fillColor('#333333');
  if (payments.length === 0) {
    doc.fillColor('#666666').text('No payments recorded yet.', marginLeft, y);
    y = doc.y + 10;
    doc.fillColor('#333333');
  } else {
    for (const p of payments) {
      const rowLines = [
        formatQuotationDate(p.payment_date),
        (p.payment_method ?? '—').replace(/_/g, ' '),
        p.reference_number?.trim() || '—',
        money(p.amount),
        p.notes?.trim() || '',
      ];
      const noteH = p.notes?.trim()
        ? doc.heightOfString(p.notes.trim(), { width: payNotesW })
        : 10;
      const rowH2 = Math.max(22, noteH + 4);
      if (y + rowH2 > doc.page.height - doc.page.margins.bottom - 72) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const y0 = y;
      doc.text(rowLines[0], marginLeft, y0, { width: payDateW });
      doc.text(rowLines[1], marginLeft + payDateW, y0, { width: payMethodW });
      doc.text(rowLines[2], marginLeft + payDateW + payMethodW, y0, { width: payRefW });
      doc.text(rowLines[3], marginLeft + payDateW + payMethodW + payRefW, y0, {
        width: payAmtW,
        align: 'right',
      });
      if (p.notes?.trim()) {
        doc.text(p.notes.trim(), payNotesX, y0, { width: payNotesW });
      }
      y = Math.max(y0 + rowH2, doc.y) + 4;
    }
  }

  y += 6;
  drawRule(doc, y, marginLeft, pageWidth);
  y += 12;

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
  doc.text(`Total paid: ${money(amountPaidTotal)}`, marginLeft, y);
  y = doc.y + 6;
  doc.text(`Balance due: ${money(balanceDue)}`, marginLeft, y);

  doc.end();
  return finished;
}
