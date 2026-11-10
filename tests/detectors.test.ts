import { describe, expect, it } from 'vitest';
import { fixMojibake } from '../src/core';
import { all, by, scanCsv } from './helpers';

describe('long-id', () => {
  const ids = (cells: string[]) => ['Order ID,Qty', ...cells.map((c) => `${c},1`)].join('\n');
  it('flags scientific notation in an ID column as high confidence', () => {
    const hits = by(scanCsv(ids(['1.23457E+15', '2.34568E+15', '3.45679E+15'])), 'long-id');
    expect(hits).toHaveLength(3);
    expect(hits[0].confidence).toBe('high');
  });
  it('flags 16-digit numbers that end in zeros', () => {
    expect(by(scanCsv(ids(['1234567890123450', '1234567890123456'])), 'long-id')).toHaveLength(1);
  });
  it('does not flag small scientific-notation measurements', () => {
    const csv = ['Concentration,Qty', '1.5E+3,1', '2.5E+4,1', '3.1E+2,1'].join('\n');
    expect(by(scanCsv(csv), 'long-id')).toHaveLength(0);
  });
});

describe('leading-zeros', () => {
  it('flags values shorter than their zero-padded neighbours', () => {
    const csv = ['ZIP,City', '01234,A', '02134,B', '07030,C', '2134,D', '10001,E'].join('\n');
    const hits = by(scanCsv(csv), 'leading-zeros');
    expect(hits).toHaveLength(1);
    expect(hits[0].likely).toBe('02134');
  });
  it('uses the header when nothing is padded: 4-digit ZIPs among 5-digit ZIPs', () => {
    const csv = ['Postal code,City', '10001,A', '90210,B', '2134,C', '60601,D'].join('\n');
    expect(by(scanCsv(csv), 'leading-zeros')).toHaveLength(1);
  });
  it('leaves ordinary integers alone', () => {
    const csv = ['Count,Name', '5,a', '12,b', '150,c', '7,d'].join('\n');
    expect(by(scanCsv(csv), 'leading-zeros')).toHaveLength(0);
  });
});

describe('mixed-dates', () => {
  it('flags a column that mixes day/month and month/day', () => {
    const csv = ['Date,V', '13/04/2021,1', '25/12/2021,1', '30/01/2021,1', '04/13/2021,1', '05/06/2021,1'].join('\n');
    const hits = by(scanCsv(csv), 'mixed-dates');
    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBe('high');
    expect(hits[0].address).toBe('A5');
  });
  it('reports a fully ambiguous column as information only', () => {
    const csv = ['Date,V', ...['03/04/2021', '05/06/2021', '07/08/2021', '01/02/2021', '09/10/2021'].map((d) => `${d},1`)].join('\n');
    const hits = by(scanCsv(csv), 'mixed-dates');
    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBe('info');
  });
  it('is quiet on a consistent column', () => {
    const csv = ['Date,V', ...['13/04/2021', '25/12/2021', '30/01/2021', '14/02/2021', '15/03/2021'].map((d) => `${d},1`)].join('\n');
    expect(by(scanCsv(csv), 'mixed-dates')).toHaveLength(0);
  });
});

describe('mojibake', () => {
  it('repairs UTF-8 text that was read as Latin-1', () => {
    expect(fixMojibake('JosÃ© GarcÃ­a')).toBe('José García');
    expect(fixMojibake('donâ€™t')).toBe('don’t');
    expect(fixMojibake('plain text')).toBe('plain text');
  });
  it('flags garbled cells and proposes the original', () => {
    const hits = by(scanCsv('Name,N\nJosÃ© GarcÃ­a,1\nAna,2'), 'mojibake');
    expect(hits).toHaveLength(1);
    expect(hits[0].likely).toBe('José García');
  });
  it('does not flag correctly encoded accents or all-capital Portuguese', () => {
    expect(by(scanCsv('Name,N\nJosé García,1\nSÃO PAULO,2\nÅsa,3'), 'mojibake')).toHaveLength(0);
  });
});

describe('number-text', () => {
  it('flags padded numbers and thousands separators in a numeric column', () => {
    const csv = ['Amount,Id', '10,1', '20,2', ' 30 ,3', '40,4', '1,200,5'.replace('1,200,5', '"1,200",5'), '60,6'].join('\n');
    const hits = by(scanCsv(csv), 'number-text');
    expect(hits.map((h) => h.stored).sort()).toEqual([' 30 ', '1,200']);
  });
  it('does not touch decimal-comma columns', () => {
    const csv = ['Amount,Id', '"1,5",1', '"2,5",2', '"3,25",3', '"4,5",4', '"1,200",5'].join('\n');
    expect(by(scanCsv(csv), 'number-text')).toHaveLength(0);
  });
});

describe('no findings on ordinary data', () => {
  it('a plain table is clean', () => {
    const csv = ['Name,Age,City', 'Ana,31,Lisbon', 'Li,44,Beijing', 'Tom,29,Boston', 'Eva,52,Prague', 'Max,38,Berlin'].join('\n');
    expect(all(scanCsv(csv)).filter((f) => f.confidence !== 'info')).toHaveLength(0);
  });
});

import { scanCsv as _scanCsv, by as _by } from './helpers';
import { describe as _d, it as _it, expect as _e } from 'vitest';
_d('leading-zeros on text columns (found by the real-data check)', () => {
  _it('does not flag all-digit titles inside a text column', () => {
    const rows = ['title,year', '06,2000', '3,1971', '3 A.M.,1976', '4 Clowns,1970', 'Alien,1979', 'Big,1988', '10,1979', 'Heat,1995'];
    _e(_by(_scanCsv(rows.join('\n')), 'leading-zeros')).toHaveLength(0);
  });
});

_d('long IDs (found by a 300,000-row stress run)', () => {
  _it('does not flag genuine 16-digit IDs that merely end in one zero', () => {
    const ids = ['4111222233334440', '4111222233334451', '4111222233334462', '4111222233334473', '4111222233334484', '4111222233334495', '4111222233334506', '4111222233334517', '4111222233334528', '4111222233334539'];
    const hits = _by(_scanCsv(['Order ID,Amount', ...ids.map((x, i) => `${x},${i}`)].join('\n')), 'long-id');
    _e(hits.filter((f) => f.confidence === 'high' || f.confidence === 'medium')).toHaveLength(0);
  });
  _it('flags a column where most IDs were cut to 15 digits', () => {
    const ids = ['4111222233334500', '4111222233335600', '4111222233336700', '4111222233337800', '4111222233338900'];
    _e(_by(_scanCsv(['Order ID,Amount', ...ids.map((x, i) => `${x},${i}`)].join('\n')), 'long-id').filter((f) => f.confidence === 'high')).toHaveLength(5);
  });
});
