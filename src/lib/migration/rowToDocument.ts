import {
  parseNumber,
  parseInteger,
  parseString,
  parseDateTime,
  zipMultiValue,
  zipMultiValueWithPlusSplit,
  zipFoodValue,
  parseFoodIngredients,
  parsePeople,
  computeTotalSeconds,
} from './transform';

// Column indices (0-based)
const C = {
  ACTIVITY_CATEGORY: 0,
  ACTIVITY: 1,
  TITLE: 2,
  ADDITIONAL_INFO: 3,
  EXPORT: 4,
  CROSS_ACTIVITY: 5,
  RELATIONSHIP: 6,
  START_TZ: 7,
  START_YEAR: 8,
  START_MONTH: 9,
  START_DAY: 10,
  START_WEEKDAY: 11,
  START_HOUR: 12,
  START_TZ_OFFSET: 13,
  END_TZ: 14,
  END_YEAR: 15,
  END_MONTH: 16,
  END_DAY: 17,
  END_WEEKDAY: 18,
  END_HOUR: 19,
  END_TZ_OFFSET: 20,
  LOC_ACTIVITY: 26,
  LOC_ONLINE: 27,
  LOC_OTHER: 28,
  COST_KRW: 29,
  COST_FOREIGN: 30,
  CURRENCY: 31,
  COST_CATEGORY_DETAIL: 32,
  COST_CATEGORY: 33,
  PURCHASE_ITEM: 34,
  PURCHASE_AMOUNT: 35,
  PURCHASE_UNIT: 36,
  FOOD_TYPE: 37,
  FOOD_CARBS: 38,
  FOOD_FAT: 39,
  FOOD_SPICINESS: 40,
  DRINK_ITEM: 41,
  DRINK_AMOUNT: 42,
  DRINK_UNIT: 43,
  DRINK_NOTE: 44,
  FOOD_ITEM: 45,
  FOOD_AMOUNT: 46,
  FOOD_UNIT: 47,
  FOOD_NOTE: 48,
  ALCOHOL_ITEM: 49,
  ALCOHOL_AMOUNT: 50,
  ALCOHOL_UNIT: 51,
  ALCOHOL_NOTE: 52,
  PEOPLE_METHOD: 53,
  PEOPLE_CATEGORY: 54,
  PEOPLE_TARGET: 55,
  TRANSPORT_FROM: 56,
  TRANSPORT_TO: 57,
  TRANSPORT_PURPOSE: 58,
  TRANSPORT_METHOD: 59,
  TRANSPORT_RETURN_TYPE: 60,
  BOWEL_AMOUNT: 61,
  BOWEL_QUALITY: 62,
  BOWEL_CHARACTERISTICS: 63,
  BODY_WEIGHT: 64,
  BODY_MUSCLE: 65,
  BODY_FAT: 66,
  BODY_FAT_PERCENT: 67,
  SLEEP_QUALITY: 68,
  EXERCISE_ITEM: 69,
  EXERCISE_AMOUNT: 70,
  EXERCISE_UNIT: 71,
  READING_TITLE: 72,
  MOVIE_TITLE: 73,
  GOLF_SCORE: 74,
  GOLF_APPROACH: 75,
  GOLF_PUTTS: 76,
  INCOME_GROSS: 77,
  INCOME_NET: 78,
  TRAVEL_CITY: 79,
  TRAVEL_THEME: 80,
  NOTES: 81,
  SYNC_STATUS: 82,
  EVENT_ID: 83,
};

function get(row: any[], index: number): string {
  return row[index]?.toString().trim() ?? '';
}

export function rowToDocument(row: any[], userId: string): any {
  const startHour = get(row, C.START_HOUR);
  const endHour = get(row, C.END_HOUR);
  const allDay = !startHour && !endHour;

  const startDatetime = parseDateTime(
    get(row, C.START_YEAR),
    get(row, C.START_MONTH),
    get(row, C.START_DAY),
    startHour
  );

  const endDatetime = parseDateTime(
    get(row, C.END_YEAR),
    get(row, C.END_MONTH),
    get(row, C.END_DAY),
    endHour
  );

  const totalSeconds = computeTotalSeconds(
    allDay,
    startDatetime,
    endDatetime,
    parseInteger(get(row, C.START_TZ_OFFSET)),
    parseInteger(get(row, C.END_TZ_OFFSET)),
    parseInteger(get(row, C.START_YEAR)),
    parseInteger(get(row, C.START_MONTH)),
    parseInteger(get(row, C.START_DAY)),
    parseInteger(get(row, C.END_YEAR)),
    parseInteger(get(row, C.END_MONTH)),
    parseInteger(get(row, C.END_DAY)),
  );

  const purchase = zipMultiValue(
    get(row, C.PURCHASE_ITEM),
    get(row, C.PURCHASE_AMOUNT),
    get(row, C.PURCHASE_UNIT)
  );

  const drinks = zipFoodValue(
    get(row, C.DRINK_ITEM),
    get(row, C.DRINK_AMOUNT),
    get(row, C.DRINK_UNIT),
    get(row, C.DRINK_NOTE)
  ).map(d => {
    // Extract parenthesised ingredients (level2) from the item name.
    // Throws IngredientValidationError on an unknown level2 → row is skipped.
    // The drink note tag (커피/차) is preserved separately.
    const { item, ingredients } = parseFoodIngredients(d.item);
    return { ...d, item, ingredients };
  });

  const foods = zipFoodValue(
    get(row, C.FOOD_ITEM),
    get(row, C.FOOD_AMOUNT),
    get(row, C.FOOD_UNIT),
    get(row, C.FOOD_NOTE)
  ).map(f => {
    // Extract parenthesised ingredients (level2) from the item name.
    // Throws IngredientValidationError on an unknown level2 → row is skipped.
    const { item, ingredients } = parseFoodIngredients(f.item);
    return { ...f, item, ingredients };
  });

  const alcohols = zipFoodValue(
    get(row, C.ALCOHOL_ITEM),
    get(row, C.ALCOHOL_AMOUNT),
    get(row, C.ALCOHOL_UNIT),
    get(row, C.ALCOHOL_NOTE)
  );

  const exercise = zipMultiValueWithPlusSplit(
    get(row, C.EXERCISE_ITEM),
    get(row, C.EXERCISE_AMOUNT),
    get(row, C.EXERCISE_UNIT)
  ).map(e => ({ ...e, amount: parseNumber(e.amount) }));

  const people = parsePeople(
    get(row, C.PEOPLE_METHOD),
    get(row, C.PEOPLE_CATEGORY),
    get(row, C.PEOPLE_TARGET)
  );

  const doc: any = {
    userId,
    allDay,
    sync: {
      status: parseString(get(row, C.SYNC_STATUS)),
      eventId: parseString(get(row, C.EVENT_ID)),
      export: parseString(get(row, C.EXPORT)),
    },
    activity: {
      category: parseString(get(row, C.ACTIVITY_CATEGORY)),
      name: parseString(get(row, C.ACTIVITY)),
      title: parseString(get(row, C.TITLE)),
      additionalInfo: parseString(get(row, C.ADDITIONAL_INFO)),
      crossActivity: parseString(get(row, C.CROSS_ACTIVITY)),
      relationship: parseString(get(row, C.RELATIONSHIP)),
    },
    start: {
      timezone: parseString(get(row, C.START_TZ)),
      datetime: startDatetime,
      year: parseInteger(get(row, C.START_YEAR)),
      month: parseInteger(get(row, C.START_MONTH)),
      day: parseInteger(get(row, C.START_DAY)),
      weekday: parseString(get(row, C.START_WEEKDAY)),
      hour: parseString(startHour),
      timezoneOffset: parseInteger(get(row, C.START_TZ_OFFSET)),
    },
    end: {
      timezone: parseString(get(row, C.END_TZ)),
      datetime: endDatetime,
      year: parseInteger(get(row, C.END_YEAR)),
      month: parseInteger(get(row, C.END_MONTH)),
      day: parseInteger(get(row, C.END_DAY)),
      weekday: parseString(get(row, C.END_WEEKDAY)),
      hour: parseString(endHour),
      timezoneOffset: parseInteger(get(row, C.END_TZ_OFFSET)),
    },
    duration: {
      totalSeconds,
    },
    location: {
      activity: parseString(get(row, C.LOC_ACTIVITY)),
      online: parseString(get(row, C.LOC_ONLINE)),
      other: parseString(get(row, C.LOC_OTHER)),
    },
    cost: {
      amountKRW: parseNumber(get(row, C.COST_KRW)),
      amountForeign: parseNumber(get(row, C.COST_FOREIGN)),
      currency: parseString(get(row, C.CURRENCY)),
      categoryDetail: parseString(get(row, C.COST_CATEGORY_DETAIL)),
      category: parseString(get(row, C.COST_CATEGORY)),
    },
    purchase: purchase.length > 0 ? purchase : undefined,
    food: {
      type: parseString(get(row, C.FOOD_TYPE)),
      carbs: parseString(get(row, C.FOOD_CARBS)),
      fat: parseString(get(row, C.FOOD_FAT)),
      spiciness: parseString(get(row, C.FOOD_SPICINESS)),
      drinks: drinks.length > 0 ? drinks : undefined,
      foods: foods.length > 0 ? foods : undefined,
      alcohols: alcohols.length > 0 ? alcohols : undefined,
    },
    people: people.length > 0 ? people : undefined,
    transport: {
      from: parseString(get(row, C.TRANSPORT_FROM)),
      to: parseString(get(row, C.TRANSPORT_TO)),
      purpose: parseString(get(row, C.TRANSPORT_PURPOSE)),
      method: parseString(get(row, C.TRANSPORT_METHOD)),
      returnType: parseString(get(row, C.TRANSPORT_RETURN_TYPE)),
    },
    bowel: {
      amount: parseString(get(row, C.BOWEL_AMOUNT)),
      quality: parseString(get(row, C.BOWEL_QUALITY)),
      characteristics: parseString(get(row, C.BOWEL_CHARACTERISTICS)),
    },
    body: {
      weight: parseNumber(get(row, C.BODY_WEIGHT)),
      muscleMass: parseNumber(get(row, C.BODY_MUSCLE)),
      bodyFat: parseNumber(get(row, C.BODY_FAT)),
      bodyFatPercent: parseNumber(get(row, C.BODY_FAT_PERCENT)),
    },
    sleep: {
      quality: parseString(get(row, C.SLEEP_QUALITY)),
    },
    exercise: exercise.length > 0 ? exercise : undefined,
    reading: {
      title: parseString(get(row, C.READING_TITLE)),
    },
    movie: {
      title: parseString(get(row, C.MOVIE_TITLE)),
    },
    golf: {
      score: parseNumber(get(row, C.GOLF_SCORE)),
      approach: parseNumber(get(row, C.GOLF_APPROACH)),
      putts: parseNumber(get(row, C.GOLF_PUTTS)),
    },
    income: {
      gross: parseNumber(get(row, C.INCOME_GROSS)),
      net: parseNumber(get(row, C.INCOME_NET)),
    },
    travel: {
      city: parseString(get(row, C.TRAVEL_CITY)),
      theme: parseString(get(row, C.TRAVEL_THEME)),
    },
    notes: parseString(get(row, C.NOTES)),
  };

  return doc;
}
