import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM and uses ; and CRLF for Excel in Indonesian locales', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a;b\r\n1;x\r\n');
  });

  it('quotes cells with separators, quotes or line breaks', () => {
    const out = toCsv(['customer', 'note'], [['Budi; "Bos"', 'baris 1\nbaris 2']]);
    expect(out).toBe('﻿customer;note\r\n"Budi; ""Bos""";"baris 1\nbaris 2"\r\n');
  });

  it('writes numbers plainly and empty cells for null', () => {
    expect(toCsv(['n', 'x'], [[1234567, null]])).toBe('﻿n;x\r\n1234567;\r\n');
  });

  it('defuses text that Excel would run as a formula, but not numbers', () => {
    expect(toCsv(['a', 'b', 'c', 'd', 'e'], [['=1+1', '+62 812', '@SUM(A1)', 'Budi', -20000]])).toBe("﻿a;b;c;d;e\r\n'=1+1;'+62 812;'@SUM(A1);Budi;-20000\r\n");
    expect(toCsv(['a'], [['-ditukar']])).toBe("﻿a\r\n'-ditukar\r\n");
  });
});
