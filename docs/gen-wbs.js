const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, LevelFormat, AlignmentType } = require('docx');
const H = require('./docx-helpers.js');
const { h1, h2, h3, p, note, bold, bullet, num, spacer, table } = H;

const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
const children = [];
const C = (...xs) => xs.forEach(x => children.push(x));

// TITLE
C(
  new Paragraph({ children: [new TextRun({ text: "FarGaze", bold: true, size: 48 })], spacing: { after: 120 } }),
  new Paragraph({ children: [new TextRun({ text: "Service Concept & Work Breakdown Structure", size: 32 })], spacing: { after: 60 } }),
  new Paragraph({ children: [new TextRun({ text: "Version 2.7  |  25 June 2026", size: 24 })], spacing: { after: 240 } }),
);

// VERSION HISTORY
C(h1("Version History"));
C(table(["Version","Date","Summary of Changes"],[
  ["1.0","27 Apr 2026","Initial version — service concept, tech stack, WBS phases 1–5"],
  ["1.1","27 Apr 2026","Marked completed tasks; added subtasks for Phase 2 and Phase 3; updated open questions"],
  ["1.2","28 Apr 2026","Phase 3 completed; migration simplified to archive-only; incremental sync deferred"],
  ["1.3","29 Apr 2026","Phase 4 started; duration.totalSeconds added; Atlas Search index defined; WBS Phase 4 expanded"],
  ["1.4","30 Apr 2026","WBS #41–#47 marked complete; spending dashboard WBS items #48–#54 added"],
  ["1.5","30 Apr 2026","WBS #48 (cost analysis dashboard) marked complete; security fix documented"],
  ["1.6","10 May 2026","WBS #17 (cross-activity filter) marked complete; GET /api/cross-activities added"],
  ["1.7","14 May 2026","WBS #53 (widget framework) marked complete; Insights dashboard added; three initial widgets"],
  ["1.8","15 May 2026","WBS #53 sub-items updated: global filter redesigned, Sleep widget fully implemented; dark mode chart; file refactor"],
  ["1.9","16 May 2026","WBS #56 (Interactions widget) Summary view complete; migration fix; chart colour template established"],
  ["2.0","17 May 2026","WBS #56 Trend view complete: 5 chart types; shared chart library; MultiSelectDropdown; Top 7 filters"],
  ["2.1","21 May 2026","WBS #57 (Drinking widget) complete: Summary view (Stats + Top 10), BoxPlot, Histogram, alcohol_conversion collection, drinking.summary API"],
  ["2.2","22 May 2026","WBS #57 Trend view complete: 8 metric tabs, CSS chart components, page layout to CSS columns, week label compression, ISO week fix, formatBucketLabel fix"],
  ["2.3","4 Jun 2026","WBS #60 (Food ingredient taxonomy) complete: ingredient_master collection, food.foods[].ingredients field, parseFoodIngredients parser with level2 validation, historical fill of ~6,150 rows (REVIEWED_MAP 1,156 entries over 6 batches), reconciliation verified (0 gap, 0 Not Defined); alcohol_conversion 와인/ml row added; taxonomy renames; daily routine and master-table update procedures documented in Design Doc v3.1"],
  ["2.4","5 Jun 2026","WBS #62 (Drink ingredient taxonomy) complete: food.drinks[].ingredients field (drinksItemSchema), same parseFoodIngredients parser reused for drinks; new 음료 level1 group (9 values) + 당류 level1 group (설탕/꿀 moved from 양념, 쨈 moved here, 초콜릿 added); fill-historical-drinks.ts (278 reviewed entries) + inspect-drinks.ts; scan-bad-parens.ts extended to drink column; ~5,460 drink items filled, 0 Not Defined, reconciliation 0 gap; documented in Design Doc v3.2"],
  ["2.5","12 Jun 2026","WBS #61 (Diet widget) Summary view complete: diet.summary API (computeDietSummary) reusing the 6am day-boundary and an ingredient_master level2→level1 join; seven summary metrics — distribution box plots (finish time / 인분 with zone bands / carbs), spiciness HeatStrip + Mon–Sun CalendarHeatmap, food & drink ingredient/item treemaps, with-whom companions — with tap-to-open daily-line and calendar modals; new chart components Treemap, CalendarHeatmap/HeatStrip, CssDailyChart; CssVerticalBoxPlotChart gained formatY+height; taxonomy-agnostic categoryColors palette; registered in page.tsx; documented in Design Doc v3.3. Trend view pending."],
  ["2.6","20 Jun 2026","WBS #61 (Diet widget) Trend view complete — eight tabs: four box-plot metrics (Eating/Caffeine/Servings/Carbs), three StackedBars composition tabs (Composition, Spicy, Relation), and People (top-7 companion rank-flow). New CssRankFlowChart (CSS-only ranked-flow: colour-tiles ranked top-to-bottom, dashed reference line, dropped-people block, hover-trace, blur-names, controls slot), reusable StackedBars (percent/absolute, legend hover-highlight), and a portal-based rebuild of MultiSelectDropdown (renders on document.body, escapes widget-card overflow, edge-aware). Per-person people:{name:{category:count}} field added to the diet and drinking trend buckets; diet companions now count drink-only meetups; 아침 (breakfast) records exempt from the 6am rollback. Backported: Interactions swapped to CssRankFlowChart with tabs renamed (Type→Relation, Top 7→People, the unique-count tab → Unique) and a Relation filter; Drinking gained a People rank-flow tab and renamed its companion stack People→Relation. Unified Relation/People naming across the three trend views; default bucket count 12. Documented in Design Doc v3.5."],
  ["2.7","25 Jun 2026","Insights polish pass (#1–#9) + bar standardisation complete (no schema or API-shape changes). Interactions and Drinking summaries restructured to drop their Stats/Top 10 tabs: Interactions → always-on two-column stats grid (left interactions, right unique people, each Relation Type + Method) plus a full-width PeopleBars block (top 10 split ranks 1–5 / 6–10, jointly normalised against one shared max, each bar coloured by the person's dominant relation type) — TopPeopleTable, summaryTab state and SummaryTab type removed. Drinking keeps its Drinking Days + Total Drinks counters, Drinks-Per-Day box plot, rest histogram and session-time rows but reworks the bar block into two columns (left Drink Type / Occasion, right Relation / People), renaming \"With Whom\" → Relation and folding the old Top 10 in as People bars. New shared bars.tsx (Title / BarRow / BarSection — desc-sorted, max-normalised, {pct}% ({count})) + dedicated barColors palette (BAR_COLORS_LIGHT/DARK + barColors + autoColorMap) in chart-colors.ts, kept separate from categoryColors and rankFlowColors; applied across the Diet, Drinking and Interactions summaries. Legacy SVG module _lib/chart-components.tsx (TrendChart, StackedBarChart, RankedFlowChart) and CssStackedBarChart retired; StackedBarBucket now local to InteractionsWidget. Search: per-field exact-phrase conditions via parseQuery (mirrored in the Atlas and regex-fallback condition loops) and client-side tri-state sortable result columns. Documented in Design Doc v3.6."],
],[1100,1500,6760]));
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

// 4. WBS
C(h1("4. WBS (Work Breakdown Structure)"));
C(p("\u2705 = Completed   \u2B1C = Pending   DESCOPED = out of scope for MVP"));
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
  bullet("\u2705 41. Schema update: remove duration.d/h/m/s; add duration.totalSeconds"),
  bullet("\u2705 42–44. Update rowToDocument.ts, Log.ts, re-migrate all data"),
  bullet("\u2705 45–46. Define and create Atlas Search index (log_search)"),
  bullet("\u2705 47. API route: GET /api/search — keyword search, field conditions, date range, regex fallback (v2.7: per-field exact-phrase conditions via parseQuery, mirrored across the Atlas and regex condition loops)"),
  bullet("\u2705 48. Search result aggregation: sum / average / min / max for numeric fields"),
  bullet("\u2705 49. Search UI: search box, advanced filters, aggregation cards, result table, detail panel (v2.7: client-side tri-state sortable result columns)"),
  bullet("\u2705 50. Auth middleware: all pages protected, unauthenticated users redirected to sign in"),
  bullet("\u2705 51. Codebase cleanup: removed dead files"),
  bullet("\u2705 52. Cost analysis dashboard"),
  bullet("\u2705 53. Widget framework and Insights dashboard"),
  bullet("\u2705 56. Widget: Interactions — Summary view (v2.7: two-column stats grid + full-width PeopleBars, no tabs) + full Trend view"),
  bullet("\u2705 57. Widget: Drinking — Summary view (v2.7: two-column bar block + People bars, no tabs) + full Trend view (9 metrics)"),
  bullet("\u2705 60. Food ingredient taxonomy (NEW) — see dedicated sub-items below"),
  bullet("\u2705 61. Widget: Diet — Summary view + full Trend view (8 metric tabs) complete — see dedicated sub-items below"),
);
C(h3("Sub-items for WBS #53 (Widget Framework):"));
C(
  bullet("\u2705 Two-dimensional analytics framework defined"),
  bullet("\u2705 WidgetCard shell — floor badge, title, loading/error state, action slot"),
  bullet("\u2705 Responsive layout — CSS columns (masonry-style, no gaps under shorter widgets)"),
  bullet("\u2705 Global filter bar — 4 time modes; cross-activity multi-select; Apply button"),
  bullet("\u2705 Widget view mode toggle — Summary / Trend; Trend disabled for Period time mode"),
  bullet("\u2705 Trend chart — SVG spline (tension=0.2), flexible Y-axis, hover/tap interaction"),
  bullet("\u2705 Chart colour template: useIsDark() + chartColors(isDark)"),
  bullet("\u2705 File structure: page.tsx split into 11 files across _lib/, _components/, _widgets/"),
  bullet("\u2705 GET /api/insights/stats — supports sleep.all, interactions.summary, drinking.summary"),
  bullet("\u2705 Widget: Sleep — Summary + Trend (4 metrics, dark mode)"),
  bullet("\u2705 Widget: Interactions — Stats tab + Top 10 tab + full Trend view (5 chart types) — framework-era state; Summary later restructured v2.7 (see #56 sub-items)"),
  bullet("\u2705 Shared chart library: CssRankFlowChart and reusable StackedBars added v2.6; shared summary-bar primitives bars.tsx (Title / BarRow / BarSection) + barColors palette added v2.7. The legacy SVG module _lib/chart-components.tsx (TrendChart, StackedBarChart, RankedFlowChart) and CssStackedBarChart were retired in v2.7"),
  bullet("\u2705 Shared UI component: MultiSelectDropdown — rebuilt v2.6 to render its panel through a React portal on document.body (escapes widget-card overflow:hidden; edge-/scroll-/resize-aware)"),
);
C(h3("Sub-items for WBS #56 (Interactions Widget):"));
C(
  bullet("\u2705 API: interactions.summary — summary mode and trend mode"),
  bullet("\u2705 Summary view: restructured v2.7 — Stats/Top 10 tabs dropped for an always-on two-column stats grid (left interactions, right unique people; each Relation Type + Method) plus a full-width PeopleBars block (top 10 split ranks 1–5 / 6–10, jointly normalised against one shared max, each bar coloured by the person's dominant relation type). TopPeopleTable, the summaryTab state and the SummaryTab type were removed; PeopleBars composed from the shared bars.tsx primitives"),
  bullet("\u2705 Trend view: 5 metric tabs (Interactions, Unique, Relation, Method, People) — People is the CssRankFlowChart rank-flow (swapped from the SVG RankedFlowChart v2.6); tabs renamed v2.6 (People→Unique, Type→Relation, Top 7→People)"),
  bullet("\u2705 People widget-local filters: Relation + Method; AND logic; commit-on-close, server-side re-fetch"),
);
C(h3("Sub-items for WBS #57 (Drinking Widget):"));
C(
  bullet("\u2705 alcohol_conversion collection seeded (54 rows as of v2.3; 와인/ml added)"),
  bullet("\u2705 API: drinking.summary — summary mode with 6am threshold, drinks stats, drinkType, occasions, companions, session time"),
  bullet("\u2705 API: drinking.summary trend mode — 8 bucket fields including histogram for Rest chart"),
  bullet("\u2705 Summary view: restructured v2.7 — tabs dropped, all blocks always-on. The Drinking Days + Total Drinks counters, Drinks-Per-Day box plot, rest histogram and session-time rows are unchanged; the bar block was reorganised into two columns (left Drink Type / Occasion, right Relation / People), \"With Whom\" renamed Relation, and the old Top 10 tab folded in as People bars (each person coloured by dominant relation type) using the shared bars.tsx + barColors palette"),
  bullet("\u2705 Trend view: 9 metric tabs — Freq, Amt(all), Amt(day), Type, Occasion, Relation, People, Rest, Session (v2.6: added People rank-flow via CssRankFlowChart + per-person people field with client-side Relation filter; renamed the companion stack People→Relation)"),
  bullet("\u2705 CSS chart components: CssTrendChart, CssVerticalBoxPlotChart, CssDualLineChart, CssRestChart (CssStackedBarChart retired v2.7)"),
  bullet("\u2705 Week label compression (compressWeekLabels) applied to all 5 CSS charts"),
  bullet("\u2705 ISO week fix in stepBack() and currentPeriod() — Jan-4-based calculation"),
  bullet("\u2705 formatBucketLabel() updated to handle compressed week label format"),
);
C(h3("Sub-items for WBS #60 (Food Ingredient Taxonomy) — NEW:"));
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
C(h3("Sub-items for WBS #62 (Drink Ingredient Taxonomy) — NEW:"));
C(
  bullet("\u2705 Extended ingredient_master with 음료 level1 (커피, 디카페인 커피, 보이차, 홍차, 녹차, 허브차, 탄산, 카페인, 기타 음료) and 당류 level1 (설탕/꿀 moved from 양념, 쨈 moved here, 초콜릿 added)"),
  bullet("\u2705 Log.ts: food.drinks[].ingredients (String[]) via new drinksItemSchema; alcohols left unchanged (no ingredients)"),
  bullet("\u2705 rowToDocument.ts: food.drinks post-processed through parseFoodIngredients (same .map() as foods); drink note tag preserved"),
  bullet("\u2705 scripts/fill-historical-drinks.ts: DRINK_MAP (278 reviewed entries) + 아이스/핫 normalisation + substring fallback; modes --dry-run / --export-worklist / write; treats [\"Not Defined\"] as refillable"),
  bullet("\u2705 scripts/inspect-drinks.ts; scan-bad-parens.ts extended to scan the drink column"),
  bullet("\u2705 Historical fill: ~5,006 documents / ~5,462 drink items, all with ingredients, 0 Not Defined; reconciliation 0 gap"),
  bullet("\u2705 Drink-specific mapping rules: 커피 implies caffeine; 카페인 for added-caffeine drinks; 탄산 = pure carbonated water (콜라→탄산|설탕, zero→탄산|기타 소스); sports/vitamin drinks→기타 음료|설탕; 보이차 kept as its own value"),
);
C(h3("Sub-items for WBS #61 (Diet Widget) — NEW:"));
C(
  bullet("\u2705 API: diet.summary (computeDietSummary) — reuses assignDrinkingDate 6am boundary; food/drink-bearing fetch with 6h early lookback; ingredient_master level2→level1 join in JS; rangeStart/rangeEnd for the calendar"),
  bullet("\u2705 chart-colors.ts: CATEGORY_COLORS_LIGHT/DARK + categoryColors(isDark) — taxonomy-agnostic indexed palette (no group names in widget code)"),
  bullet("\u2705 Treemap.tsx — squarified treemap; ResizeObserver-measured CSS cells; top-N cap + 기타 (+N) rollup"),
  bullet("\u2705 CalendarHeatmap.tsx — CalendarHeatmap (Mon–Sun grid, modal) + HeatStrip (single-row inline strip)"),
  bullet("\u2705 css-chart-components.tsx: CssDailyChart added (avg line + zone bands + above-marker tooltip); CssVerticalBoxPlotChart gained formatY + height props"),
  bullet("\u2705 DietWidget.tsx Summary view: distribution box plots (Finish/인분/Carbs) with daily-line modals; spiciness strip + calendar modal; Food/Drink × Ingredients/Items treemap toggles; with-whom toggle (relation / companions); uppercase titles"),
  bullet("\u2705 Registered in page.tsx WIDGETS array (floor 1)"),
  bullet("\u2705 Trend view (v2.6) — 8 tabs: four box-plot metrics (Eating/Caffeine/Servings/Carbs), three StackedBars tabs (Composition with Food/Drink × Ingredients/Items toggles, Spicy, Relation), and People (CssRankFlowChart of top-7 companions with a client-side Relation filter); per-person people:{name:{category:count}} trend field; drink-only companions counted; 아침 6am-rollback exception; trendLoadedRef keeps the active tab across bucket-size changes"),
  bullet("\u2B1C foodsItemSchema.amount String → Number (optional housekeeping; API uses parseFloat, so not blocking)"),
);
C(h3("Sub-items for Insights Polish Pass (#1–#9) + Bar Standardisation — NEW v2.7:"));
C(
  bullet("\u2705 Bar standardisation: new src/app/insights/_components/charts/bars.tsx (Title, BarRow, BarSection) — desc-sorted, max-normalised bars with a {pct}% ({count}) value column; chart-colors.ts gains BAR_COLORS_LIGHT/DARK + barColors(isDark) + autoColorMap(keys, isDark), kept separate from categoryColors and rankFlowColors; applied across the Diet, Drinking and Interactions summaries"),
  bullet("\u2705 #6 Drinking Summary restructure — Stats/Top 10 tabs dropped; bar block into two columns (Drink Type / Occasion | Relation / People); \"With Whom\" → Relation; old Top 10 folded in as People bars; box plot, rest histogram and session-time rows retained"),
  bullet("\u2705 #7 Interactions Summary restructure — tabs dropped; two-column stats grid (interactions | unique people) + full-width PeopleBars (ranks 1–5 / 6–10, jointly normalised, dominant-relation colour); TopPeopleTable, summaryTab state and SummaryTab type removed"),
  bullet("\u2705 Retired legacy SVG module _lib/chart-components.tsx (TrendChart, StackedBarChart, RankedFlowChart) and removed CssStackedBarChart from css-chart-components.tsx; StackedBarBucket type now local to InteractionsWidget"),
  bullet("\u2705 #8 Search — per-field exact-phrase conditions: each column condition runs through parseQuery (quoted → field-scoped phrase + contiguous escaped-regex; unquoted remainder fuzzy), mirrored in the Atlas and regex-fallback loops. Known out-of-scope: the main-query regex fallback still regexes raw q incl. quote chars (Atlas is primary, so rarely hit)"),
  bullet("\u2705 #9 Search — client-side tri-state sortable result columns (sort → reverse → relevance; one active column with ▲/▼; text ascends first, date/numeric descends first; missing values sink; stable ties; 활동/내용 sorts by activity.title || activity.name; a new search resets the sort)"),
);
C(h3("Remaining Phase 4 Items:"));
C(
  bullet("\u2B1C 54. Widget: Weight trend — body.weight over time"),
  bullet("\u2B1C 55. Widget: Average go-to-bed time — partially covered by Sleep Trend > Bedtime"),
  bullet("\u2B1C 58. Widget: Exercise trend — exercise.frequency metric"),
  bullet("\u2B1C 59. Native calendar view (historical and future entries) — can reuse the CalendarHeatmap component built for #61"),
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

// 5. OPEN QUESTIONS
C(h1("5. Open Questions"));
C(table(["#","Question","Status"],[
  ["1","Free trial period duration?","TBD"],
  ["2","Subscription pricing?","TBD"],
  ["3","Mobile: React Native or PWA?","TBD"],
  ["4","AI provider for fact search / insight suggestions?","TBD"],
  ["5","Data retention policy?","TBD"],
  ["6","DB_Status/DB_ID columns — manual or by migration tool?","Resolved — deferred to post-MVP"],
  ["7","Master collections — user-editable via UI in Phase 5?","TBD — Phase 5 concern"],
  ["8","Should food.foods[].ingredients feed a dedicated eating-behaviour widget?","Resolved — built as WBS #61 (Diet widget); Summary view covers food & drink ingredients/items"],
],[700,5900,2760]));
C(spacer());

// APPENDIX
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
  ["src/app/insights/_components/charts/bars.tsx","Diet, Drinking, Interactions summaries","Targeted patches only. Shared summary-bar primitives (Title / BarRow / BarSection). Changing the geometry or the {pct}% ({count}) value format affects all three summaries. (The legacy SVG _lib/chart-components.tsx was retired in v2.7.)"],
  ["src/app/insights/_components/charts/css-chart-components.tsx","DrinkingWidget, future widgets","Full replacement acceptable when Hyoje uploads latest version. compressWeekLabels() is shared — preserve it."],
  ["src/app/insights/_lib/format.ts","All widgets via chart-components","Targeted patches only. formatBucketLabel handles month, week (raw + compressed), and day formats."],
  ["src/app/insights/_components/GlobalFilterBar.tsx","Insights page","Targeted patches only. Activity Type filter commits on Apply."],
  ["src/app/insights/_components/WidgetCard.tsx","All widgets","Targeted patches only. Changes affect every widget simultaneously."],
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
  bullet("Dark mode: All charts render correctly in both light and dark mode."),
);
C(h2("A.4 API Route Safety"));
C(
  bullet("The userId line must always read: const userId = (session as any)?.user?.userId;"),
  bullet("Never use (session as any)?.userId — this was the source of a major regression."),
  bullet("stepBack() and currentPeriod() must use ISO week calculation (Jan 4 reference, not Jan 1)."),
);
C(h2("A.5 Ingredient & Master-Table Rules (NEW v2.3; drinks added v2.4)"));
C(
  bullet("ingredient_master is the single source of truth for the level2 vocabulary — never hard-code VALID_LEVEL2 in transform.ts."),
  bullet("Run migrate-ingredient once; re-run only when the Ingredient sheet changes (renames, new values, regrouping)."),
  bullet("Daily sequence after any source change: npm run migrate → fill-historical-ingredients.ts → fill-historical-drinks.ts → inspect (both) → reconcile. The two fills are independent; order between them does not matter."),
  bullet("The fill script treats [\"Not Defined\"] as refillable, so it is safe to run after every migrate; it skips items that already have real ingredients."),
  bullet("Before re-migrating old rows, run scan-bad-parens.ts and clean any legacy descriptive parentheses ((국만)/(국물)/(밥만)/content lists)."),
  bullet("Ingredient parsing applies to food.foods[] and food.drinks[] (v2.4) — never to food.alcohols[]."),
  bullet("To update alcohol_conversion: edit AlcoholConv sheet → npm run migrate-alcohol (no log re-migration needed)."),
);

// FOOTER
C(new Paragraph({ children: [new TextRun({ text: "FarGaze — Service Concept & WBS v2.7 — 25 June 2026", italics: true })], spacing: { before: 240 }, alignment: AlignmentType.CENTER }));

// ASSEMBLY
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
  fs.writeFileSync("FarGaze-WBS-v2.7.docx", buffer);
  console.log("Wrote FarGaze-WBS-v2.7.docx (" + buffer.length + " bytes), " + children.length + " elements");
});
