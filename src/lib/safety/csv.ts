const formulaPrefix = /^[=+\-@\t\r]/;

export function neutralizeCsvCell(value: string) {
  return formulaPrefix.test(value) ? `'${value}` : value;
}

function encodeCell(value: string) {
  const safe = neutralizeCsvCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]) {
  return rows.map((row) => row.map(encodeCell).join(",")).join("\r\n");
}
