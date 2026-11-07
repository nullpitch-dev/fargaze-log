// The record's Relationship (column G) follows its People, as the sheet's formula does
// (Hyoje, 5 Nov): =IF(BB="타인","타인",IF(BB>0,"함께","혼자")), where BB is the People
// method cell. Pure: the edit page uses it too.
// The sheet writes a method shared by every group ONCE (BB '타인', BC '가족|친목'; the
// migration gives it to each group), so the rule reads the different methods (5 Nov:
// 246 가족 기록 records with two 타인 groups are 타인, not 함께).

type Person = { method?: string | null; category?: string | null; target?: string | null };

/** ['타인', '타인'] → ['타인']: the sheet's way of writing a value every group shares. */
export function oneIfSame(values: string[]): string[] {
  return values.length > 1 && values.every(v => v === values[0]) ? [values[0]] : values;
}

const s = (v: unknown) => (v == null ? '' : String(v).trim());

/** The BB cell: one method per group of consecutive people with the same method and type;
 *  a method shared by every group is written once. */
export function peopleMethodCell(people: Person[] | null | undefined): string {
  const groups: { m: string; c: string }[] = [];
  for (const p of people ?? []) {
    const m = s(p?.method), c = s(p?.category);
    const last = groups[groups.length - 1];
    if (!last || last.m !== m || last.c !== c) groups.push({ m, c });
  }
  return oneIfSame(groups.map(g => g.m)).join('|');
}

/** 혼자 (no people), 타인 (the method cell is exactly 타인), otherwise 함께. */
export function relationshipOf(people: Person[] | null | undefined): string {
  const bb = peopleMethodCell(people);
  return bb === '타인' ? '타인' : bb !== '' ? '함께' : '혼자';
}
