import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';

// ── Reviewed drink map (human-verified) ──────────────────────────────────────
// Maps a drink item name to its level2 ingredient list. Includes spelling and
// 아이스/디카페인 spacing variants. Reviewed by Hyoje (Column D corrections applied).
const DRINK_MAP: Record<string, string[]> = {
  "ABC주스": ["단 과일", "기타 채소"],
  "Red Bull": ["카페인", "설탕"],
  "Sea Salt Coffee": ["커피", "소금"],
  "non alcohol cocktail": ["기타 음료"],
  "갈아만든 배": ["단 과일", "설탕"],
  "갈아만든배": ["단 과일", "설탕"],
  "감귤쥬스": ["단 과일", "설탕"],
  "게토레이": ["기타 음료", "설탕"],
  "게토레이 ": ["기타 음료", "설탕"],
  "곤약젤리": ["기타 음료", "설탕"],
  "과일주스": ["단 과일", "설탕"],
  "과일쥬스": ["단 과일", "설탕"],
  "국화차": ["허브차"],
  "귤쥬스": ["단 과일", "설탕"],
  "귤피차": ["허브차"],
  "꾸지뽕차": ["허브차"],
  "꿀차": ["허브차", "꿀"],
  "냉커피": ["커피", "기타 유제품", "설탕"],
  "녹즙": ["잎 채소"],
  "녹차": ["녹차"],
  "녹차라떼": ["녹차", "우유"],
  "다방커피": ["커피", "기타 유제품", "설탕"],
  "단백질 음료": ["기타 음료"],
  "대추차": ["허브차", "설탕"],
  "돌체아이스라떼": ["커피", "우유", "설탕"],
  "두유": ["콩류"],
  "두유 라떼": ["커피", "콩류"],
  "두유라떼": ["커피", "콩류"],
  "둥글래차": ["허브차"],
  "둥글레차": ["허브차"],
  "드립커피": ["커피"],
  "디카페 아이스아메리카노": ["디카페인 커피"],
  "디카페인 라떼": ["디카페인 커피", "우유"],
  "디카페인 비엔나 커피": ["디카페인 커피", "기타 유제품", "설탕"],
  "디카페인 아메리카노": ["디카페인 커피"],
  "디카페인 아이스라떼": ["디카페인 커피", "우유"],
  "디카페인 아이스아메리카노": ["디카페인 커피"],
  "디카페인 아포카토": ["디카페인 커피", "기타 유제품", "설탕"],
  "디카페인 커피": ["디카페인 커피"],
  "디카페인 콜드부르": ["디카페인 커피"],
  "디카프 아이스라떼": ["디카페인 커피", "우유"],
  "디카프 아이스아메리카노": ["디카페인 커피"],
  "디커페인 아이스아메리카노": ["디카페인 커피"],
  "딸기 에이드": ["탄산", "베리류", "설탕"],
  "딸기 에이드 ": ["탄산", "베리류", "설탕"],
  "딸기 우유": ["우유", "설탕"],
  "라떼": ["커피", "우유"],
  "라씨": ["요거트"],
  "레드불": ["카페인", "설탕"],
  "레모네이드": ["탄산", "단 과일", "설탕"],
  "레몬 에이드": ["탄산", "단 과일", "설탕"],
  "레몬에이드": ["탄산", "단 과일", "설탕"],
  "레몬쥬스": ["기타 과일", "설탕"],
  "레몬진저허니티": ["허브차", "꿀"],
  "레몬차": ["허브차"],
  "로즈마리": ["허브차"],
  "루이보스": ["허브차"],
  "말차": ["녹차"],
  "망고 스무디": ["단 과일"],
  "망고 쥬스": ["단 과일", "설탕"],
  "망고스무디": ["단 과일"],
  "망고쥬스": ["단 과일", "설탕"],
  "매실차": ["허브차", "설탕"],
  "맥콜": ["탄산", "설탕"],
  "모과차": ["허브차", "설탕"],
  "무알콜 맥주": ["기타 음료"],
  "무알콜 하이볼": ["기타 음료"],
  "물": ["기타"],
  "미수가루": ["기타 곡류", "콩류", "설탕"],
  "미숫가루": ["기타 곡류", "콩류", "설탕"],
  "미숫가루 ": ["기타 곡류", "콩류", "설탕"],
  "미에로화이바": ["기타 음료", "설탕"],
  "믹스 커피": ["커피", "기타 유제품", "설탕"],
  "믹스커피": ["커피", "설탕", "기타 유제품"],
  "믹스커피 ": ["커피"],
  "민트티": ["허브차"],
  "밀크": ["우유"],
  "밀크쉐이크": ["우유", "설탕"],
  "밀크커피": ["우유", "커피"],
  "밀크티": ["홍차", "우유"],
  "밀크�s이크": ["우유", "설탕"],
  "바나나 우유": ["우유", "설탕"],
  "바나나우유": ["우유", "설탕"],
  "바닐라라떼": ["커피", "우유", "설탕"],
  "바카스": ["카페인", "설탕"],
  "박카스": ["카페인", "설탕"],
  "박카스D": ["카페인", "설탕"],
  "배도라지 즙": ["단 과일"],
  "배즙": ["단 과일"],
  "버블티": ["홍차", "우유", "전분"],
  "베엔나커피": ["커피", "기타 유제품", "설탕"],
  "베지밀": ["콩류", "설탕"],
  "베트남 커피": ["커피"],
  "보이차": ["보이차"],
  "보이차 (생차)": ["보이차"],
  "보이차_생차": ["보이차"],
  "봉지커피": ["커피", "기타 유제품", "설탕"],
  "블랙 캔커피": ["커피", "설탕"],
  "블랙캔커피": ["커피", "설탕"],
  "블루베리 주스": ["베리류", "설탕"],
  "블루베리 쥬스": ["베리류", "설탕"],
  "블루베리즙": ["베리류"],
  "블루베리즙 ": ["베리류"],
  "블루티": ["허브차"],
  "비릭식혜": ["쌀", "설탕"],
  "비타500": ["기타 음료", "설탕"],
  "비트 쥬스": ["뿌리 채소"],
  "비트 쥬스 ": ["뿌리 채소"],
  "비트쥬스": ["뿌리 채소"],
  "사과 주스": ["단 과일", "설탕"],
  "사과 쥬스": ["단 과일", "설탕"],
  "사과주스": ["단 과일", "설탕"],
  "사과쥬스": ["단 과일", "설탕"],
  "사과즙": ["단 과일"],
  "사이다": ["탄산", "설탕"],
  "생강차": ["허브차", "설탕"],
  "설탕 라떼": ["커피", "우유", "설탕"],
  "설탕라떼": ["커피", "우유", "설탕"],
  "설탕밀크티": ["홍차", "우유", "설탕"],
  "설탕아이스아메리카노": ["커피", "설탕"],
  "설탕커피": ["커피", "설탕"],
  "소이라떼": ["커피", "콩류"],
  "수박 주스": ["단 과일", "설탕"],
  "수박 쥬스": ["단 과일", "설탕"],
  "수박쥬스": ["단 과일", "설탕"],
  "숙취해소제": ["기타 음료", "설탕"],
  "스무디": ["단 과일"],
  "스프라이트": ["탄산", "설탕"],
  "스프라이트 제로": ["탄산", "기타 소스"],
  "식혜": ["쌀", "설탕"],
  "실온라떼": ["커피", "우유"],
  "쌍화차": ["허브차", "설탕"],
  "아구르트": ["요거트", "설탕"],
  "아로니아즙": ["베리류"],
  "아메리카노": ["커피"],
  "아메리카노 디카페인": ["디카페인 커피"],
  "아몬드 물": ["견과류"],
  "아몬드 우유": ["우유", "견과류"],
  "아몬드라떼": ["커피", "견과류"],
  "아몬드아메리카노": ["커피", "견과류"],
  "아보카도바나나주스": ["단 과일", "열매 채소"],
  "아쌈": ["홍차"],
  "아아스 홍차": ["홍차"],
  "아이스 녹차": ["녹차"],
  "아이스 라떼": ["커피", "우유"],
  "아이스 믹스커피": ["커피", "설탕", "기타 유제품"],
  "아이스 밀크티": ["홍차", "우유"],
  "아이스 보이차": ["보이차"],
  "아이스 아메리카노": ["커피"],
  "아이스 에스프레소": ["커피"],
  "아이스 카라멜라떼": ["커피", "우유", "설탕"],
  "아이스 캐모마일": ["허브차"],
  "아이스 티": ["홍차", "설탕"],
  "아이스 허브티": ["허브차"],
  "아이스 홍차": ["홍차"],
  "아이스라떼": ["커피", "우유"],
  "아이스라떼_시럽": ["커피", "우유", "설탕"],
  "아이스레떼": ["커피", "우유"],
  "아이스레떼 ": ["커피", "우유"],
  "아이스보이차": ["보이차"],
  "아이스아메리카노": ["커피"],
  "아이스에스프레소": ["커피"],
  "아이스크림": ["기타 유제품", "설탕"],
  "아이스크림 라떼": ["커피", "우유", "기타 유제품", "설탕"],
  "아이스크림라떼": ["커피", "우유", "기타 유제품", "설탕"],
  "아이스티": ["허브차", "설탕"],
  "아이스홍차": ["홍차"],
  "아포카도": ["커피", "기타 유제품", "설탕"],
  "아포카토": ["커피", "기타 유제품", "설탕"],
  "아포카토 ": ["커피", "기타 유제품"],
  "야구르트": ["요거트", "설탕"],
  "야채즙": ["기타 채소"],
  "어이스라떼": ["커피", "우유"],
  "얼그레이": ["홍차"],
  "얼그레이 아이스": ["홍차"],
  "에스프레소": ["커피"],
  "에이드": ["탄산", "단 과일", "설탕"],
  "에이드 ": ["탄산", "단 과일", "설탕"],
  "여명": ["기타 음료", "설탕"],
  "여명808": ["기타 음료", "설탕"],
  "연잎차": ["허브차"],
  "오랜지 쥬스": ["단 과일", "설탕"],
  "오렌지 쥬스": ["단 과일", "설탕"],
  "오크라떼": ["커피", "기타 곡류"],
  "오트 라떼": ["커피", "기타 곡류"],
  "오트라떼": ["커피", "기타 곡류"],
  "오트밀크": ["기타 곡류"],
  "오트밀크라떼": ["커피", "기타 곡류"],
  "요거트": ["요거트"],
  "요거트 밀크": ["요거트", "우유"],
  "요거트 스무디": ["요거트", "단 과일"],
  "요거트 우유": ["우유", "요거트", "설탕"],
  "요거트밀크": ["요거트", "우유"],
  "요구르트": ["요거트", "설탕"],
  "요구르트 우유": ["우유", "요거트", "설탕"],
  "우롱차": ["허브차"],
  "우유": ["우유"],
  "워터젤리": ["기타 음료", "설탕"],
  "웰치스": ["탄산", "설탕"],
  "유자차": ["허브차", "설탕"],
  "음료수": ["기타 음료"],
  "인삼차": ["허브차"],
  "자몽 쥬스": ["기타 과일", "설탕"],
  "자몽주스": ["기타 과일", "설탕"],
  "자몽쥬스": ["기타 과일", "설탕"],
  "자몽허니블랙티": ["홍차", "기타 과일", "꿀"],
  "자몽허니블랙티 ": ["홍차", "기타 과일", "꿀"],
  "자스민 차": ["허브차"],
  "자스민차": ["허브차"],
  "자판기 커피": ["커피", "기타 유제품", "설탕"],
  "자판기커피": ["커피", "기타 유제품", "설탕"],
  "제로 사이다": ["탄산", "기타 소스"],
  "제로 사이다 ": ["탄산", "기타 소스"],
  "제로 콜라": ["탄산", "기타 소스"],
  "제로콜라": ["탄산", "기타 소스"],
  "젤리": ["기타 음료", "설탕"],
  "주스": ["단 과일", "설탕"],
  "쥬스": ["단 과일", "설탕"],
  "쮸스": ["단 과일", "설탕"],
  "차": ["홍차"],
  "차이 티 라떼": ["홍차", "우유", "설탕"],
  "차이라떼": ["홍차", "우유", "설탕"],
  "청보리순차": ["허브차"],
  "초코라떼": ["커피", "우유", "초콜릿"],
  "쵸코 딸기": ["초콜릿", "베리류"],
  "쵸코드링크": ["초콜릿", "설탕"],
  "쵸코라떼": ["커피", "우유", "초콜릿"],
  "초코우유": ["우유", "초콜릿", "설탕"],
  "카라멜마끼아또": ["커피", "우유", "설탕"],
  "카모마일": ["허브차"],
  "카모마일 ": ["허브차"],
  "카카오커피": ["커피", "초콜릿"],
  "카페모카 아이스": ["커피", "초콜릿"],
  "카푸치노": ["커피", "우유"],
  "캐모마일": ["허브차"],
  "캔커피": ["커피", "설탕", "기타 유제품"],
  "커피": ["커피"],
  "커피우유": ["우유", "커피", "설탕"],
  "케모마일": ["허브차"],
  "케모마일 아이스": ["허브차"],
  "코코아": ["초콜릿", "설탕"],
  "콜드브루커피": ["커피"],
  "콜라": ["탄산", "설탕"],
  "콩국": ["콩류"],
  "콩물": ["콩류"],
  "탄산수": ["탄산"],
  "탄산음료": ["탄산", "설탕"],
  "토마토 주스": ["열매 채소"],
  "토마토 쥬스": ["열매 채소"],
  "토마토주스": ["열매 채소"],
  "토마토쥬스": ["열매 채소"],
  "토바토 주스": ["열매 채소"],
  "티": ["홍차"],
  "티 라떼": ["홍차", "우유", "설탕"],
  "티라떼": ["홍차", "우유", "설탕"],
  "파워에이드": ["기타 음료", "설탕"],
  "파인애플 쥬스": ["단 과일", "설탕"],
  "파인애플쥬스": ["단 과일", "설탕"],
  "팥라떼": ["커피", "우유", "콩류"],
  "패션후르츠 차": ["허브차"],
  "포도 쥬스": ["단 과일", "설탕"],
  "포도주스": ["단 과일", "설탕"],
  "포도쥬스": ["단 과일", "설탕"],
  "포카리스웨터": ["기타 음료", "설탕"],
  "포카리스웨트": ["기타 음료", "설탕"],
  "한라봉 주스": ["단 과일", "설탕"],
  "핫6": ["카페인", "설탕"],
  "핫식스": ["카페인", "설탕"],
  "핫초코": ["초콜릿", "설탕"],
  "핫쵸코": ["초콜릿", "설탕"],
  "허브차": ["허브차"],
  "허브티": ["허브차"],
  "홍삼": ["기타 음료"],
  "홍삼 쥬스": ["기타 음료"],
  "홍삼즙": ["기타 음료"],
  "홍차": ["홍차"],
  "환타": ["탄산", "설탕"],
  "흑도라지차": ["허브차"],
};

// Normalisation: strip 아이스 / 핫 / spacing so variants collapse onto base keys.
function normalize(raw: string): string {
  let s = raw.toString().trim();
  return s;
}

function bestGuess(item: string): { level2: string[]; guessed: boolean } {
  const key = item.trim();
  if (DRINK_MAP[key]) return { level2: DRINK_MAP[key], guessed: false };

  // Try stripping a leading 아이스/핫 and surrounding spaces, then re-lookup.
  const stripped = key
    .replace(/^아이스\s*/, '')
    .replace(/^핫\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (DRINK_MAP[stripped]) return { level2: DRINK_MAP[stripped], guessed: true };

  // Substring fallback: longest matching key contained in the item.
  const keys = Object.keys(DRINK_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (key.includes(k)) return { level2: DRINK_MAP[k], guessed: true };
  }
  return { level2: ['Not Defined'], guessed: true };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const exportWorklist = process.argv.includes('--export-worklist');
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log(`\n🥤 Historical DRINK ingredients fill${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('\n✅ Connected:', mongoose.connection.db!.databaseName);

  const userId = 'hyoje';

  // ── WORKLIST EXPORT MODE ────────────────────────────────────────────────────
  if (exportWorklist) {
    const fs = await import('fs');
    const freq: Record<string, number> = {};
    const suggest: Record<string, string> = {};
    const matchType: Record<string, string> = {};
    const wcursor = Log.find({ userId, 'food.drinks.0': { $exists: true } }).cursor();
    for (let doc: any = await wcursor.next(); doc != null; doc = await wcursor.next()) {
      for (const d of doc.food?.drinks ?? []) {
        if (!d?.item) continue;
        const item = d.item.toString().trim();
        if (DRINK_MAP[item]) continue;
        freq[item] = (freq[item] ?? 0) + 1;
        if (!(item in suggest)) {
          const g = bestGuess(item);
          suggest[item] = g.level2.join('|');
          matchType[item] = (g.level2.length === 1 && g.level2[0] === 'Not Defined') ? 'not_defined' : 'guessed';
        }
      }
    }
    const rows = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    const lines = ['item\tfrequency\tsuggested_level2\tmatch_type\tfinal_level2'];
    for (const item of rows) lines.push(`${item}\t${freq[item]}\t${suggest[item]}\t${matchType[item]}\t`);
    fs.writeFileSync('drink_worklist.tsv', lines.join('\n'), 'utf8');
    console.log(`\n📝 Wrote drink_worklist.tsv — ${rows.length} distinct unmapped items.`);
    await mongoose.disconnect();
    console.log('\n✅ Done (worklist export — no writes).');
    return;
  }

  // ── FILL MODE ───────────────────────────────────────────────────────────────
  const cursor = Log.find({ userId, 'food.drinks.0': { $exists: true } }).cursor();

  let docsTouched = 0, itemsFilled = 0;
  const autoMapped: Record<string, string> = {};
  const notDefined: Record<string, number> = {};
  const bulk: any[] = [];

  for (let doc: any = await cursor.next(); doc != null; doc = await cursor.next()) {
    let changed = false;
    for (const d of doc.food?.drinks ?? []) {
      if (!d?.item) continue;

      // Skip if already filled. Treat ["Not Defined"] as refillable so re-runs
      // repair a migration that reset drinks without parenthesis notation.
      const alreadyFilled =
        Array.isArray(d.ingredients) &&
        d.ingredients.length > 0 &&
        !(d.ingredients.length === 1 && d.ingredients[0] === 'Not Defined');
      if (alreadyFilled) continue;

      const item = d.item.toString().trim();
      const { level2, guessed } = bestGuess(item);
      d.ingredients = level2;
      changed = true;
      itemsFilled++;
      if (level2.length === 1 && level2[0] === 'Not Defined') {
        notDefined[item] = (notDefined[item] ?? 0) + 1;
      } else if (guessed && !DRINK_MAP[item]) {
        autoMapped[item] = level2.join('|');
      }
    }
    if (changed) {
      docsTouched++;
      if (!dryRun) {
        bulk.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { 'food.drinks': doc.food.drinks } } } });
        if (bulk.length >= 500) { await Log.bulkWrite(bulk); bulk.length = 0; }
      }
    }
  }
  if (!dryRun && bulk.length) await Log.bulkWrite(bulk);

  console.log('\n📊 Summary');
  console.log(`  Documents touched: ${docsTouched}`);
  console.log(`  Drink items filled: ${itemsFilled}`);

  const am = Object.keys(autoMapped).sort();
  if (am.length) {
    console.log(`\n⚠️  Auto-mapped (best guess) — please review ${am.length} items:`);
    for (const k of am) console.log(`    ${k}  →  ${autoMapped[k]}`);
  }
  const nd = Object.keys(notDefined).sort();
  if (nd.length) {
    console.log(`\n❓ Could not guess — set to "Not Defined" (${nd.length}):`);
    for (const k of nd) console.log(`    ${k}`);
  }

  await mongoose.disconnect();
  console.log(`\n✅ Done${dryRun ? ' (dry run — no writes)' : ''}.`);
}
main().catch(console.error);
