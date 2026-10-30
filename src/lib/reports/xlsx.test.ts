import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { toXlsx } from './xlsx';

const files = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

describe('toXlsx', () => {
  const bytes = toXlsx([
    { name: 'Per hari', title: 'Penjualan per hari', subtitle: 'Periode 30–31 Okt 2026', table: { headers: ['Hari', 'Jumlah', 'Porsi'], kinds: ['text', 'rupiah', 'pct'], rows: [['Jumat, 30 Oktober 2026', 38000, 0.5], ['Total', 38000, 1]], totalRow: true } },
    { name: 'A/B [x]: very long sheet name over 31', title: 'Lain', table: { headers: ['Teks'], kinds: ['text'], rows: [['<Budi & "Bos">']] } },
  ]);
  const f = files(bytes);

  it('is a workbook with one sheet per table, names made valid', () => {
    expect(Object.keys(f)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']));
    expect(f['xl/workbook.xml']).toContain('name="Per hari"');
    expect(f['xl/workbook.xml']).toContain('name="AB x very long sheet name over"');
  });

  it('writes numbers as numbers with rupiah and percent formats', () => {
    expect(f['xl/styles.xml']).toContain('formatCode="&quot;Rp &quot;#,##0;-&quot;Rp &quot;#,##0"');
    expect(f['xl/styles.xml']).toContain('formatCode="0.0%"');
    expect(f['xl/worksheets/sheet1.xml']).toMatch(/<c r="B4" s="\d+"><v>38000<\/v><\/c>/);
    expect(f['xl/worksheets/sheet1.xml']).toMatch(/<c r="C4" s="\d+"><v>0.5<\/v><\/c>/);
  });

  it('puts title and period above a frozen, filterable header', () => {
    const s = f['xl/worksheets/sheet1.xml'];
    expect(s).toContain('<t xml:space="preserve">Penjualan per hari</t>');
    expect(s).toContain('<t xml:space="preserve">Periode 30–31 Okt 2026</t>');
    expect(s).toContain('<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>');
    expect(s).toContain('<autoFilter ref="A3:C5"/>');
  });

  it('escapes text', () => {
    expect(f['xl/worksheets/sheet2.xml']).toContain('&lt;Budi &amp; &quot;Bos&quot;&gt;');
  });
});
