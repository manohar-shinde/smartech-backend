import { randomInt } from 'node:crypto';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC `YYMMDDHHmm` (10 digits), stable across server time zones. */
export function documentNumberUtcCompact(at: Date = new Date()): string {
  return (
    pad2(at.getUTCFullYear() % 100) +
    pad2(at.getUTCMonth() + 1) +
    pad2(at.getUTCDate()) +
    pad2(at.getUTCHours()) +
    pad2(at.getUTCMinutes())
  );
}

/** Stored quotation number: `QUO` + UTC compact time. */
export function buildQuotationNumber(at: Date = new Date()): string {
  return `QUO${documentNumberUtcCompact(at)}`;
}

/** Stored invoice number: `INV` + UTC compact time. */
export function buildInvoiceNumber(at: Date = new Date()): string {
  return `INV${documentNumberUtcCompact(at)}`;
}

/** Disambiguate when two documents are created in the same UTC minute. */
export function withDocumentNumberDisambiguator(base: string): string {
  return `${base}-${String(randomInt(1, 9999)).padStart(4, '0')}`;
}

export function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const o = err as { code?: string; message?: string };
  if (o.code === '23505') {
    return true;
  }
  const m = String(o.message ?? '').toLowerCase();
  return m.includes('duplicate') || m.includes('unique constraint');
}
