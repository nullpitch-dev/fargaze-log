// src/app/calendar/_lib/calendar-colors.ts
//
// The Calendar palette. Settings store the KEY, never the hex, so a colour can
// be retuned here without touching saved data. Every colour is mid-toned so a
// filled bar and a small dot both read on the light and the dark background.

export const PALETTE: { key: string; label: string; hex: string }[] = [
  { key: 'red',    label: 'Red',    hex: '#e5484d' },
  { key: 'orange', label: 'Orange', hex: '#f76b15' },
  { key: 'amber',  label: 'Amber',  hex: '#e2a336' },
  { key: 'lime',   label: 'Lime',   hex: '#7cb342' },
  { key: 'green',  label: 'Green',  hex: '#30a46c' },
  { key: 'teal',   label: 'Teal',   hex: '#12a594' },
  { key: 'sky',    label: 'Sky',    hex: '#0ea5e9' },
  { key: 'blue',   label: 'Blue',   hex: '#3e63dd' },
  { key: 'violet', label: 'Violet', hex: '#6e56cf' },
  { key: 'purple', label: 'Purple', hex: '#ab4aba' },
  { key: 'pink',   label: 'Pink',   hex: '#d6409f' },
  { key: 'brown',  label: 'Brown',  hex: '#a18072' },
  { key: 'grey',   label: 'Grey',   hex: '#8b8d98' },
];

const HEX = Object.fromEntries(PALETTE.map(p => [p.key, p.hex]));

// Starting colours, by family, so related categories share one colour and the
// month stays readable. Anything not listed is grey.
const DEFAULT_KEY: Record<string, string> = {
  '식음': 'orange',
  '생리': 'violet', '낮잠': 'violet',
  '이동': 'sky', '숙박': 'sky', '여행': 'sky', '출장': 'sky',
  '회사 업무': 'blue', '개인 업무': 'blue', '제품 개발': 'blue',
  '운동': 'green', '골프': 'green', '스키': 'green',
  '비용 지불': 'amber', '구매': 'amber', '수입 발생': 'amber', '재테크': 'amber', '판매': 'amber',
  '의료': 'red', '신체 측정': 'red',
  '관계': 'pink', '경조사': 'pink', '가족 예식': 'pink', '기념': 'pink', '종교활동': 'pink',
  '육아': 'purple',
  '문화/취미': 'teal', '기타 놀이': 'teal',
};

export function colorKeyFor(category: string, saved: Record<string, string>): string {
  const k = saved[category] ?? DEFAULT_KEY[category] ?? 'grey';
  return HEX[k] ? k : 'grey';
}

export function colorFor(category: string, saved: Record<string, string>): string {
  return HEX[colorKeyFor(category, saved)];
}

/** Dark or white text, whichever reads on the given fill. */
export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1c1917' : '#ffffff';
}

/** The Reading & study row. */
export const READING_TINT_LIGHT = '#ccfbf1';   // teal-100
export const READING_TINT_DARK  = '#134e4a';   // teal-900
export const READING_INK_LIGHT  = '#115e59';   // teal-800
export const READING_INK_DARK   = '#99f6e4';   // teal-200
