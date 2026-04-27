import PDFDocument from 'pdfkit';

export type QuotationPdfOrg = {
  company_name: string | null;
  logo: string | null;
  gst: string | null;
  pan: string | null;
  address: string | null;
  phone: string | null;
};

export type QuotationPdfInvoice = {
  invoice_number: string;
  type: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  created_at?: string | null;
};

export type QuotationPdfItem = {
  title: string;
  description: string | null;
  quantity: number;
  price: number;
  total: number;
};

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function formatQuotationDate(iso: string | null | undefined): string {
  if (!iso) return new Date().toLocaleDateString();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toLocaleDateString() : d.toLocaleDateString();
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function drawRule(
  doc: PdfDoc,
  y: number,
  left: number,
  width: number,
  color = '#bbbbbb',
  lineWidth = 0.75,
) {
  doc.save();
  doc.strokeColor(color).lineWidth(lineWidth);
  doc.moveTo(left, y).lineTo(left + width, y).stroke();
  doc.restore();
}

async function tryFetchLogoBuffer(logoUrl: string | null | undefined): Promise<Buffer | null> {
  const trimmed = logoUrl?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(trimmed, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'SmartechBackend/1.0 (quotation-pdf)',
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Builds a single-page (or multi-page if many lines) quotation PDF buffer.
 */
export async function buildQuotationPdfBuffer(params: {
  org: QuotationPdfOrg;
  invoice: QuotationPdfInvoice;
  items: QuotationPdfItem[];
}): Promise<Buffer> {
  const { org, invoice, items } = params;
  const logoBuffer = await tryFetchLogoBuffer(org.logo);

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  let y = doc.page.margins.top;

  // --- Header: logo left, organization details right ---
  const headerTop = y;
  const logoSlotW = 108;
  const logoMaxH = 58;
  let headerBottom = headerTop;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, left, headerTop, { fit: [logoSlotW, logoMaxH] });
      headerBottom = Math.max(headerBottom, headerTop + logoMaxH);
    } catch {
      // Unsupported or corrupt image — skip logo
    }
  }

  const orgBlockX = left + (logoBuffer ? logoSlotW + 16 : 0);
  const orgBlockW = pageWidth - (orgBlockX - left);
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
  drawRule(doc, y, left, pageWidth);
  y += 14;

  // --- "Quotation" title block (centered, slightly smaller) ---
  doc.fontSize(17).font('Helvetica-Bold').fillColor('#1a1a1a');
  doc.text('QUOTATION', left, y, { width: pageWidth, align: 'center' });
  y = doc.y + 12;
  drawRule(doc, y, left, pageWidth);
  y += 14;

  // --- Billing (left) | Quotation details (right) ---
  const colGap = 28;
  const colW = (pageWidth - colGap) / 2;
  const rightColX = left + colW + colGap;
  const sectionStartY = y;

  let leftY = sectionStartY;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
  doc.text('Bill to', left, leftY, { width: colW });
  leftY = doc.y + 5;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  doc.text(invoice.customer_name, left, leftY, { width: colW });
  leftY = doc.y + 4;
  if (invoice.customer_phone) {
    doc.text(invoice.customer_phone, left, leftY, { width: colW });
    leftY = doc.y + 4;
  }
  if (invoice.customer_address) {
    doc.text(invoice.customer_address, left, leftY, { width: colW });
    leftY = doc.y + 4;
  }
  const leftColBottom = doc.y;

  let rightY = sectionStartY;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
  doc.text('Quotation details', rightColX, rightY, { width: colW });
  rightY = doc.y + 5;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  doc.text(`Quotation no: ${invoice.invoice_number}`, rightColX, rightY, { width: colW });
  rightY = doc.y + 4;
  doc.text(`Date: ${formatQuotationDate(invoice.created_at)}`, rightColX, rightY, {
    width: colW,
  });
  const rightColBottom = doc.y;

  y = Math.max(leftColBottom, rightColBottom) + 16;
  drawRule(doc, y, left, pageWidth);
  y += 14;

  // --- Line items ---
  const colDesc = left;
  const colQty = left + pageWidth * 0.52;
  const colPrice = left + pageWidth * 0.66;
  const colTotal = left + pageWidth * 0.82;
  const descW = colQty - colDesc - 8;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
  doc.text('Item', colDesc, y);
  doc.text('Qty', colQty, y, { width: colPrice - colQty - 6, align: 'right' });
  doc.text('Price', colPrice, y, { width: colTotal - colPrice - 6, align: 'right' });
  doc.text('Total', colTotal, y, { width: left + pageWidth - colTotal, align: 'right' });
  y = doc.y + 6;
  drawRule(doc, y, left, pageWidth, '#aaaaaa', 0.5);
  y += 10;

  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 120;

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
      width: left + pageWidth - colTotal,
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

  drawRule(doc, y, left, pageWidth);
  y += 14;

  const totalsX = left + pageWidth * 0.55;
  const labelW = pageWidth * 0.22;
  const valW = pageWidth * 0.23;
  const rowH = 30;
  const outerPad = 12;
  const colGutter = 10;
  const fontSize = 10;
  const rows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal', value: money(invoice.subtotal) },
    { label: 'Discount', value: money(invoice.discount) },
    { label: 'Tax', value: money(invoice.tax) },
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

  y = tableTop + tableH + 16;

  doc.end();
  return finished;
}
