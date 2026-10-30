// A small .xlsx writer for report tables: one sheet per table with a title,
// a frozen header with filters, and numbers kept as numbers (rupiah / percent
// formats), so Excel and Google Sheets can sum and sort them.
import { strToU8, zipSync } from 'fflate';
import type { Cell, Kind, Table } from './tables';

export type Sheet = { name: string; title: string; subtitle?: string; table: Table };

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEADER_ROW = 3;

const esc = (s: string) =>
  s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// cellXfs: 0 text, 1 title, 2 header, 3 subtitle, then [text, number, rupiah, pct] plain (4–7) and bold (8–11)
const KIND_INDEX: Record<Kind, number> = { text: 0, number: 1, rupiah: 2, pct: 3 };
const styleOf = (kind: Kind, bold: boolean) => 4 + (bold ? 4 : 0) + KIND_INDEX[kind];

const STYLES = `${XML}<styleSheet xmlns="${NS}">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;Rp &quot;#,##0;-&quot;Rp &quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FF999999"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="12">
<xf/>
<xf fontId="2" applyFont="1"/>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf fontId="3" applyFont="1"/>
<xf/><xf numFmtId="3" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/>
<xf fontId="1" applyFont="1"/><xf numFmtId="3" fontId="1" applyNumberFormat="1" applyFont="1"/><xf numFmtId="164" fontId="1" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="1" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const text = (ref: string, s: string, style: number) => `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;

function cellXml(ref: string, c: Cell, kind: Kind, bold: boolean): string {
  if (c === null || c === undefined || c === '') return '';
  if (typeof c === 'object') return cellXml(ref, c.value, c.kind, bold);
  if (typeof c === 'number' && kind !== 'text') return `<c r="${ref}" s="${styleOf(kind, bold)}"><v>${Number.isFinite(c) ? c : 0}</v></c>`;
  return text(ref, String(c), styleOf('text', bold));
}

/** Rough display width, so columns fit their content (capped). */
function width(c: Cell, kind: Kind): number {
  if (c === null || c === undefined) return 0;
  if (typeof c === 'object') return width(c.value, c.kind);
  if (typeof c === 'number') return kind === 'rupiah' ? Math.round(Math.abs(c)).toLocaleString('id-ID').length + 5 : kind === 'pct' ? 7 : String(c).length + 2;
  return Math.max(...String(c).split('\n').map(l => l.length));
}

function sheetXml(s: Sheet): string {
  const { headers, kinds, rows, totalRow } = s.table;
  const last = HEADER_ROW + rows.length;
  const lastCol = colName(headers.length - 1);
  const widths = headers.map((h, j) => Math.min(60, Math.max(10, h.length + 4, ...rows.map(r => width(r[j], kinds[j]) + 2))));
  const out: string[] = [];
  out.push(`<row r="1">${text('A1', s.title, 1)}</row>`);
  if (s.subtitle) out.push(`<row r="2">${text('A2', s.subtitle, 3)}</row>`);
  out.push(`<row r="${HEADER_ROW}">${headers.map((h, j) => text(`${colName(j)}${HEADER_ROW}`, h, 2)).join('')}</row>`);
  rows.forEach((r, i) => {
    const n = HEADER_ROW + 1 + i;
    const bold = !!totalRow && i === rows.length - 1;
    out.push(`<row r="${n}">${r.map((c, j) => cellXml(`${colName(j)}${n}`, c, kinds[j], bold)).join('')}</row>`);
  });
  return `${XML}<worksheet xmlns="${NS}" xmlns:r="${REL}">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${out.join('')}</sheetData>
${rows.length ? `<autoFilter ref="A${HEADER_ROW}:${lastCol}${last}"/>` : ''}
</worksheet>`;
}

/** Excel sheet names: no []:*?/\, at most 31 characters, unique. */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map(raw => {
    const base = raw.replace(/[[\]:*?/\\]/g, '').slice(0, 31).trim() || 'Sheet';
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 28)} ${k}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function toXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheetNames(sheets.map(s => s.name));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`),
    '_rels/.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}
