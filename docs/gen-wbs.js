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
  new Paragraph({ children: [new TextRun({ text: "Version 3.1  |  18 July 2026", size: 24 })], spacing: { after: 240 } }),
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
  ["4 — Analytics & Search","\u2B1C In progress","Done: search, cost dashboard, Sleep / Interactions / Drinking / Diet / Weight widgets, food + drink ingredient taxonomies. Remaining: #58 Exercise, #59 Calendar. Weight (#54) ships Summary only — no Trend view yet"],
  ["5 — Data Entry","\u2B1C Not started","Post-MVP"],
],[2900,1700,4760]));
C(spacer());
C(p([new TextRun({ text: "Current focus: ", bold: true }), new TextRun("remaining Phase 4 widgets — #58 Exercise trend, #59 Calendar view; optionally a Trend view for #54 Weight.")]));

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
  bullet("\u2705 54. Weight widget — Summary complete (box plot + body composition); Trend not built — see sub-items"),
  bullet("\u2705 55. Average bed-time widget — CLOSED as covered by the Sleep widget (Summary bedtime + Trend › Bedtime); no separate widget will be built"),
  bullet("\u2B1C 58. Exercise trend widget — exercise.frequency"),
  bullet("\u2B1C 59. Native calendar view — reuses the CalendarHeatmap built for #61"),
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
  bullet("\u2B1C Trend view — not built; would bucket weight and the three segments over the global filter period"),
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
  bullet("\u2B1C Weight Trend view (#54) — deferred, not descoped"),
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
  ["src/app/insights/_components/charts/css-chart-components.tsx","DrinkingWidget, DietWidget, WeightWidget","Full replacement acceptable when Hyoje uploads latest version. compressWeekLabels() is shared — preserve it. CssVerticalBoxPlotChart has THREE call sites (Diet Summary compact, Diet Trend, Drinking Amt(day)) plus Weight Summary — check all four before changing its label layout."],
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

C(new Paragraph({ children: [new TextRun({ text: "FarGaze — Service Concept & WBS v3.1 — 18 July 2026", italics: true })], spacing: { before: 240 }, alignment: AlignmentType.CENTER }));

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
  fs.writeFileSync("FarGaze-WBS-v3.1.docx", buffer);
  console.log("Wrote FarGaze-WBS-v3.1.docx (" + buffer.length + " bytes), " + children.length + " elements");
});