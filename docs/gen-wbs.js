const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, LevelFormat, AlignmentType } = require('docx');
const H = require('./docx-helpers.js');
const { h1, h2, h3, p, note, bold, bullet, num, spacer, table } = H;

const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
const children = [];
const C = (...xs) => xs.forEach(x => children.push(x));


C(
  new Paragraph({ children: [new TextRun({ text: "FarGaze", bold: true, size: 48 })], spacing: { after: 120 } }),
  new Paragraph({ children: [new TextRun({ text: "Service Concept & Work Breakdown Structure", size: 32 })], spacing: { after: 60 } }),
  new Paragraph({ children: [new TextRun({ text: "Version 3.4  |  29 July 2026", size: 24 })], spacing: { after: 240 } }),
);

C(h1("Version History"));
C(table(["Version","Date","Headline"],[
  ["1.0","27 Apr 2026","Initial — concept, tech stack, WBS phases 1–5"],
  ["1.1","27 Apr 2026","Phase 2/3 subtasks; open questions"],
  ["1.2","28 Apr 2026","Phase 3 complete; migration archive-only"],
  ["1.3","29 Apr 2026","Phase 4 start; Atlas Search index"],
  ["1.4","30 Apr 2026","Spending-dashboard items added"],
  ["1.5","30 Apr 2026","Cost dashboard complete"],
  ["1.6","10 May 2026","Cross-activity filter"],
  ["1.7","14 May 2026","Widget framework & Insights dashboard"],
  ["1.8","15 May 2026","Sleep widget; global-filter redesign"],
  ["1.9","16 May 2026","Interactions Summary; chart colour template"],
  ["2.0","17 May 2026","Interactions Trend; shared chart library"],
  ["2.1","21 May 2026","Drinking widget Summary"],
  ["2.2","22 May 2026","Drinking Trend; CSS chart components"],
  ["2.3","4 Jun 2026","Food ingredient taxonomy (#60)"],
  ["2.4","5 Jun 2026","Drink ingredient taxonomy (#62)"],
  ["2.5","12 Jun 2026","Diet widget Summary (#61)"],
  ["2.6","20 Jun 2026","Diet widget Trend; CssRankFlowChart"],
  ["2.7","25 Jun 2026","Insights polish pass; bars.tsx; search phrase + sortable columns"],
  ["3.0","27 Jun 2026","Restructure: status snapshot, task lines cleaned of embedded history, backlog absorbs open questions; per-tab Interactions Method filter and search ingredient display recorded; mirrors Design Doc v4.0"],
  ["3.1","18 Jul 2026","Weight widget Summary complete (#54); #55 closed as covered by the Sleep widget; box-plot last-bucket values; mirrors Design Doc v4.1"],
  ["3.2","19 Jul 2026","#54 complete — Weight Trend shipped (metric=weight.trend, CssStackedAreaChart, three-state unit toggle); Segmented extracted to a shared component; weight-colors.ts extracted; inPlot gridline guard across all four CSS charts; mirrors Design Doc v4.2"],
  ["3.3","26 Jul 2026","#58 data preparation complete — source columns 부하/방식 added, exercise[].loadKg and exercise[].setStyle in Log.ts and rowToDocument.ts, fetch range A:CI, full re-migration verified; Google Calendar sync Apps Script write targets corrected to CG/CH; new Appendix A.6 on column-insertion safety. Widget design NOT started. Mirrors Design Doc v4.3"],
  ["3.4","29 Jul 2026","#58 Exercise widget COMPLETE \u2014 exercise.ts, stats/route.ts branch, ExerciseWidget.tsx, registered in page.tsx. ModalShell extracted from DietWidget; emphasizeLast added to CssVerticalBoxPlotChart. \uacc4\ub2e8 \uc624\ub974\uae30 \ucda9 records converted to \ubd84, so every item now carries one unit; the per-item table below is re-surveyed and the earlier counts were stale. \ucd1d CORRECTED \u2014 it marks a day total with an unknown set split, not a rest-pause set. Trend view and the load line deferred. Mirrors Design Doc v4.4"],
],[1100,1300,6960]));
C(spacer());

// 1. SERVICE CONCEPT
C(h1("1. Service Concept"));
C(h2("1.1 Overview"));
C(p("FarGaze is a personal life analytics platform where users log their daily activities, habits, finances and life events, then explore their data through beautiful visualisations and historical search."));
C(h2("1.2 Core Value Propositions"));
C(
  bullet("Log — Simple daily data entry (web + mobile)"),
  bullet("Visualise — Charts and trends over time"),
  bullet("Discover — Find facts from history"),
  bullet("Migrate — Import existing Excel / Google Sheets data"),
);
C(h2("1.3 Target Users"));
C(
  bullet("People who already track life data in spreadsheets and want a better experience"),
  bullet("People who want to start tracking their life systematically"),
);
C(h2("1.4 Monetisation & Platforms"));
C(
  bullet("Subscription model — Free trial period (TBD)"),
  bullet("Web application + Mobile application (iOS & Android, TBD)"),
);

// 2. TECH STACK
C(h1("2. Tech Stack"));
C(table(["Layer","Technology","Rationale"],[
  ["Frontend","Next.js + Vercel","Familiar stack, fast deployment"],
  ["Authentication","Auth.js (NextAuth)","Flexible, works well with Next.js"],
  ["Database","MongoDB Atlas","Flexible schema per user, multiple collections"],
  ["Search","MongoDB Atlas Search","Full-text search across all log fields"],
  ["Hosting","Vercel","Already in use, auto-deploy from GitHub"],
  ["Mobile","TBD (React Native or PWA)","To be decided in later phase"],
],[2400,3000,3960]));
C(spacer());

// 3. DEVELOPMENT APPROACH
C(h1("3. Development Approach"));
C(
  bullet("Build for yourself first, but with architecture that scales to other users"),
  bullet("No throwaway code — every line counts toward the real product"),
  bullet("Data entry is last, not first — migration covers immediate need"),
  bullet("MVP = usable by Hyoje, extensible for others"),
);
C(p("Phases 1 through 5 constitute the MVP."));

C(h1("4. Status Snapshot"));
C(p("At-a-glance progress. This is the single source of truth for status — the design doc carries spec only."));
C(table(["Phase","Status","Detail"],[
  ["1 — Base Infrastructure & Auth","\u2705 Complete","Subscription-architecture placeholder still pending"],
  ["2 — Data Structure Design","\u2705 Complete","Schema, supporting collections, Mongoose models"],
  ["3 — Migration Tool","\u2705 Complete","Delete-all + re-insert; incremental sync deferred to post-MVP"],
  ["4 — Analytics & Search","\u2B1C In progress","Done: search, cost dashboard, Sleep / Interactions / Drinking / Diet / Weight widgets (all with Summary and Trend), food + drink ingredient taxonomies. Done: #58 Exercise (Summary only). Remaining: #59 Calendar"],
  ["5 — Data Entry","\u2B1C Not started","Post-MVP"],
],[2900,1700,4760]));
C(spacer());
C(p([new TextRun({ text: "Current focus: ", bold: true }), new TextRun("#59 Calendar view. #58 Exercise shipped its Summary view on 29 July; its Trend view is deferred and undesigned. Phase 5 (data entry) follows #59.")]));

C(h1("5. Work Breakdown Structure"));
C(p("\u2705 = Complete   \u2B1C = Pending   DESCOPED = out of MVP scope. Each line states current state, not how it evolved (see the changelog for history)."));

C(h2("Phase 1 — Base Infrastructure & Authentication \u2705"));
C(
  bullet("\u2705 1. Next.js project setup"),
  bullet("\u2705 2. Vercel deployment pipeline"),
  bullet("\u2705 3. MongoDB Atlas cluster setup"),
  bullet("\u2705 4. MongoDB connection utility (src/lib/mongodb.ts)"),
  bullet("\u2705 5. Connection verified on localhost and production"),
  bullet("\u2705 6. Auth.js (NextAuth) installation"),
  bullet("\u2705 7. Google OAuth setup and configuration"),
  bullet("\u2705 8. Session management via Auth.js"),
  bullet("\u2705 9. Domain setup (log.fargaze.co)"),
  bullet("\u2705 10. Environment variables configured on Vercel"),
  bullet("\u2B1C 11. Subscription architecture placeholder"),
);

C(h2("Phase 2 — Data Structure Design \u2705"));
C(
  bullet("\u2705 1. Source data analysis — reviewed 7 years of Google Sheets data"),
  bullet("\u2705 2. MongoDB schema design for log collection (70+ fields)"),
  bullet("\u2705 3. Multi-value field design (comma/pipe matching → arrays of objects)"),
  bullet("\u2705 4. Entry state logic design (future/ongoing/completed — dynamic computation)"),
  bullet("\u2705 5. Supporting collections schema design (5 collections)"),
  bullet("\u2705 6. Incremental sync strategy design — DESCOPED (deferred to post-MVP)"),
  bullet("\u2705 7. Deduplication strategy finalised — delete-all + re-insert"),
  bullet("\u2705 8. Data Design & Requirements Document created"),
  bullet("\u2705 9–14. Mongoose models: Log, CostMaster, ActivityMaster, ReferenceList, TimezoneMaster, ExchangeRate"),
);

C(h2("Phase 3 — Migration Tool \u2705"));
C(
  bullet("\u2705 1. Google Sheets API credentials setup"),
  bullet("\u2705 2. Google Sheets API connection utility"),
  bullet("\u2705 3. Row filtering logic (skip #N/A, Preset, blank activity)"),
  bullet("\u2705 4. Data transformation utilities"),
  bullet("\u2705 5. Migration script for supporting collections"),
  bullet("\u2705 6. Migration script for log collection"),
  bullet("\u2705 7. Bulk insert (delete-all + re-insert, no deduplication check)"),
  bullet("\u2705 8. Write back DB_Status/DB_ID — DESCOPED (deferred to post-MVP)"),
  bullet("\u2705 9. Migration statistics report (total, skipped, inserted, errors)"),
  bullet("\u2705 10. Incremental sync tool — DESCOPED (deferred to post-MVP)"),
  bullet("\u2705 11. Migration fix: filter 등 token from people[].target during parsePeople()"),
);

C(h2("Phase 4 — Analytics & Search \u2B1C"));
C(
  bullet("\u2705 41. Schema: duration.totalSeconds (d/h/m/s removed)"),
  bullet("\u2705 42–44. rowToDocument.ts + Log.ts updated; full re-migration"),
  bullet("\u2705 45–46. Atlas Search index (log_search) defined and created"),
  bullet("\u2705 47. GET /api/search — keyword search, field conditions with per-field exact-phrase, date range, regex fallback"),
  bullet("\u2705 48. Search aggregation — sum / average / min / max for numeric fields"),
  bullet("\u2705 49. Search UI — search box, advanced filters, aggregation cards, tri-state sortable result table, detail panel (food/drink ingredients shown inline)"),
  bullet("\u2705 50. Auth middleware — all pages protected"),
  bullet("\u2705 51. Codebase cleanup — dead files removed"),
  bullet("\u2705 52. Cost analysis dashboard"),
  bullet("\u2705 53. Widget framework & Insights dashboard — see sub-items"),
  bullet("\u2705 56. Interactions widget — Summary + Trend + per-tab Method filter — see sub-items"),
  bullet("\u2705 57. Drinking widget — Summary + Trend (9 metrics) — see sub-items"),
  bullet("\u2705 60. Food ingredient taxonomy — see sub-items"),
  bullet("\u2705 61. Diet widget — Summary + Trend (8 tabs) — see sub-items"),
  bullet("\u2705 62. Drink ingredient taxonomy — see sub-items"),
  bullet("\u2705 54. Weight widget — Summary (box plot + body composition) and Trend (stacked area) both complete — see sub-items"),
  bullet("\u2705 55. Average bed-time widget — CLOSED as covered by the Sleep widget (Summary bedtime + Trend › Bedtime); no separate widget will be built"),
  bullet("\u2705 58. Exercise widget — Summary complete (per-item box plots, all-time bests, daily charts in a modal); Trend view deferred — see sub-items"),
  bullet("\u2B1C 59. Native calendar view — reuses the CalendarHeatmap built for #61"),
);
C(h3("Sub-items for #58 (Exercise Widget):"));
C(p("Data preparation, the compute module, the API branch and the Summary view are all complete and in use. The Trend view is deferred and has no agreed design. Design Doc \u00a79.3.6 carries the full widget specification and the reasoning behind each decision."));
C(bold("Done — source data"));
C(
  bullet("\u2705 Two new columns inserted at BU (부하) and BV (방식) in all five sheets; every column after them shifts by two; total 86"),
  bullet("\u2705 Exercise item names and units cleaned in the sheets"),
  bullet("\u2705 27 부하 values and 51 총 markers entered"),
  bullet("\u2705 activity.name keeps three values: 근육 운동 / 계단 오르기 / 유산소 운동. 계단 오르기 stays on its own because it is both cardio and leg strength — settled, do not fold it into 유산소 운동"),
  bullet("\u2705 달리기 and 달리기(Treadmill) stay as two separate items — outdoor and treadmill running are different — settled"),
  bullet("\u2705 Leg extension stays in English, although every other item name is Korean — settled"),
);
C(bold("Done — schema and migration"));
C(
  bullet("\u2705 Log.ts — exercise[].loadKg (Number) and exercise[].setStyle (String) added to both ILog and LogSchema"),
  bullet("\u2705 rowToDocument.ts — every index after col 71 shifted by +2; loadKg (72) and setStyle (73) read per item. Both are repeated across plus-split items, not divided the way amount is"),
  bullet("\u2705 scripts/migrate.ts — fetch range widened from A:CG to A:CI"),
  bullet("\u2705 Full re-migration of ~2025 and 2026; 43,123 documents, unchanged total"),
  bullet("\u2705 ~2025 block re-commented after the re-migration, so the daily run stays incremental"),
  bullet("\u2705 scripts/check-exercise-fields.ts — confirms both fields reached MongoDB. Result: 27 loads (Leg extension 40/45/50kg, 스쿼트 10kg) and 51 총 markers, matching the sheets exactly"),
  bullet("\u2705 Google Calendar sync Apps Script — getRange write targets moved from 83/84 to 85/86 (CG / CH). The staging formula rewrote itself; the script did not. See Design Doc §13"),
);
C(bold("Known facts about the data"));
C(p("Re-surveyed at v3.4 by scripts/inspect-exercise-units.ts, after the 층 to 분 conversion. These are measurements, not decisions. The counts quoted in v3.3 were taken before that conversion and before the 운동 scoping was tightened, and are superseded."));
C(table(["Item","Unit","Records","Days","With load","총"],[
  ["턱걸이","개","411","207","0","19"],
  ["딥스","개","295","115","0","8"],
  ["계단 오르기","분","283","247","0","0"],
  ["걷기","km","68","68","0","0"],
  ["팔굽혀펴기","개","62","61","0","19"],
  ["스쿼트","개","33","33","15","5"],
  ["달리기","km","22","22","0","0"],
  ["스텝퍼","분","17","17","0","0"],
  ["Leg extension","개","12","12","12","0"],
  ["요가","분","4","4","0","0"],
  ["매달리기","초","2","1","0","0"],
  ["달리기(Treadmill)","km","1","1","0","0"],
],[2400,1200,1440,1440,1440,1440]));
C(spacer());
C(table(["Fact","Value"],[
  ["Exercise entries","1,210 within activity.category = 운동, one item per document"],
  ["Distinct items","12"],
  ["Distinct units","4 — 개 813, 분 304, km 91, 초 2. One unit per item, from v3.4. The units are not comparable to each other"],
  ["duration.totalSeconds coverage","100% — every exercise record now carries a duration (was 42.9% at v3.3)"],
  ["Records with a load","27 — Leg extension 12 (40/45/50kg) and 스쿼트 15 (10kg) only"],
  ["총 markers","51 — 턱걸이 19, 팔굽혀펴기 19, 딥스 8, 스쿼트 5. setStyle takes exactly two values across the collection: null (1,159) and 총 (51)"],
  ["Multi-record days","Only 턱걸이 and 딥스 hold more than one record per day; together they are 58% of all records"],
  ["Records outside activity.category = 운동","6 rows contain 걷기 under 문화/취미 and 육아. These are excluded from the widget and from the table above"],
  ["Per-year spread","2019: 105, 2020: 671, 2021: 185, 2022: 90, 2023: 1, 2024: 0, 2025: 83, 2026: 79 (v3.3 figures, not re-surveyed)"],
],[3400,5960]));
C(spacer());
C(note("Note: 2020 alone holds 55% of all records, and 2023–24 is almost empty. The item vocabulary differs on each side of that gap — 턱걸이 and 딥스 before, 스텝퍼 after. Treat this as three separate periods of practice, not one continuous habit."));
C(bold("Done \u2014 widget"));
C(
  bullet("\u2705 src/lib/insights/exercise.ts \u2014 computeExerciseSummary. ONE unbounded fetch of every \uc6b4\ub3d9 record with the period cut in memory, because the personal bests are all-time and the rest is period-scoped. No MongoDB date filter is used at all; dates are compared as YYYY-MM-DD strings built from start.year/month/day"),
  bullet("\u2705 stats/route.ts \u2014 metric=exercise.summary branch, summary mode only"),
  bullet("\u2705 ExerciseWidget.tsx, registered in the page.tsx WIDGETS array"),
  bullet("\u2705 Summary \u2014 period counter and HeatStrip opening a CalendarHeatmap modal, then a two-column grid of item blocks carrying an all-time bests line, one chart per box, and the period total. Tapping a block opens a modal with the daily-total chart and, where it differs, the biggest-set chart"),
  bullet("\u2705 ModalShell extracted from DietWidget to _components/ModalShell.tsx \u2014 a second consumer, so extracted rather than copied, per A.1"),
  bullet("\u2705 emphasizeLast added to CssVerticalBoxPlotChart, defaulting true so no existing call site changes; Exercise passes false because Set and Day are categories, not periods, and bolding the last of them means nothing"),
  bullet("\u2705 \ucda9 semantics established and documented \u2014 a day total with an unknown set split, NOT a rest-pause set. Excluded from the Set box, dailySetMax and bestSet; included in the Day box, total and bestDay"),
);
C(bold("Deferred \u2014 not built"));
C(
  bullet("\u2B1C Trend view \u2014 out of scope for #58; no design proposed"),
  bullet("\u2B1C Load-in-kg line on the daily chart \u2014 no existing component carries two y-axes (CssDualLineChart is hard-wired to session times, CssRestChart to the rest histogram). Load exists on 2 items of 12 and \uc2a4\ucffc\ud2b8 carries it on only 15 of 33 records, so the line would be mostly gaps. See Design Doc \u00a79.3.6"),
  bullet("\u2B1C Rename REST_PAUSE / restPauseCount / bestSetRestPause \u2014 misnomers left over from the earlier reading of \ucda9. bestSetRestPause is still computed and returned, but deliberately not rendered"),
  bullet("\u2B1C Set-box exclusion caption \u2014 present in the widget but near-unreachable, since it needs both a \ucda9 record and 3+ days for the item in the same period. Left as-is deliberately"),
);
C(h3("Sub-items for #54 (Weight Widget):"));
C(
  bullet("\u2705 src/lib/insights/weight.ts — computeWeightSummary; collapseToDays() shared by the period query and the latest-ever lookup; buildComposition normalises bodyFatPercent and degrades to a weight-only bar"),
  bullet("\u2705 stats/route.ts — metric=weight.summary branch (summary mode only)"),
  bullet("\u2705 Summary — single-bucket box plot beside a merged BODY COMPOSITION block: AVERAGE and LATEST stacked bars sharing one scale, a delta strip between them, one shared legend"),
  bullet("\u2705 latest is NOT period scoped — the most recent measurement overall, so the comparison is 'now vs then' rather than a past month against its own last day; crossActivities still applies to both"),
  bullet("\u2705 No 6am day boundary — morning weigh-ins belong to their own calendar day"),
  bullet("\u2705 Weight-only (pre-InBody) ranges render an un-segmented bar rather than disappearing"),
  bullet("\u2705 CompositionRow measures itself via ResizeObserver to decide which figures fit inside each segment"),
  bullet("\u2705 Registered in page.tsx WIDGETS array (floor 1)"),
  bullet("\u2705 css-chart-components.tsx — non-compact CssVerticalBoxPlotChart prints max/avg/min values on the last bucket (name legend removed); tooltip gained P75/P25. Affects Diet Trend and Drinking Amt(day) — both verified"),
  bullet("\u2705 lib/insights/weight.ts — computeWeightTrend; one query for the whole span, bucketed in memory (a 400-bucket day request would otherwise be 400 round trips); buckets clamped at 400 server-side"),
  bullet("\u2705 stats/route.ts — metric=weight.trend branch; params granularity × buckets × optional end; responds under the key trend, not summary"),
  bullet("\u2705 Trend anchor = min(end of selected period, today). Anchoring on the newest weigh-in would hide a gap in readings; anchoring on today would override a deliberate past-period selection. Taking the earlier of the two satisfies both"),
  bullet("\u2705 Leading empty buckets trimmed; interior empty buckets kept and drawn as a break in the line"),
  bullet("\u2705 CssStackedAreaChart — new shared component: continuous total line plus a fill that starts where composition data begins; null-tolerant; absolute / percent modes; bands clipped to the plot box"),
  bullet("\u2705 WeightTrendView.tsx — one chart with a three-state unit control (Weight / kg / %), granularity and bucket-count selectors, ISO-to-short label conversion, resolved-range header clamped to today"),
  bullet("\u2705 kg mode sits on a zero baseline — a cropped axis pushed every internal stack boundary off-screen, leaving one band covering the plot. Weight mode restores the zoomed line the zero baseline flattens"),
  bullet("\u2705 Composition buckets average full-triple days only, so segments sum exactly to the bar. Where the total line and the fill top diverge, that divergence IS the pre-InBody boundary — deliberate, not to be reconciled"),
  bullet("\u2705 weight-colors.ts — SEG palette extracted from WeightWidget so the Trend view can import it without a circular dependency; stack order bottom-to-top matches the Summary bar left-to-right"),
  bullet("\u2705 Segmented extracted to _components/Segmented.tsx (generic over string | number); DietWidget migrated to the shared copy and re-verified"),
  bullet("\u2705 inPlot() gridline guard added to CssTrendChart, CssVerticalBoxPlotChart, CssStackedAreaChart and CssDailyChart — buildYTicks can return a tick above yMax and the unclipped plot painted it up into the widget header"),
  bullet("\u2705 x-label thinning changed to a fixed stride walked back from the newest bucket, and labels are thinned BEFORE being shortened — previously the one label carrying the year was often the one discarded, and pinned labels could collide"),
);
C(h3("Sub-items for #53 (Widget Framework):"));
C(
  bullet("\u2705 Two-dimensional analytics framework (subject domain × analytical floor)"),
  bullet("\u2705 WidgetCard shell — floor badge, title, loading/error state, action slot"),
  bullet("\u2705 Responsive CSS-columns layout (masonry; no gaps under shorter widgets)"),
  bullet("\u2705 Global filter bar — 4 time modes; cross-activity multi-select; Apply"),
  bullet("\u2705 Summary / Trend view toggle (Trend disabled in Period mode)"),
  bullet("\u2705 Chart colour template — useIsDark() + chartColors(isDark)"),
  bullet("\u2705 File structure — page.tsx split across _lib/, _components/, _widgets/"),
  bullet("\u2705 GET /api/insights/stats dispatcher — sleep, interactions, drinking, diet"),
  bullet("\u2705 Shared chart library — CssTrendChart, StackedBars, CssRankFlowChart, bars.tsx (Title/BarRow/BarSection), BoxPlot, Histogram, Treemap, CalendarHeatmap/HeatStrip, CssDailyChart, CssVerticalBoxPlotChart, CssDualLineChart, CssRestChart"),
  bullet("\u2705 MultiSelectDropdown — portal-rendered panel, edge/scroll/resize-aware"),
);
C(h3("Sub-items for #56 (Interactions Widget):"));
C(
  bullet("\u2705 API: interactions.summary — summary and trend modes"),
  bullet("\u2705 Summary — two-column stats grid (interactions | unique people, each Relation Type + Method) + full-width PeopleBars (top 10, ranks 1–5 / 6–10, jointly normalised, dominant-relation colour)"),
  bullet("\u2705 Trend — 5 tabs: Interactions, Unique, Relation, Method, People (rank-flow)"),
  bullet("\u2705 Per-tab Method filter — Summary and the Interactions/Unique/Relation tabs each carry an independent selection, recomputed server-side; the Method tab stays full; People keeps its own Relation + Method controls"),
);
C(h3("Sub-items for #57 (Drinking Widget):"));
C(
  bullet("\u2705 alcohol_conversion collection (54 rows, item × unit → drinks)"),
  bullet("\u2705 API: drinking.summary — 6am threshold, drinks stats, drinkType, occasions, companions, session time"),
  bullet("\u2705 API: drinking.summary trend mode — per-bucket fields incl. rest histogram"),
  bullet("\u2705 Summary — Drinking Days + Total Drinks, Drinks-Per-Day box plot, two-column bar block (Drink Type / Occasion | Relation / People), rest histogram, session time"),
  bullet("\u2705 Trend — 9 tabs: Freq, Amt(all), Amt(day), Type, Occasion, Relation, People, Rest, Session"),
  bullet("\u2705 CSS chart components — CssTrendChart, CssVerticalBoxPlotChart, CssDualLineChart, CssRestChart"),
  bullet("\u2705 Week-label compression; ISO-week calculation (Jan-4 reference); formatBucketLabel handles compressed labels"),
);
C(h3("Sub-items for WBS #60 (Food Ingredient Taxonomy):"));
C(
  bullet("\u2705 Two-level taxonomy designed (level1 / level2): 62 level2 values across 14 level1 groups"),
  bullet("\u2705 ingredient_master collection + IngredientMaster.ts model; unique index { userId, level2 }"),
  bullet("\u2705 scripts/migrate-ingredient.ts — seeds ingredient_master from the Ingredient sheet"),
  bullet("\u2705 Log.ts: food.foods[].ingredients (String[]) via separate foodsItemSchema (drinks gained their own schema in WBS #62; alcohols unchanged)"),
  bullet("\u2705 transform.ts: parseFoodIngredients(), loadValidLevel2(), resetValidLevel2(), IngredientValidationError"),
  bullet("\u2705 rowToDocument.ts: foods post-processed through parseFoodIngredients (drinks added in WBS #62; alcohols never parsed)"),
  bullet("\u2705 migrate.ts: loadValidLevel2() awaited at startup; per-row try/catch skips + logs invalid ingredient rows"),
  bullet("\u2705 Parenthesis notation adopted in source data: 밥(쌀)+계란(계란); pipe separator inside parens"),
  bullet("\u2705 scripts/fill-historical-ingredients.ts: REVIEWED_MAP (1,156 entries, 6 review batches) + bestGuess fallback; modes --dry-run / --export-worklist / write; treats [\"Not Defined\"] as refillable"),
  bullet("\u2705 Historical fill: 6,154 documents / 15,375 food items, all with ingredients, 0 Not Defined"),
  bullet("\u2705 scripts/inspect-ingredients.ts, reconcile-foods.ts, scan-bad-parens.ts (survey / reconcile / legacy-paren cleanup)"),
  bullet("\u2705 Legacy descriptive parentheses cleaned ((국만)/(국물)/(밥만)/content lists); reconciliation 0 gap"),
  bullet("\u2705 alcohol_conversion 와인/ml row added; taxonomy renames (해물 육수, 채소 육수, 기타 해산물); 콩류/청국장 moved under 곡류"),
  bullet("\u2705 GET /api/search: mixed phrase (quoted) + free-token query via compound.must"),
);
C(h3("Sub-items for WBS #62 (Drink Ingredient Taxonomy):"));
C(
  bullet("\u2705 Extended ingredient_master with 음료 level1 (커피, 디카페인 커피, 보이차, 홍차, 녹차, 허브차, 탄산, 카페인, 기타 음료) and 당류 level1 (설탕/꿀 moved from 양념, 쨈 moved here, 초콜릿 added)"),
  bullet("\u2705 Log.ts: food.drinks[].ingredients (String[]) via new drinksItemSchema; alcohols left unchanged (no ingredients)"),
  bullet("\u2705 rowToDocument.ts: food.drinks post-processed through parseFoodIngredients (same .map() as foods); drink note tag preserved"),
  bullet("\u2705 scripts/fill-historical-drinks.ts: DRINK_MAP (278 reviewed entries) + 아이스/핫 normalisation + substring fallback; modes --dry-run / --export-worklist / write; treats [\"Not Defined\"] as refillable"),
  bullet("\u2705 scripts/inspect-drinks.ts; scan-bad-parens.ts extended to scan the drink column"),
  bullet("\u2705 Historical fill: ~5,006 documents / ~5,462 drink items, all with ingredients, 0 Not Defined; reconciliation 0 gap"),
  bullet("\u2705 Drink-specific mapping rules: 커피 implies caffeine; 카페인 for added-caffeine drinks; 탄산 = pure carbonated water (콜라→탄산|설탕, zero→탄산|기타 소스); sports/vitamin drinks→기타 음료|설탕; 보이차 kept as its own value"),
);
C(h3("Sub-items for WBS #61 (Diet Widget):"));
C(
  bullet("\u2705 API: diet.summary (computeDietSummary) — reuses assignDrinkingDate 6am boundary; food/drink-bearing fetch with 6h early lookback; ingredient_master level2→level1 join in JS; rangeStart/rangeEnd for the calendar"),
  bullet("\u2705 chart-colors.ts: CATEGORY_COLORS_LIGHT/DARK + categoryColors(isDark) — taxonomy-agnostic indexed palette (no group names in widget code)"),
  bullet("\u2705 Treemap.tsx — squarified treemap; ResizeObserver-measured CSS cells; top-N cap + 기타 (+N) rollup"),
  bullet("\u2705 CalendarHeatmap.tsx — CalendarHeatmap (Mon–Sun grid, modal) + HeatStrip (single-row inline strip)"),
  bullet("\u2705 css-chart-components.tsx: CssDailyChart added (avg line + zone bands + above-marker tooltip); CssVerticalBoxPlotChart gained formatY + height props"),
  bullet("\u2705 DietWidget.tsx Summary view: distribution box plots (Finish/인분/Carbs) with daily-line modals; spiciness strip + calendar modal; Food/Drink × Ingredients/Items treemap toggles; with-whom toggle (relation / companions); uppercase titles"),
  bullet("\u2705 Registered in page.tsx WIDGETS array (floor 1)"),
  bullet("\u2705 Trend view — 8 tabs: four box-plot metrics (Eating/Caffeine/Servings/Carbs), three StackedBars tabs (Composition with Food/Drink × Ingredients/Items toggles, Spicy, Relation), and People (CssRankFlowChart of top-7 companions with a client-side Relation filter); per-person people:{name:{category:count}} trend field; drink-only companions counted; 아침 6am-rollback exception; trendLoadedRef keeps the active tab across bucket-size changes"),
);

C(h2("Phase 5 — Data Entry \u2B1C"));
C(
  bullet("\u2B1C 1. Daily log entry form (web)"),
  bullet("\u2B1C 2. Mobile-friendly entry UI"),
  bullet("\u2B1C 3. Custom fields per user"),
  bullet("\u2B1C 4. Quick entry (minimal tap/click)"),
  bullet("\u2B1C 5. Push notification reminders"),
  bullet("\u2B1C 6. Master collection management UI (activity_master, cost_master, reference_lists, ingredient_master)"),
);

C(h1("6. Open Questions & Backlog"));
C(h2("6.1 Open Questions"));
C(table(["#","Question","Status"],[
  ["1","Free-trial period duration?","Open"],
  ["2","Subscription pricing?","Open"],
  ["3","Mobile — React Native or PWA?","Open"],
  ["4","AI provider for fact search / insight suggestions?","Open"],
  ["5","Data-retention policy?","Open"],
  ["6","Master collections — user-editable via UI in Phase 5?","Open — Phase 5"],
  ["7","Atlas Search index — dynamic mapping or explicit field mapping?","Open"],
  ["8","food.foods[].ingredients in the Atlas Search index, or analytics-only?","Open"],
],[700,5900,2760]));
C(spacer());
C(h2("6.2 Backlog (deferred / nice-to-have)"));
C(
  bullet("\u2B1C foodsItemSchema.amount String → Number — housekeeping; the API uses parseFloat, so non-blocking"),
  bullet("\u2B1C Drinking / Interactions Summary-vs-Trend colour sources differ (Summary uses barColors; Trend keeps its own) — intentional for now, may revisit"),
  bullet("\u2B1C Companions rank-flow bump chart for the Diet Trend tab — placeholder idea"),
  bullet("\u2B1C Insights page: widgets render in fixed WIDGETS-array order. The CSS-columns layout repacks by height but there is no drag-to-reorder — the Cost dashboard has @dnd-kit + localStorage persistence that could be ported"),
  bullet("\u2B1C WidgetCard header divider — briefly removed on a wrong diagnosis, then restored. The stray line was a chart gridline escaping upward, not the divider; no change is outstanding"),
  bullet("\u2B1C Search UI — no numeric filter for exercise[].loadKg. The field is listed in Design Doc §7.4 as available to aggregate, but the search page offers no control for it"),
);
C(spacer());

C(h1("Appendix — Development Rules & No-Regression Policy"));
C(h2("A.1 Core Development Rules"));
C(
  bullet("Never work on two widgets simultaneously — complete and verify one before starting another"),
  bullet("Never give full file replacements for shared files (stats/route.ts, bars.tsx, GlobalFilterBar.tsx) — always provide targeted str_replace patches"),
  bullet("Exception: full replacement is acceptable when Hyoje explicitly requests it AND uploads the latest version of the file first"),
  bullet("When a full replacement is unavoidable, explicitly state which other widgets or features may be affected"),
  bullet("Never assume the output directory file is the same as what is deployed — always ask Hyoje to upload the current file when working on shared code"),
);
C(h2("A.2 Shared File Change Protocol"));
C(table(["File","Used by","Rule"],[
  ["src/app/api/insights/stats/route.ts","All widgets","Targeted patches only. Always read current version first. Verify session?.user?.userId is used."],
  ["src/app/insights/_components/charts/bars.tsx","Diet, Drinking, Interactions summaries","Targeted patches only. Shared summary-bar primitives (Title / BarRow / BarSection). Changing the geometry or the {pct}% ({count}) value format affects all three summaries."],
  ["src/app/insights/_components/charts/css-chart-components.tsx","DrinkingWidget, DietWidget, WeightWidget","Full replacement acceptable when Hyoje uploads latest version. compressWeekLabels() is shared — preserve it. CssVerticalBoxPlotChart has THREE call sites (Diet Summary compact, Diet Trend, Drinking Amt(day)) plus Weight Summary and, from v3.4, Exercise (one chart per box) — check all six before changing its label layout. WARNING: the bold-last-label style block is duplicated across FIVE chart components in this file; anchor any patch on a uniquely-named identifier such as hasXLabels, never on the style line alone."],
  ["src/app/insights/_lib/format.ts","All widgets via chart-components","Targeted patches only. formatBucketLabel handles month, week (raw + compressed), and day formats."],
  ["src/app/insights/_components/GlobalFilterBar.tsx","Insights page","Targeted patches only. Activity Type filter commits on Apply."],
  ["src/app/insights/_components/WidgetCard.tsx","All widgets","Targeted patches only. Changes affect every widget simultaneously."],
  ["src/app/insights/_components/ModalShell.tsx","Diet, Exercise","(v3.4) Targeted patches only. Portal modal on document.body; it exists specifically to escape widget-card overflow:hidden, so do not reparent it into the card."],
  ["src/lib/migration/transform.ts","migrate, fill, reconcile, scan scripts","Targeted patches only. parseFoodIngredients / loadValidLevel2 are shared. Keep IngredientMaster import at top of file."],
],[3000,2600,3760]));
C(spacer());
C(h2("A.3 Regression Prevention Checklist"));
C(
  bullet("Sleep widget: Summary shows duration/bedtime/wake/quality. Trend shows all 4 metrics with correct week labels."),
  bullet("Interactions widget: Summary shows the two-column stats grid + full-width PeopleBars (no tabs). Trend shows all 5 chart types with correct week labels."),
  bullet("Drinking widget: Summary shows the box plot, the two-column bar block (Drink Type / Occasion | Relation / People), the rest histogram and session time (no tabs). Trend shows all 9 metrics correctly."),
  bullet("Ingredients: after migrate + fill, inspect shows 0 Not Defined and reconcile shows 0 gap. Spot-check new-notation rows parse from parentheses."),
  bullet("Global filter: All 4 time modes work including Week mode (ISO week numbers). Activity Type multi-select commits on Apply."),
  bullet("Auth: All widgets return data (not 403). Confirm session?.user?.userId is read correctly."),
  bullet("Weight widget: Summary shows the box plot with printed values, both composition bars, the delta strip and one legend. Filtering to a pre-InBody month gives un-segmented bars; LATEST still shows the most recent date overall."),
  bullet("Dark mode: All charts render correctly in both light and dark mode."),
);
C(h2("A.4 API Route Safety"));
C(
  bullet("The userId line must always read: const userId = (session as any)?.user?.userId;"),
  bullet("Never use (session as any)?.userId — this was the source of a major regression."),
  bullet("stepBack() and currentPeriod() must use ISO week calculation (Jan 4 reference, not Jan 1)."),
);
C(h2("A.5 Ingredient & Master-Table Rules"));
C(
  bullet("ingredient_master is the single source of truth for the level2 vocabulary — never hard-code VALID_LEVEL2 in transform.ts."),
  bullet("Run migrate-ingredient once; re-run only when the Ingredient sheet changes (renames, new values, regrouping)."),
  bullet("Daily sequence after any source change: npm run migrate → fill-historical-ingredients.ts → fill-historical-drinks.ts → inspect (both) → reconcile. The two fills are independent; order between them does not matter."),
  bullet("The fill script treats [\"Not Defined\"] as refillable, so it is safe to run after every migrate; it skips items that already have real ingredients."),
  bullet("Before re-migrating old rows, run scan-bad-parens.ts and clean any legacy descriptive parentheses ((국만)/(국물)/(밥만)/content lists)."),
  bullet("Ingredient parsing applies to food.foods[] and food.drinks[] — never to food.alcohols[]."),
  bullet("To update alcohol_conversion: edit AlcoholConv sheet → npm run migrate-alcohol (no log re-migration needed)."),
);

C(h2("A.6 Google Sheets Column Insertion Rules"));
C(p("Inserting a column into the source sheets moves every column after it. Three places depend on column position, and they do not all update themselves."));
C(table(["Place","Updates itself?","What to do"],[
  ["Calendar staging sheet formula","Yes","Uses A1-style references (Active!CG:CG). Google Sheets rewrites them on insert. Open the sheet and confirm, but no edit is normally needed."],
  ["Calendar sync Apps Script","No","Uses getRange(row, number). Edit finalizeSourceRow and clearSourceStatus by hand. Remember getRange is 1-based while the design doc index is 0-based — add one."],
  ["rowToDocument.ts and migrate.ts","No","Shift every affected index, and widen the fetch range."],
],[2600,1800,4960]));
C(spacer());
C(
  bullet("Do not tick Q1 on the Calendar sheet until the Apps Script is patched and saved. An unpatched run writes Synced markers and event IDs into whichever columns now sit at the old positions, and then re-inserts every event as a duplicate."),
  bullet("Run one test row before a full sync."),
  bullet("Re-comment the ~2025 block in migrate.ts after any full re-migration."),
  bullet("Update Design Doc §10.1.5 and §13 in the same session as the code change."),
);
C(spacer());

C(new Paragraph({ children: [new TextRun({ text: "FarGaze — Service Concept & WBS v3.4 — 29 July 2026", italics: true })], spacing: { before: 240 }, alignment: AlignmentType.CENTER }));

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" }, paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: "Arial" }, paragraph: { spacing: { before: 140, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 280 } } } },
    ]},
    { reference: "numbers", levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
    ]},
  ]},
  sections: [{ properties: { page: PAGE }, children }],
});
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("FarGaze-WBS-v3.4.docx", buffer);
  console.log("Wrote FarGaze-WBS-v3.4.docx (" + buffer.length + " bytes), " + children.length + " elements");
});