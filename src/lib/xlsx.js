// xlsx.js — thin wrapper around the SheetJS UMD build (loaded via CDN
// script tag in index.html as a global `XLSX`), converting a File into
// row objects keyed by header.

export async function fileToRows(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return { sheetName, rows };
}
