// Every food and drink in a record must name its ingredients (Design §11.7).
//
// Used by the Staging migration (#68), and meant for the entry app (#71): a record
// is only saved when each item in food.foods and food.drinks carries at least one
// real ingredient (a level2 value of the Ingredient list). "Not Defined" — what the
// parser gives an item written without brackets, e.g. 김치찌개 instead of
// 김치찌개(김치|돼지고기) — counts as missing.
//
// Whether each ingredient is a known level2 value is checked elsewhere (the parser
// refuses unknown ones); this module only checks that ingredients are there.
// Pure: no database, so it runs on the server and in the browser alike.

export const NOT_DEFINED = 'Not Defined';

export interface MissingIngredient {
  kind: 'food' | 'drink';
  item: string;
}

const realIngredients = (ings: unknown): string[] =>
  (Array.isArray(ings) ? ings : [])
    .map(x => String(x ?? '').trim())
    .filter(x => x !== '' && x !== NOT_DEFINED);

/** The foods and drinks of one record that have no real ingredient. */
export function missingIngredients(record: any): MissingIngredient[] {
  const out: MissingIngredient[] = [];
  const groups: [MissingIngredient['kind'], unknown][] = [
    ['food', record?.food?.foods],
    ['drink', record?.food?.drinks],
  ];
  for (const [kind, list] of groups) {
    for (const it of Array.isArray(list) ? list : []) {
      const item = String(it?.item ?? '').trim();
      if (!item) continue;                                  // an empty slot, not an item
      if (!realIngredients(it?.ingredients).length) out.push({ kind, item });
    }
  }
  return out;
}

/** "Food '김치찌개'" — for messages. */
export function describeMissing(m: MissingIngredient): string {
  return `${m.kind === 'food' ? 'Food' : 'Drink'} '${m.item}'`;
}
