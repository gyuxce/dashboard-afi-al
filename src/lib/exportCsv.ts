/**
 * Download an array of row objects as a CSV file.
 * Keeps the column order from the provided headers.
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  headers: { key: string; label: string }[],
): void {
  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map((h) => escape(h.label)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escape(row[h.key])).join(','),
  );
  const csv = [headerLine, ...dataLines].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
