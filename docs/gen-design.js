const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, LevelFormat, AlignmentType, HeadingLevel } = require('docx');
const H = require('./docx-helpers.js');
const { h1, h2, h3, p, note, bold, bullet, num, spacer, table, TextRun: TR } = H;

const PAGE = {
  size: { width: 12240, height: 15840 },
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
};

const children = [];
const C = (...xs) => xs.forEach(x => children.push(x));

// ===== TITLE =====
C(
  new Paragraph({ children: [new TextRun({ text: "FarGaze Log", bold: true, size: 48 })], spacing: { after: 120 } }),
  new Paragraph({ children: [new TextRun({ text: "Data Design & Requirements Document", size: 32 })], spacing: { after: 60 } }),
  new Paragraph({ children: [new TextRun({ text: "Version 3.6  |  25 June 2026  |  Hyoje / Claude", size: 24 })], spacing: { after: 240 } }),
);

// ===== VERSION HISTORY =====
C(h1("Version History"));
C(table(
  ["Version", "Date", "Author", "Summary of Changes"],
  [
    ["1.0","25 Apr 2026","Hyoje / Claude","Initial version — complete data design and requirements"],
    ["1.1","25 Apr 2026","Hyoje / Claude","Exercise changed to array; midnight-spanning entries clarified; incremental sync strategy defined; deduplication key confirmed"],
    ["1.2","28 Apr 2026","Hyoje / Claude","Migration scope simplified to archive-only; Active/History/Future sheets descoped until Phase 5; deduplication strategy revised to delete-all + re-insert"],
    ["1.3","29 Apr 2026","Hyoje / Claude","Phase 4 started; duration.d/h/m/s removed; duration.totalSeconds added; Atlas Search index defined"],
    ["1.4","30 Apr 2026","Hyoje / Claude","Schema changes implemented; codebase cleanup — 5 dead files deleted; migration results updated"],
    ["1.5","30 Apr 2026","Hyoje / Claude","Atlas Search index updated: autocomplete dual-mapping; GET /api/search with regex fallback; Section 8 expanded"],
    ["1.6","30 Apr 2026","Hyoje / Claude","Authentication & access control documented; three-layer security model; new Section 2 added"],
    ["1.7","1 May 2026","Hyoje / Claude","Cost data cleansing completed; cost analysis dashboard fully specified; new Section 12 added"],
    ["1.8","2 May 2026","Hyoje / Claude","Spending dashboard implemented; security fix: userId from session email; new Section 13 (handover) added"],
    ["2.0","17 May 2026","Hyoje / Claude","Insights dashboard and widget framework implemented (WBS #53, #56); chart colour system; shared chart library; Section 13 fully updated"],
    ["2.7","20 May 2026","Hyoje / Claude","Drinking widget (WBS #57) in progress: alcohol_conversion collection designed; drinking.summary API implemented with 6am threshold, drinks stats, drinkType; widget Stats tab implemented"],
    ["2.8","21 May 2026","Hyoje / Claude","Drinking widget (WBS #57) complete: CSS-based BoxPlot and Histogram components; responsive chart architecture; shared _components/charts/ folder; full Stats tab layout finalised"],
    ["2.9","22 May 2026","Hyoje / Claude","Drinking widget Trend view complete: 8 metric tabs, CSS chart components (CssTrendChart, CssStackedBarChart, CssVerticalBoxPlotChart, CssDualLineChart, CssRestChart); page layout changed to CSS columns; week label compression; ISO week fix; formatBucketLabel fix; avgRestDays fix"],
    ["3.0","29 May 2026","Hyoje / Claude","food.spiciness field added (H/M/L, optional); Google Sheets column AO inserted; all columns from previous AO onward shifted +1; rowToDocument.ts, Log.ts, and Search UI (page.tsx) updated; Section 5.2 rewritten from Log.ts"],
    ["3.1","4 Jun 2026","Hyoje / Claude","Food ingredient taxonomy added: two-level (level1/level2) ingredient_master collection; food.foods[].ingredients field; parenthesis ingredient notation in source data; parseFoodIngredients parser with level2 validation; historical fill of ~6,150 food rows via fill-historical-ingredients.ts; alcohol_conversion 와인/ml row added; taxonomy renames (해물 육수, 채소 육수, 기타 해산물); 콩류/청국장 moved under 곡류 level1; new Sections 6.6, 8.7, 15, 16; daily routine and master-table update procedures documented"],
    ["3.2","5 Jun 2026","Hyoje / Claude","Drink ingredient taxonomy added: food.drinks[].ingredients field (drinksItemSchema) populated from level2 values via the same parseFoodIngredients parser; new 음료 level1 group (커피, 디카페인 커피, 보이차, 홍차, 녹차, 허브차, 탄산, 카페인, 기타 음료); new 당류 level1 group with 초콜릿 (설탕/꿀 moved here from 양념; 쨈 moved here too); fill-historical-drinks.ts (278 reviewed drink entries) + inspect-drinks.ts; scan-bad-parens.ts extended to scan the drink column; ~5,460 drink items filled, 0 Not Defined; new Section 6.7; Sections 5.2, 8.7, 14, 15, 16 updated for drinks"],
    ["3.3","12 Jun 2026","Hyoje / Claude","Diet widget (WBS #61) Summary view complete: diet.summary API (computeDietSummary) reusing assignDrinkingDate 6am day-boundary and an ingredient_master level2→level1 join; seven summary metrics — distribution box plots (finish-eating time, daily 인분 with green/blue/red zone bands, carbs index), spiciness HeatStrip + Mon–Sun CalendarHeatmap, food & drink ingredient/item treemaps, with-whom companions — with tap-to-open daily-line and calendar modals; new chart components Treemap, CalendarHeatmap/HeatStrip, CssDailyChart; CssVerticalBoxPlotChart gained formatY + height props; taxonomy-agnostic CATEGORY_COLORS palette (categoryColors); new Section 13.8; Sections 13.2, 13.3, 13.4, 14.8, 14.9 updated. Trend view pending."],
    ["3.4","14 Jun 2026","Hyoje / Claude","Insights API restructured: route.ts (~1,400 lines) split into a thin GET dispatcher (~150 lines) plus one compute module per widget under src/lib/insights/ (dates, util, sleep, interactions, drinking, diet) — a pure no-op move, verified by diffing each metric's response before/after. Diet widget refinements: 4th box plot 'Caffeine cutoff' (latest 커피/카페인 drink time per day → finishCaffeine, computed in the drinks pass so it counts coffee without food); compact box plots (no y-axis, no Max/P75/Avg/P25/Min legend — value labels at max/avg/min instead) so four boxes fit one row; box-plot headers renamed EATING CUTOFF / CAFFEINE CUTOFF and centred; treemap label font capped at 11px; CssVerticalBoxPlotChart gained a compact prop. Sections 13.3, 13.4, 13.8, 14.4, 14.7 updated."],
    ["3.6","25 Jun 2026","Hyoje / Claude","Insights polish pass complete (no schema or API-shape changes). Summary restructures: the Interactions and Drinking summaries drop their Stats/Top 10 tabs for always-on layouts. Interactions becomes a two-column stats grid (left interactions, right unique people — each Relation Type + Method) plus a full-width PeopleBars block (top 10 split ranks 1–5 left / 6–10 right, jointly normalised against one shared max, each bar coloured by the person's dominant relation type); TopPeopleTable, the summaryTab state and the SummaryTab type were removed. Drinking keeps its Drinking Days + Total Drinks counters, Drinks-Per-Day box plot, rest histogram and session-time rows, but reorganises its proportional-bar block into two columns (left Drink Type / Occasion, right Relation / People), renaming \"With Whom\" → Relation and folding the old Top 10 tab in as People bars. New shared chart module src/app/insights/_components/charts/bars.tsx exports Title, BarRow, BarSection (desc-sorted, max-normalised bars, {pct}% ({count}) value column); chart-colors.ts gains a dedicated bar palette BAR_COLORS_LIGHT/DARK + barColors(isDark) + autoColorMap(keys, isDark), kept separate from categoryColors and rankFlowColors; applied across the Diet, Drinking and Interactions summaries. Retired the legacy SVG module _lib/chart-components.tsx (TrendChart, StackedBarChart, RankedFlowChart) and removed CssStackedBarChart from css-chart-components.tsx; the StackedBarBucket type is now local to InteractionsWidget. Search: per-field exact-phrase conditions — each column condition value runs through the same parseQuery as the main box (quoted part → phrase scoped to that one field plus a contiguous escaped-regex on that field; unquoted remainder stays fuzzy), mirrored in both the Atlas and regex-fallback condition loops; and client-side tri-state sortable result columns in the search UI. Sections 9.5, 9.6 (new), 13.2, 13.3, 13.4, 14.1, 14.4, 14.7, 14.8, 14.9 updated."],
    ["3.5","20 Jun 2026","Hyoje / Claude","Diet widget (WBS #61) Trend view complete — eight tabs: four box-plot metrics (Eating/Caffeine/Servings/Carbs), three 100% stacked-composition tabs (Composition with Food/Drink × Ingredients/Items toggles, Spicy, Relation), and People (rank-flow of top-7 companions). New shared chart CssRankFlowChart — CSS-only ranked-flow (colour-tiles ranked top→bottom, dashed reference line, grey block listing people who dropped from the previous bucket's top-N, hover-to-trace, blur-names privacy toggle, luminance-adaptive tile text, controls slot); rankFlowColors two-tier palette. New reusable StackedBars (percent/absolute modes, legend hover-highlight). MultiSelectDropdown rebuilt to render its panel through a React portal on document.body with fixed positioning, so it escapes widget-card overflow:hidden and stays edge-/scroll-/resize-aware. Per-person people:{name:{category:count}} field added to the diet AND drinking trend buckets for client-side companion filtering and re-ranking. Diet companion scope widened to count drink-only meetups; 아침 (breakfast) records exempted from the 6am day-rollback. Backward-applied to existing widgets: Interactions now uses CssRankFlowChart (replacing the SVG RankedFlowChart) with its trend tabs renamed Type→Relation and Top 7→People (the unique-people count tab renamed Unique to avoid the clash) and a Relation filter; Drinking gained a People rank-flow tab and renamed its companion stacked tab People→Relation. Unified trend naming across Diet/Drinking/Interactions: Relation = relation-type stack, People = top-7 individual rank-flow, Relation = the relation filter. Default bucket count set to 12. Sections 13.3, 13.4, 13.5, 13.8 updated."],
  ],
  [1200, 1500, 1700, 4960]
));
C(spacer());

// ===== 1. OVERVIEW =====
C(h1("1. Overview"));
C(p("This document captures the data design decisions and requirements for FarGaze Log — a personal life analytics platform. It covers the source data structure, MongoDB schema design, data transformation rules, supporting collections, and migration requirements."));
C(h2("1.1 Source Data Summary"));
C(
  bullet("~43,000 rows, 84 columns of daily life activity data (84 from v3.1; was 83 in v3.0 after column AO insertion — no new source column was added for ingredients, which are embedded in the existing food item column via parenthesis notation)"),
  bullet("~7 years of continuous logging by Hyoje"),
  bullet("Maintained in two Google Sheets files across five data sheets"),
  bullet("Supporting master data in five additional sheets (Ingredient sheet added v3.1)"),
);
C(h2("1.2 Target Database"));
C(
  bullet("Database: MongoDB Atlas (M0 free tier, AWS Europe Ireland)"),
  bullet("Cluster: fargaze-log"),
  bullet("Architecture: user-isolated collections — each user manages their own schema"),
);

// ===== 2. AUTH =====
C(h1("2. Authentication & Access Control"));
C(h2("2.1 Overview"));
C(p("FarGaze Log uses Google OAuth via NextAuth (Auth.js v5) for authentication. Access is restricted to explicitly whitelisted Google accounts mapped to internal userIds."));
C(h2("2.2 Google Account to userId Mapping"));
C(p("The mapping from Google email to internal userId is maintained in src/auth.ts as a static lookup table (EMAIL_TO_USER_ID). The actual email values are stored in environment variables, not hardcoded in source. On first sign-in, the jwt callback receives the Google user object, looks up the email in EMAIL_TO_USER_ID, and stores the resulting userId in the JWT token cookie. On all subsequent requests, userId is read directly from the token."));
C(table(
  ["Environment Variable", "Value", "Maps to userId"],
  [["GOOGLE_OWNER_EMAIL", "hyoje.choi@gmail.com", "hyoje"]],
  [3120, 3120, 3120]
));
C(spacer());
C(h2("2.3 Three-Layer Security Model"));
C(table(
  ["Layer", "Location", "What it does"],
  [
    ["Middleware","Edge runtime — runs before every request","Checks userId in session; redirects unauthenticated or unmapped users to sign-out → sign-in"],
    ["API route","Server — /api/*","Returns 403 if userId is null or missing from session. CRITICAL: read as (session as any)?.user?.userId"],
    ["Data query","MongoDB","All queries filter by userId — data is always user-isolated"],
  ],
  [1800, 3000, 4560]
));
C(spacer());
C(note("Note: Even if someone bypasses the middleware (e.g. direct API call), they still hit the API 403 and receive no data. Even if they bypass that, MongoDB only returns documents matching their userId."));
C(h2("2.4 Access for Other Users (Current)"));
C(
  bullet("Add their Google email and a new userId to EMAIL_TO_USER_ID in src/auth.ts"),
  bullet("Add GOOGLE_USER2_EMAIL (or similar) to environment variables on Vercel and in .env.local"),
  bullet("Ensure their data in MongoDB uses their userId as the owner field"),
);
C(h2("2.5 Multi-User Roadmap (Phase 5)"));
C(
  bullet("A users collection in MongoDB will store Google email → userId mappings"),
  bullet("The EMAIL_TO_USER_ID lookup in auth.ts will be replaced by a database query"),
  bullet("User onboarding and access management will be handled through a UI"),
  bullet("No code changes will be required to grant or revoke access"),
);

// ===== 3. SOURCE FILE STRUCTURE =====
C(h1("3. Source File Structure"));
C(h2("3.1 File 1: Active_2026Mar05"));
C(p("Contains current working data and all master/reference sheets."));
C(table(
  ["Sheet", "Purpose", "Entry Types"],
  [
    ["Active","Current data entry — entries within last 7 days","Normal, Ongoing, All-day"],
    ["Future","Future schedules and appointments","Future (known end), Future (unknown end), All-day"],
    ["History","Ongoing items started >7 days ago, not yet closed","Ongoing (started >7 days ago, no end time)"],
    ["Cost","Master table for cost categories","Reference data"],
    ["Activity","Master table for activities and reference lists","Reference data"],
    ["TimeDiff","Timezone master and exchange rates","Reference data"],
    ["AlcoholConv","Alcohol unit conversion table (added v2.7)","Reference data — 54 rows (item × unit → drinks); 와인/ml added v3.1"],
    ["Ingredient","Food ingredient taxonomy (added v3.1) — level1 / level2 columns, header row 1","Reference data — 73 level2 values across 16 level1 groups (음료 and 당류 added v3.2)"],
  ],
  [1700, 3400, 4260]
));
C(spacer());
C(h2("3.2 File 2: Full Archive_2026Mar06"));
C(table(
  ["Sheet", "Purpose", "Entry Types"],
  [
    ["2026","Current year archive — entries moved from Active when older than 7 days","Completed entries"],
    ["~2025","Full historical archive — all prior years","Completed entries"],
  ],
  [1700, 4400, 3260]
));
C(spacer());
C(h2("3.3 Data Flow"));
C(
  bullet("Daily activities are entered in the Active sheet"),
  bullet("Future appointments are entered in the Future sheet"),
  bullet("When a future entry becomes today, it is moved to Active"),
  bullet("When Active entries are older than 7 days, they are moved to the 2026 sheet"),
  bullet("Ongoing items older than 7 days that are not yet closed stay in History"),
  bullet("At year end, 2026 data moves to ~2025 and the sheet is renamed ~2026"),
);
C(note("Important: Movements between sheets are purely organisational and do not require any MongoDB sync action — the MongoDB record stays unchanged regardless of which sheet the row is in."));
C(note("Note: Active, History, and Future sheets are managed directly in Google Sheets and are NOT migrated to MongoDB. These will be brought into scope in Phase 5 when the data entry feature is built."));

// ===== 4. ENTRY TYPES =====
C(h1("4. Entry Types & State Logic"));
C(h2("4.1 Entry Types by Sheet"));
C(table(
  ["Sheet","Start time","End time","Duration","Meaning"],
  [
    ["Future","exists","exists","normal","Scheduled appointment with known duration"],
    ["Future","exists","empty","#NUM","Appointment with unknown end time"],
    ["Future","empty","empty","0","All-day future event"],
    ["Active","exists","exists","normal","Completed or future activity within 7 days"],
    ["Active","exists","empty","#NUM","Ongoing activity started today or within 7 days"],
    ["Active","empty","empty","0","All-day event"],
    ["History","exists","empty","#NUM","Long-running ongoing activity started >7 days ago"],
    ["2026 / ~2025","exists","exists","normal","All closed/completed archived entries"],
  ],
  [1560, 1400, 1400, 1400, 3600]
));
C(spacer());
C(h2("4.2 Multi-day & Midnight-spanning Entries"));
C(p("Entries that span midnight or multiple days are fully supported. Since start date and end date are stored as separate fields, the datetime computation naturally handles all cases. No special logic is required — compute start.datetime and end.datetime independently from their respective date/time fields."));
C(h2("4.3 Dynamic State Computation"));
C(p("Entry state is computed dynamically at query time based on the current datetime — not stored as a static flag. This prevents stale state values."));
C(table(
  ["Condition","State"],
  [
    ["start.datetime > now","Future"],
    ["start.datetime = null AND allDay = true","Future (all-day)"],
    ["start.datetime <= now AND end.datetime > now","Ongoing"],
    ["start.datetime <= now AND end.datetime = null","Ongoing (no end time yet)"],
    ["end.datetime <= now","Completed"],
  ],
  [5360, 4000]
));
C(spacer());
C(h2("4.4 The allDay Flag"));
C(p("One static flag is stored: allDay (Boolean). Set to true when both start and end hour fields are empty, indicating a full-day event with no specific time."));
C(h2("4.5 Rows to Skip During Migration"));
C(p("Skip a row if ANY of the following conditions are true:"));
C(
  bullet("activity category is null, empty, #N/A, or starts with #"),
  bullet("activity field equals \"Preset\" — and all rows below are also skipped"),
  bullet("Row is a header row (activity category = \"activity category\", \"activity\", or \"categoryLevel1\")"),
);
C(p("Do NOT skip rows where:"));
C(
  bullet("Duration is #NUM — these are valid ongoing or open-ended entries"),
  bullet("End time is empty — these are valid future or ongoing entries"),
);


// ===== 5. SCHEMA =====
C(h1("5. MongoDB Log Collection Schema"));
C(h2("5.1 Design Principles"));
C(
  bullet("All fields are optional — entries will only populate a subset of fields"),
  bullet("Multi-value fields (purchase, food.drinks, food.foods, food.alcohols, exercise, people) use arrays of objects"),
  bullet("datetime fields are computed from year/month/day/hour components in the source sheet"),
  bullet("userId is present on every document for multi-user isolation"),
  bullet("Entry state (future/ongoing/completed) is computed dynamically, not stored"),
  bullet("No unique index on the log collection — re-migration uses delete-all + re-insert strategy"),
  bullet("duration.totalSeconds is computed from start and end UTC timestamps using timezoneOffset; d/h/m/s sub-fields are not stored"),
  bullet("food.foods[] and food.drinks[] each carry an optional ingredients: string[] field populated from level2 taxonomy values (foods added v3.1, drinks added v3.2). food.alcohols[] does NOT have this field."),
  bullet("Collection name: log (singular)"),
);
C(h2("5.2 Complete Field Reference"));
C(note("Derived from src/models/Log.ts (v3.1). Field descriptions from v1.8 Section 5.2, updated for v3.0 and v3.1 changes."));

C(bold("Meta"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["_id","ObjectId","—","Auto-generated by MongoDB"],
  ["userId","String","—","Owner of this entry. Required."],
  ["createdAt","Date","—","Record creation timestamp (auto, timestamps:true)"],
  ["updatedAt","Date","—","Record update timestamp (auto, timestamps:true)"],
  ["allDay","Boolean","start hour + end hour","true when both start and end hour are empty"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("sync"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["sync.status","String","Sync_Status","\"Synced\", blank"],
  ["sync.eventId","String","Event_ID","Google Calendar event ID"],
  ["sync.export","String","Export","\"Y\", \"U\", blank"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("activity"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["activity.category","String","activity category","\"식음\", \"이동\", \"수면\", etc."],
  ["activity.name","String","activity","\"식사\", \"이동\", \"수면\", etc."],
  ["activity.title","String","title","Free text — event title or description"],
  ["activity.additionalInfo","String","additional_info","Free text — supplementary details"],
  ["activity.crossActivity","String","cross activity","\"평시\" etc. — cross-cutting activity tag"],
  ["activity.relationship","String","관계","\"혼자\", \"함께\", \"타인\""],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("start"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["start.timezone","String","start TimeZone","\"BST\", \"GMT\", \"KST\""],
  ["start.datetime","Date","start year/month/day/hour","Computed from components; stored as MongoDB Date"],
  ["start.year","Number","start 년",""],
  ["start.month","Number","start 월",""],
  ["start.day","Number","start 일",""],
  ["start.weekday","String","start 요일","Korean weekday string"],
  ["start.hour","String","start 시","\"9:00\", \"14:30\""],
  ["start.timezoneOffset","Number","start 시차","UTC offset in hours (e.g. 9 for KST)"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("end"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["end.timezone","String","end TimeZone",""],
  ["end.datetime","Date","end year/month/day/hour","Computed from components; stored as MongoDB Date"],
  ["end.year","Number","end 년",""],
  ["end.month","Number","end 월",""],
  ["end.day","Number","end 일",""],
  ["end.weekday","String","end 요일",""],
  ["end.hour","String","end 시",""],
  ["end.timezoneOffset","Number","end 시차","UTC offset in hours"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("duration"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["duration.totalSeconds","Number","start + end + offsets","Computed from UTC-normalised timestamps. null for single all-day events or missing end. See Section 6.1 for formula."],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("location"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["location.activity","String","Activity 장소","Physical location of activity"],
  ["location.online","String","Online 장소","Online platform or URL"],
  ["location.other","String","타인 장소","Other person's location"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("cost"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["cost.amountKRW","Number","비용(원)","Korean won amount"],
  ["cost.amountForeign","Number","비용(외화)","Foreign currency amount"],
  ["cost.currency","String","통화","\"GBP\", \"USD\", etc."],
  ["cost.categoryDetail","String","비용구분상세","Detailed cost sub-category"],
  ["cost.category","String","비용 Category","Top-level cost category"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("purchase[]"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["purchase[].item","String","구매항목","Purchase item name"],
  ["purchase[].amount","String","량","Quantity purchased"],
  ["purchase[].unit","String","단위","Unit of quantity"],
],[2400,1400,2400,3160]));
C(spacer());

C(bold("food"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["food.type","String","유형 (col AL)","5 canonical values: 아침, 점심, 저녁, 음료/간식, 음주"],
  ["food.carbs","String","탄수 (col AM)","\"H\", \"M\", \"L\" — carbohydrate level"],
  ["food.fat","String","지방 (col AN)","\"H\", \"M\", \"L\" — fat level"],
  ["food.spiciness","String","매운맛 (col AO — v3.0)","\"H\", \"M\", \"L\" — spiciness level. Optional — blank when not applicable."],
  ["food.drinks[].item","String","음료 항목 (col AP)","Drink item name. Parenthesis ingredient notation stripped at migration (see 6.7)."],
  ["food.drinks[].amount","String","섭취량 (col AQ)",""],
  ["food.drinks[].unit","String","음료단위 (col AR)",""],
  ["food.drinks[].note","String","추가정보 (col AS)","Category tag: \"커피\", \"차\", blank"],
  ["food.foods[].item","String","음식 항목 (col AT)","Food item name. Parenthesis ingredient notation stripped at migration (see 6.6)."],
  ["food.foods[].amount","String","섭취량 (col AU)",""],
  ["food.foods[].unit","String","음식단위 (col AV)","Predominantly 인분"],
  ["food.foods[].note","String","추가정보 (col AW)","Free text note"],
  ["food.foods[].ingredients","String[]","음식 항목 (col AT, in parens) — NEW v3.1","Array of level2 taxonomy values, e.g. [\"쌀\",\"계란\"]. [\"Not Defined\"] when no parenthesis notation present. default: undefined (absent until populated)."],
  ["food.drinks[].ingredients","String[]","음료 항목 (col AP, in parens) — NEW v3.2","Array of level2 taxonomy values, e.g. [\"커피\",\"우유\"]. [\"Not Defined\"] when no parenthesis notation present. default: undefined. The drink note tag (커피/차) is preserved separately."],
  ["food.alcohols[].item","String","술 항목 (col AX)","Canonical alcohol item name — 24 items defined"],
  ["food.alcohols[].amount","String","섭취량 (col AY)",""],
  ["food.alcohols[].unit","String","술단위 (col AZ)",""],
  ["food.alcohols[].note","String","추가정보 (col BA)","Brand name or free text note"],
],[2400,1200,2200,3560]));
C(spacer());

C(bold("people[]"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["people[].method","String","수단","\"대면\", \"영상\""],
  ["people[].category","String","성격","\"가족\", \"생활\", etc."],
  ["people[].target","String","대상","Individual person name — one document per person"],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("transport"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["transport.from","String","출발지","Departure location"],
  ["transport.to","String","도착지","Destination"],
  ["transport.purpose","String","목적","Trip purpose"],
  ["transport.method","String","수단","Transport method"],
  ["transport.returnType","String","귀가 유형","Return trip type"],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("bowel"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["bowel.amount","String","량",""],
  ["bowel.quality","String","질",""],
  ["bowel.characteristics","String","특징",""],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("body"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["body.weight","Number","체중","kg"],
  ["body.muscleMass","Number","골격근량","kg"],
  ["body.bodyFat","Number","체지방량","kg"],
  ["body.bodyFatPercent","Number","체지방률","Stored as decimal (0.207 = 20.7%)"],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("sleep"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["sleep.quality","String","수면 질",""],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("exercise[]"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["exercise[].item","String","운동 항목","Exercise name. Plus-split applied at migration time."],
  ["exercise[].amount","Number","양/강도","Amount or intensity"],
  ["exercise[].unit","String","운동단위","Unit"],
],[2400,1400,2000,3560]));
C(spacer());

C(bold("Other fields"));
C(table(["Field Path","Type","Source Column","Notes"],[
  ["reading.title","String","독서 항목","Book or study title"],
  ["movie.title","String","영화 항목","Film or theatre title"],
  ["golf.score","Number","골프 스코어",""],
  ["golf.approach","Number","어프로치",""],
  ["golf.putts","Number","퍼팅수",""],
  ["income.gross","Number","수입 세전","Gross income"],
  ["income.net","Number","수입 세후","Net income"],
  ["travel.city","String","출장여행 도시","City of travel"],
  ["travel.theme","String","주제","Travel theme or purpose"],
  ["notes","String","비고","Free text notes"],
],[2400,1400,2000,3560]));
C(spacer());

// ===== 6. TRANSFORMATION RULES =====
C(h1("6. Data Transformation Rules"));
C(h2("6.1 duration.totalSeconds Computation"));
C(p("The source sheet stores duration as separate d/h/m/s columns derived from spreadsheet formulas. These fields are not stored in MongoDB. Instead, totalSeconds is computed directly from start and end timestamps."));
C(table(["Case","Condition","totalSeconds"],[
  ["Normal event","start and end both exist","(endUTC − startUTC) in seconds"],
  ["Same start and end","startUTC = endUTC","0"],
  ["All-day, single day","allDay = true, no end date","null"],
  ["All-day, multi-day","allDay = true, end date exists","(endDate − startDate) × 86400"],
  ["Data error (no end in archive)","end is null, start exists","null — treated gracefully"],
],[2600,3400,3360]));
C(spacer());
C(p("UTC conversion formula:"));
C(
  bullet("startUTC = start.datetime − (start.timezoneOffset × 3600 seconds)"),
  bullet("endUTC = end.datetime − (end.timezoneOffset × 3600 seconds)"),
  bullet("totalSeconds = endUTC − startUTC"),
);
C(note("Note: timezoneOffset is read directly from the sheet column (시차) — no timezone_master lookup is required at migration time."));
C(h2("6.2 Multi-value Field Parsing"));
C(p("Comma-separated values across corresponding columns are zipped into arrays. Applies to: purchase, drinks, foods, alcohols, exercise."));
C(p("Example — purchase columns:"));
C(
  bullet("구매항목: \"서랍장,현관 의자,욕실 선반,휴지통\""),
  bullet("량: \"2,1,1,1\""),
  bullet("단위: \"개,개,개,개\""),
);
C(h2("6.2.1 Plus-sign Concatenation Rule"));
C(p("Items containing a plus sign (e.g. \"와인+사케\") are split into separate array entries at migration time via zipMultiValueWithPlusSplit(). The amount is divided evenly across all split items. purchase[].item is explicitly excluded from this treatment. MongoDB never contains + in any item fields."));
C(h2("6.3 People Field Parsing"));
C(p("The people fields use pipe (|) as a group separator and comma (,) as a value separator within each group. Each group is one method/category/target combination. \"등\" is filtered out from target lists."));
C(p("Example:"));
C(
  bullet("수단 (method): \"대면|영상\""),
  bullet("성격 (category): \"가족|생활\""),
  bullet("대상 (targets): \"민아,윤지|Mariana,아버지\""),
  bullet("Result: two people documents — (대면, 가족, 민아), (대면, 가족, 윤지) and (영상, 생활, Mariana), (영상, 생활, 아버지)"),
);
C(h2("6.4 Other Transformation Rules"));
C(
  bullet("Numeric fields: remove thousand-separator commas before parsing (e.g. \"1,500,000\" → 1500000)"),
  bullet("bodyFatPercent: stored as decimal (0.207 = 20.7%) — Google Sheets stores the underlying decimal value"),
  bullet("allDay flag: true when both start and end hour fields are empty"),
  bullet("H/M/L values (carbs, fat, spiciness): stored as-is as strings"),
  bullet("Null/empty strings: parseString() returns null for empty, #N/A, or #-prefixed values"),
);
C(h2("6.5 Google Sheets Column Layout (v3.0)"));
C(p("A new column AO (spiciness) was inserted between AN (fat) and the previous AO (drink item). All columns from the previous AO onward are shifted by one position. The migration script fetch range is A:CG."));
C(table(["Column","0-based Index","Field"],[
  ["A–AL","0–37","activity category through food.type (unchanged)"],
  ["AM","38","food.carbs"],
  ["AN","39","food.fat"],
  ["AO (NEW v3.0)","40","food.spiciness"],
  ["AP","41","food.drinks[].item (was col 40)"],
  ["AQ","42","food.drinks[].amount (was col 41)"],
  ["AR","43","food.drinks[].unit (was col 42)"],
  ["AS","44","food.drinks[].note (was col 43)"],
  ["AT","45","food.foods[].item (was col 44)"],
  ["AU","46","food.foods[].amount (was col 45)"],
  ["AV","47","food.foods[].unit (was col 46)"],
  ["AW","48","food.foods[].note (was col 47)"],
  ["AX","49","food.alcohols[].item (was col 48)"],
  ["AY","50","food.alcohols[].amount (was col 49)"],
  ["AZ","51","food.alcohols[].unit (was col 50)"],
  ["BA","52","food.alcohols[].note (was col 51)"],
  ["BB","53","people[].method (was col 52)"],
  ["BC","54","people[].category (was col 53)"],
  ["BD","55","people[].target (was col 54)"],
  ["BE","56","transport.from (was col 55)"],
  ["BF","57","transport.to (was col 56)"],
  ["BG","58","transport.purpose (was col 57)"],
  ["BH","59","transport.method (was col 58)"],
  ["BI","60","transport.returnType (was col 59)"],
  ["BJ","61","bowel.amount (was col 60)"],
  ["BK","62","bowel.quality (was col 61)"],
  ["BL","63","bowel.characteristics (was col 62)"],
  ["BM","64","body.weight (was col 63)"],
  ["BN","65","body.muscleMass (was col 64)"],
  ["BO","66","body.bodyFat (was col 65)"],
  ["BP","67","body.bodyFatPercent (was col 66)"],
  ["BQ","68","sleep.quality (was col 67)"],
  ["BR","69","exercise[].item (was col 68)"],
  ["BS","70","exercise[].amount (was col 69)"],
  ["BT","71","exercise[].unit (was col 70)"],
  ["BU","72","reading.title (was col 71)"],
  ["BV","73","movie.title (was col 72)"],
  ["BW","74","golf.score (was col 73)"],
  ["BX","75","golf.approach (was col 74)"],
  ["BY","76","golf.putts (was col 75)"],
  ["BZ","77","income.gross (was col 76)"],
  ["CA","78","income.net (was col 77)"],
  ["CB","79","travel.city (was col 78)"],
  ["CC","80","travel.theme (was col 79)"],
  ["CD","81","notes (was col 80)"],
  ["CE","82","sync.status (was col 81)"],
  ["CF","83","sync.eventId (was col 82)"],
],[2200,2200,4960]));
C(spacer());
C(h2("6.6 Food Ingredient Parsing (NEW v3.1)"));
C(p("Food items in column AT may carry an inline ingredient list in parentheses, using the pipe (|) separator inside the parentheses. This is parsed at migration time by parseFoodIngredients() in transform.ts, which runs AFTER the comma-split and plus-split steps, on each individual food token."));
C(bold("Parsing rules"));
C(table(["Source token","Parsed item","Parsed ingredients"],[
  ["바나나(단 과일)","바나나","[\"단 과일\"]"],
  ["샌드위치(가공육|치즈|잎 채소)","샌드위치","[\"가공육\",\"치즈\",\"잎 채소\"]"],
  ["밥 (no parentheses)","밥","[\"Not Defined\"]"],
  ["밥() (empty parentheses)","밥","[\"Not Defined\"]"],
],[3200,2000,4160]));
C(spacer());
C(p("A composite cell such as \"밥(쌀)+계란(계란)+스팸(가공육)+꼬리곰탕(고기 국물)+양상추(잎 채소)\" is first split on + into five tokens (amount divided evenly), then each token is parsed for its own parenthesis ingredients."));
C(bold("Validation and row-skip rule"));
C(p("Each ingredient inside the parentheses is validated against the level2 vocabulary loaded from ingredient_master (see Section 8.7). If any value is not a valid level2 term, parseFoodIngredients() throws IngredientValidationError. The per-row try/catch in migrate.ts catches it, skips the entire row, and logs the offending value and row number. The user then corrects the source row (or adds the missing taxonomy term) and re-migrates."));
C(bold("Vocabulary loading — single source of truth"));
C(p("VALID_LEVEL2 is NOT hard-coded. loadValidLevel2(userId) is awaited once at migration start (after Mongo connection and index sync, before any sheet is migrated). It reads all level2 values from ingredient_master and caches them, plus the \"Not Defined\" sentinel. parseFoodIngredients() is synchronous and reads this cache; it throws if called before the vocabulary is loaded (fail-fast). Because the vocabulary comes from the Ingredient sheet via ingredient_master, adding or renaming a level2 value requires only: edit the Ingredient sheet → npm run migrate-ingredient → re-run migration. No code change."));
C(bold("Scope"));
C(p("As of v3.1 this parsing applied only to food.foods[]. As of v3.2 the same parser is also applied to food.drinks[] (see Section 6.7). food.alcohols[] is the only food sub-array that is NOT parsed for ingredients."));

// ===== 6.7 DRINK INGREDIENT PARSING =====
C(h2("6.7 Drink Ingredient Parsing (NEW v3.2)"));
C(p("Drink items in column AP may carry the same inline parenthesis ingredient notation as food items, e.g. 라떼(커피|우유). The generic parseFoodIngredients() function (Section 6.6) is reused unchanged — in rowToDocument.ts the food.drinks array is post-processed with the same .map() that food.foods uses, stripping the parentheses from the item name and populating food.drinks[].ingredients with the validated level2 values."));
C(p("Key points specific to drinks:"));
C(
  bullet("The existing drink note tag (커피 / 차 / blank in column AS) is preserved — ingredients are added alongside it, not in place of it."),
  bullet("Validation uses the same VALID_LEVEL2 vocabulary loaded from ingredient_master, which in v3.2 includes the new 음료 and 당류 level2 values (see Section 8.7)."),
  bullet("A drink item with no parentheses becomes [\"Not Defined\"] and is repaired by scripts/fill-historical-drinks.ts (278 reviewed drink entries, with 아이스/핫 normalisation and a substring fallback)."),
  bullet("food.alcohols[] is still NOT parsed — alcohols keep the plain schema with no ingredients field."),
);
C(bold("Example drink mappings"));
C(table(["Drink item","ingredients"],[
  ["아메리카노","[\"커피\"]"],
  ["라떼","[\"커피\",\"우유\"]"],
  ["디카페인 아이스라떼","[\"디카페인 커피\",\"우유\"]"],
  ["콜라","[\"탄산\",\"설탕\"]"],
  ["제로콜라","[\"탄산\",\"기타 소스\"]"],
  ["식혜","[\"쌀\",\"설탕\"]"],
  ["두유","[\"콩류\"]"],
  ["보이차","[\"보이차\"]"],
],[3000,6360]));
C(spacer());

// ===== 7. MIGRATION STRATEGY =====
C(h1("7. Migration Strategy"));
C(h2("7.1 Overview"));
C(p("Migration covers the two archive sheets only: ~2025 and 2026. Active, History, and Future sheets are out of scope until Phase 5. Re-migration uses delete-all + re-insert — Log.deleteMany({ userId }) then bulk insert. No deduplication check required."));
C(p("This strategy was chosen because:"));
C(
  bullet("The same activity can legitimately occur multiple times within the same minute"),
  bullet("Row numbers in Google Sheets are not stable (rows are inserted, deleted, and moved regularly)"),
  bullet("Active/History/Future sheets are managed separately in Google Sheets until Phase 5"),
);
C(h2("7.2 Supporting Collections"));
C(p("Supporting collections (cost_master, activity_master, reference_lists, timezone_master, exchange_rate) use a delete-all + re-insert strategy per collection. activity_master uses a unique index on userId + name + category. alcohol_conversion is seeded via npm run migrate-alcohol from the AlcoholConv sheet. ingredient_master (added v3.1) is seeded via npm run migrate-ingredient from the Ingredient sheet. See Sections 15 and 16 for the daily routine and master-table update procedures."));
C(h2("7.3 Incremental Sync — Deferred to Post-MVP"));
C(p("The DB_Status/DB_ID column approach designed in v1.1 has been deferred to post-MVP. It will be implemented after the Phase 5 data entry feature is complete."));
C(h2("7.4 v3.0 Re-migration Requirement"));
C(p("After adding column AO (spiciness) to Google Sheets, a full re-migration of both 2026 and ~2025 archive sheets is required. Steps:"));
C(
  num("Add column AO (spiciness, values H/M/L) to both Active and Archive spreadsheets"),
  num("Deploy updated rowToDocument.ts and Log.ts"),
  num("In migrate.ts: uncomment the ~2025 block and run Log.deleteMany({ userId }) for both years"),
  num("Run migration for both ~2025 and 2026"),
  num("Verify document count and spot-check food.spiciness on sample records"),
);
C(h2("7.5 Codebase Cleanup (30 April 2026)"));
C(p("The following dead files were removed during Phase 4 implementation:"));
C(
  bullet("src/lib/migration/migrate.ts — old unused migration wrapper, superseded by scripts/migrate.ts"),
  bullet("src/app/api/migrate/route.ts — old API route"),
  bullet("src/app/api/migrate-full/route.ts — old API route"),
  bullet("src/app/api/test-transform/route.ts — old test route"),
  bullet(".next/ cache — cleared to resolve stale TypeScript declaration errors"),
);
C(h2("7.6 v3.1 Ingredient Migration Requirement (NEW)"));
C(p("After establishing the ingredient taxonomy and adopting parenthesis notation, the following one-time setup was performed. These steps are also the reference procedure for any future taxonomy change:"));
C(
  num("Populate the Ingredient sheet (level1 / level2, header row 1) — 73 level2 values across 16 level1 groups as of v3.2"),
  num("Run npm run migrate-ingredient to seed ingredient_master"),
  num("Deploy updated Log.ts (foodsItemSchema with ingredients), transform.ts (parseFoodIngredients + loadValidLevel2), rowToDocument.ts (foods post-processing), migrate.ts (loadValidLevel2 call)"),
  num("Historical fill: run npx tsx scripts/fill-historical-ingredients.ts to populate food.foods[].ingredients for all existing rows from the embedded reviewed map (see Section 16.3)"),
  num("Verify with scripts/inspect-ingredients.ts and reconcile with scripts/reconcile-foods.ts"),
);
C(note("Note: Old source rows that used descriptive parentheses such as (국만), (국물), (밥만), or a content list like 회(도다리 세꼬시와 광어) must be cleaned before re-migration, because parseFoodIngredients() reads anything in parentheses as an ingredient list and will reject non-level2 values. scripts/scan-bad-parens.ts lists every offending row."));

// ===== 8. SUPPORTING COLLECTIONS =====
C(h1("8. Supporting Collections"));
C(h2("8.1 cost_master"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["category","String","Top-level cost category"],
  ["detail","String","Detailed sub-category"],
],[2400,2000,4960]));
C(spacer());
C(h2("8.2 activity_master"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["name","String","Activity name"],
  ["category","String","Activity category"],
],[2400,2000,4960]));
C(note("Note: Unique index on userId + name + category. Same name can exist in different categories."));
C(h2("8.3 reference_lists"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["listName","String","Reference list identifier (e.g. activity.crossActivity, food.alcohols.item)"],
  ["values","String[]","Array of allowed values"],
],[2400,2000,4960]));
C(spacer());
C(h2("8.4 timezone_master"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["code","String","Timezone abbreviation (e.g. KST, BST, GMT)"],
  ["offsetUTC","Number","UTC offset in hours (e.g. 9 for KST, 1 for BST)"],
  ["ianaTimezone","String","IANA timezone name (e.g. Asia/Seoul)"],
  ["city","String","Representative city"],
],[2400,2000,4960]));
C(spacer());
C(h2("8.5 exchange_rate"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["currency","String","Currency code (e.g. GBP, USD)"],
  ["rateToKRW","Number","Exchange rate to Korean won"],
],[2400,2000,4960]));
C(spacer());
C(h2("8.6 alcohol_conversion (added v2.7)"));
C(p("A dedicated collection storing the unit conversion table for alcohol items. One document per item × unit combination (54 documents total as of v3.1, after the 와인/ml row was added)."));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["item","String","Canonical alcohol item name (e.g. 소주, 맥주, 와인)"],
  ["unit","String","Unit of measurement (e.g. 잔, 병, ml, l, 도쿠리, cc, pint, 캔, 컵, 통)"],
  ["unitTo50ml","Number","How many 50ml soju-sized units this unit represents"],
  ["alcoholRatio","Number","Alcohol content relative to standard soju (1.0 = same as soju)"],
  ["drinks","Number","Final drinks value: unitTo50ml × alcoholRatio. Primary field used in calculations."],
],[2200,1600,5560]));
C(spacer());
C(note("Note: 1 drink = 1 소주잔 equivalent (50ml at ~20% ABV). The drinks field on each alcohol entry = amount × convMap[item][unit].drinks."));
C(p("Migration: npm run migrate-alcohol reads the AlcoholConv sheet from Active_2026Mar05."));
C(p("Model: src/models/AlcoholConversion.ts. Unique index on { userId, item, unit }."));
C(h2("8.7 ingredient_master (NEW v3.1; extended for drinks v3.2)"));
C(p("A dedicated collection storing the two-level ingredient taxonomy for both food and drinks. One document per level2 value (73 documents as of v3.2). It is the single source of truth for the level2 vocabulary used by parseFoodIngredients() validation (for foods and drinks) and by the historical-fill scripts."));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["level1","String","Top-level group (e.g. 곡류, 채소, 육류, 해산물, 양념, 유제품, 육수, 국물)"],
  ["level2","String","Specific ingredient class (e.g. 쌀, 잎 채소, 돼지고기, 생선, 고기 국물). Unique within userId."],
],[2200,1600,5560]));
C(spacer());
C(p("Model: src/models/IngredientMaster.ts (collection ingredient_master). Unique index on { userId, level2 }."));
C(p("Migration: npm run migrate-ingredient reads the Ingredient sheet (level1 / level2 columns, header row 1) from Active_2026Mar05 and does delete-all + re-insert for the user."));
C(bold("Taxonomy structure (73 level2 values across 16 level1 groups; v3.2 adds 음료 and 당류)"));
C(table(["level1","level2 values"],[
  ["곡류","기타 곡류, 메밀, 밀, 보리쌀, 쌀, 옥수수, 전분, 찹쌀, 콩류, 청국장 (콩류 and 청국장 moved here in v3.1)"],
  ["과일","기타 과일, 단 과일, 베리류"],
  ["국물","고기 국물, 생선 국물"],
  ["기타","곤충, 기타"],
  ["내장류","내장류"],
  ["양념","간장, 겨자, 고추, 고추장, 과일 소스, 기름, 기타 소스, 된장, 마늘, 소금, 식초, 카레 (설탕 and 꿀 moved to 당류 in v3.2)"],
  ["당류","설탕, 꿀, 초콜릿, 쨈 (NEW level1 in v3.2; 설탕/꿀 moved from 양념, 쨈 moved here, 초콜릿 added)"],
  ["유제품","기타 유제품, 버터, 요거트, 우유, 치즈"],
  ["육류","가공육, 기타 육류, 닭고기, 돼지고기, 소고기, 양고기, 오리고기"],
  ["육수","고기 육수, 해물 육수 (was 생선 육수), 채소 육수 (was 야채 육수)"],
  ["채소","기타 채소, 버섯, 뿌리 채소, 열매 채소, 잎 채소, 줄기 채소"],
  ["해산물","갑각류, 기타 해산물 (was 기타해산물), 생선, 연체류, 조개류, 해조류"],
  ["음료","커피, 디카페인 커피, 보이차, 홍차, 녹차, 허브차, 탄산, 카페인, 기타 음료 (NEW level1 in v3.2 — drink-specific values)"],
  ["견과류","견과류"],
  ["계란","계란"],
],[1800,7560]));
C(spacer());
C(note("Note (v3.2): 음료 holds beverage-specific values. Many drink sub-ingredients reuse existing food values (우유, 콩류, 단 과일, 요거트, 기타 곡류, 설탕). 커피 implies caffeine; 카페인 is for added-caffeine drinks not in coffee/tea form (레드불, 박카스). 탄산 means pure carbonated water only — 콜라 maps to 탄산|설탕, zero-sugar sodas to 탄산|기타 소스. Sports/vitamin drinks (게토레이, 비타500) map to 기타 음료|설탕. 보이차 is kept as its own value (it is the most-consumed tea)."));
C(note("Note: 국물 (고기 국물 / 생선 국물) and 육수 (고기 육수 / 해물 육수 / 채소 육수) are intentionally kept as separate level1 groups. 생선 국물 and 해물 육수 coexist as distinct values. 춘장 is also accepted as a sauce value used in some mappings (e.g. 짜장).")); 
C(bold("Design philosophy"));
C(
  bullet("Practical, not strictly MECE — split where meaningful to Hyoje (e.g. 소고기/돼지고기/닭고기 kept separate), merge where not (오징어/낙지/문어 → 연체류)"),
  bullet("Multi-value foods use the pipe (|) separator inside parentheses, e.g. 케익(밀|설탕|기름)"),
  bullet("Items with no clean home map to 기타; 얼음 → 기타; 팥 → 콩류; 묵 types → 기타 곡류; 한천 → 해조류"),
  bullet("\"국만\"/\"국물\"/\"국물만\" in a dish name means broth only (strip rice/noodle); explicit 밥 in a name must include 쌀; 라면 implies 밀; 당면 is 전분 (not 밀)"),
);

// ===== 9. ATLAS SEARCH =====
C(h1("9. Atlas Search Index"));
C(h2("9.1 Overview"));
C(p("MongoDB Atlas Search (Lucene-based) is used for full-text keyword search across all relevant log fields. A single search index named log_search is defined on the log collection."));
C(p("Search behaviour:"));
C(
  bullet("Atlas Search runs first — fast, relevance-ranked results"),
  bullet("If Atlas Search returns zero results, a MongoDB regex fallback runs automatically across the same fields"),
  bullet("The API response includes a searchMode field: \"atlas\" or \"regex\""),
  bullet("The UI shows a \"포함 검색\" label when the regex fallback is active"),
);
C(h2("9.2 Korean Tokenisation — Known Limitation"));
C(p("Atlas Search uses edge n-gram tokenisation for autocomplete fields, which indexes from the start of each token. \"삼성\" matches \"삼성모바일스토어\" (prefix match) but \"모바일\" does NOT match \"삼성모바일스토어\" (mid-word). The regex fallback handles mid-word cases. Full n-gram tokenisation was deferred due to M0 free tier index size limits."));
C(h2("9.3 Index Definition"));
C(p("Index name: log_search. Field mappings:"));
C(table(["Field","Type(s)","Notes"],[
  ["userId","token","Exact match for user isolation filter"],
  ["start.datetime","date","Used for date range filter in $search compound"],
  ["activity.category","string + autocomplete",""],
  ["activity.name","string + autocomplete",""],
  ["activity.title","string + autocomplete","Primary keyword target"],
  ["activity.additionalInfo","string + autocomplete",""],
  ["location.activity","string + autocomplete","Physical place name"],
  ["location.online","string + autocomplete",""],
  ["location.other","string + autocomplete",""],
  ["cost.category","string + autocomplete",""],
  ["cost.categoryDetail","string + autocomplete",""],
  ["purchase[].item","string + autocomplete","Purchase item name — key for product search"],
  ["purchase[].unit","string + autocomplete",""],
  ["food.drinks[].item","string + autocomplete",""],
  ["food.foods[].item","string + autocomplete",""],
  ["food.alcohols[].item","string + autocomplete",""],
  ["people[].target","string + autocomplete","Person names"],
  ["transport.from","string + autocomplete",""],
  ["transport.to","string + autocomplete",""],
  ["travel.city","string + autocomplete",""],
  ["travel.theme","string + autocomplete",""],
  ["exercise[].item","string + autocomplete",""],
  ["reading.title","string + autocomplete",""],
  ["movie.title","string + autocomplete",""],
  ["notes","string + autocomplete","Catch-all free text"],
],[2800,2800,3760]));
C(spacer());
C(note("Note: food.foods[].ingredients (v3.1) is not currently part of the search index. It is used for analytics (future eating-behaviour widget), not keyword search. A phrase/mixed-query search enhancement (quoted phrases combined with free tokens via compound.must) was also added to GET /api/search in this period."));
C(h2("9.4 Numeric Fields for Aggregation"));
C(table(["Field","Type","Use Case"],[
  ["cost.amountKRW","Number","Total or average spending in KRW"],
  ["cost.amountForeign","Number","Foreign currency spending"],
  ["duration.totalSeconds","Number","Time spent — displayed in duration label format (e.g. 2h 30m)"],
  ["income.gross","Number","Gross income"],
  ["income.net","Number","Net income"],
  ["body.weight","Number","Weight at time of entry"],
  ["golf.score","Number","Golf score"],
  ["golf.approach","Number","Golf approach shots"],
  ["golf.putts","Number","Golf putts"],
  ["exercise[].amount","Number","Exercise amount or intensity"],
],[2800,1600,4960]));
C(spacer());
C(h2("9.5 Search API — GET /api/search"));
C(p("Route: GET /api/search. Requires authentication. Returns up to 100 results."));
C(table(["Parameter","Type","Required","Description"],[
  ["q","string","No*","Broad keyword — searched across all text fields with fuzzy matching. Supports quoted phrases (exact) mixed with free tokens (fuzzy), combined via compound.must (v3.1)."],
  ["dateFrom","string","No","Start date filter in YYYY-MM-DD format (inclusive)"],
  ["dateTo","string","No","End date filter in YYYY-MM-DD format (inclusive)"],
  ["conditions","string","No","Pipe-separated AND field conditions: field1:value1|field2:value2. Each value is parsed with the same parseQuery as q (v3.6): a quoted segment becomes a phrase scoped to that single field; any unquoted remainder stays fuzzy — see the field-scoped phrase note below"],
],[1700,1200,1300,5160]));
C(spacer());
C(note("Note: At least one of q, dateFrom, dateTo, or conditions must be provided."));
C(p("Available field keys for conditions parameter:"));
C(table(["Key","Field"],[
  ["activity.name","활동명"],
  ["activity.title","제목"],
  ["activity.additionalInfo","추가정보"],
  ["activity.category","카테고리"],
  ["location.activity","장소"],
  ["purchase.item","구매항목"],
  ["people.target","사람"],
  ["cost.category","비용카테고리"],
  ["transport.from","출발지"],
  ["transport.to","도착지"],
  ["travel.city","여행도시"],
  ["notes","메모"],
],[4680,4680]));
C(spacer());
C(bold("Field-scoped phrase matching (NEW v3.6)"));
C(p("Each field condition value is parsed with the same parseQuery the main q box uses, but scoped to that single field. A quoted segment becomes an exact-phrase clause on that field's Atlas path (and, in the regex fallback, a contiguous escaped-regex on that field); any unquoted remainder keeps the prior fuzzy autocomplete (Atlas) or loose regex (fallback). The logic is mirrored in both the Atlas compound condition loop and the regex-fallback condition loop — so activity.title:\"team lunch\" matches that exact phrase within activity.title, while activity.title:team lunch stays loose."));
C(note("Known limitation (out of scope): the main-query regex fallback still regexes the raw q including any quote characters. Because Atlas Search is primary and the fallback runs only when Atlas returns zero results, this path is rarely hit."));
C(p("Response shape:"));
C(table(["Field","Type","Description"],[
  ["query","string","The q parameter echoed back"],
  ["total","number","Number of results returned (max 100)"],
  ["searchMode","string","\"atlas\" = Atlas Search used; \"regex\" = fallback regex used"],
  ["results","array","Array of log documents with an additional score field (null for regex results)"],
  ["aggregations","object","Numeric aggregations (sum/avg/min/max/count) for fields that appear in results"],
],[2200,1600,5560]));
C(spacer());
C(h2("9.6 Search UI — Result Table Sorting (NEW v3.6)"));
C(p("The search results table (src/app/search/page.tsx) supports client-side column sorting layered on top of the API result order. Sorting is purely presentational — it reorders the already-returned results and never re-queries the server."));
C(
  bullet("Tri-state per column header: first click sorts, second click reverses, third click returns to the original API/relevance order"),
  bullet("Only one column is active at a time; the active header shows a ▲ / ▼ indicator"),
  bullet("Text columns ascend first; date and numeric columns descend first"),
  bullet("Missing or empty values always sink to the bottom regardless of direction; ties keep their original relative order (stable sort)"),
  bullet("The 활동/내용 column sorts by activity.title || activity.name — the visible bold label"),
  bullet("Running a new search resets the sort back to API/relevance order"),
);
C(spacer());

// ===== 10. MIGRATION REQUIREMENTS =====
C(h1("10. Migration Requirements"));
C(h2("10.1 Source Sheets to Migrate"));
C(table(["Sheet","File","Priority"],[
  ["~2025","Full Archive_2026Mar06","1 — largest historical dataset"],
  ["2026","Full Archive_2026Mar06","2 — current year archive"],
],[2400,3400,3560]));
C(note("Note: Active, History, and Future sheets are NOT migrated. They are managed in Google Sheets until Phase 5."));
C(h2("10.2 Supporting Collections to Migrate"));
C(
  bullet("cost_master — from Cost sheet in Active_2026Mar05"),
  bullet("activity_master — from Activity sheet in Active_2026Mar05"),
  bullet("reference_lists — from Activity sheet columns 3–14 in Active_2026Mar05"),
  bullet("timezone_master — from TimeDiff sheet in Active_2026Mar05"),
  bullet("exchange_rate — from TimeDiff sheet in Active_2026Mar05 (current rates only)"),
  bullet("alcohol_conversion — from AlcoholConv sheet in Active_2026Mar05 (npm run migrate-alcohol)"),
  bullet("ingredient_master — from Ingredient sheet in Active_2026Mar05 (npm run migrate-ingredient) — NEW v3.1"),
);
C(h2("10.3 Migration Tool Requirements"));
C(
  bullet("Connect to Google Sheets via Google Sheets API / service account"),
  bullet("Read all rows from each sheet (skip first header rows)"),
  bullet("Apply row filtering rules per Section 4.5"),
  bullet("Apply all transformation rules per Section 6"),
  bullet("Compute duration.totalSeconds from UTC-normalised start and end timestamps"),
  bullet("Clear all existing log documents for the user before inserting (delete-all + re-insert)"),
  bullet("Write transformed documents to MongoDB using bulk insert"),
  bullet("Report migration statistics: total rows, skipped rows, inserted rows, error rows"),
  bullet("Log any rows that fail validation with row number and reason (includes ingredient validation errors, v3.1)"),
);
C(h2("10.4 Performance Target"));
C(
  bullet("Migrate ~43,000 rows in under 5 minutes"),
  bullet("Use MongoDB bulk insert operations (not one-by-one)"),
);
C(h2("10.5 Migration Results"));
C(note("Note: Re-migration completed 30 April 2026 with v1.4 schema (43,123 documents). A full re-migration was performed after v3.0 column AO insertion, and again after v3.1 ingredient adoption. The figures below are the v1.4 baseline; the v3.1 food-row reconciliation result is recorded in Section 16.4."));
C(table(["Sheet","Total rows","Skipped","Inserted","Errors"],[
  ["~2025","41,327","1","41,326","0"],
  ["2026","1,797","0","1,797","0"],
  ["Total","43,124","1","43,123","0"],
],[2160,2000,1700,1900,1600]));
C(spacer());

// ===== 11. OPEN QUESTIONS =====
C(h1("11. Open Questions"));
C(table(["#","Question","Status"],[
  ["1","Master collections — user-editable via UI in Phase 5?","Pending — Phase 5 concern"],
  ["2","DB_Status/DB_ID columns — manual or by migration tool?","Resolved — deferred to post-MVP"],
  ["3","Atlas Search index — dynamic mapping or explicit field mapping?","Pending"],
  ["4","Should food.foods[].ingredients be added to the Atlas Search index, or kept analytics-only?","Pending — analytics-only for now"],
],[700,4900,3760]));
C(spacer());

// ===== 12. COST ANALYSIS DASHBOARD =====
C(h1("12. Cost Analysis Dashboard"));
C(h2("12.1 Overview"));
C(p("The cost analysis dashboard provides a pivot-table view of spending by category and categoryDetail across a selected time period. It supports drill-down to raw transactions and layout customisation."));
C(h2("12.2 Cost Category Structure"));
C(p("After data cleansing (May 2026), the following 22 cost categories are in use:"));
C(table(["Category","Notes"],[
  ["경조사/기부/선물","Gifts, donations, congratulatory expenses"],
  ["골프/운동","Golf and sports"],
  ["교통","Transport"],
  ["기타","Miscellaneous"],
  ["문화/취미","Culture and hobbies (incl. streaming subscriptions)"],
  ["민아","Spending on wife 민아 — intentional person-based category"],
  ["보험","Insurance"],
  ["부모님/가족","Parents and family"],
  ["사업","Business expenses"],
  ["생활","Daily living expenses"],
  ["세금","Tax"],
  ["숙박","Accommodation"],
  ["스키","Skiing"],
  ["식음","Food and drink"],
  ["윤지/윤희","Spending on children — intentional person-based category"],
  ["의료비/건강","Medical and health"],
  ["이사","Moving expenses"],
  ["자동차","Car expenses"],
  ["재테크","Investment and financial management"],
  ["종교 활동","Religious activities"],
  ["통신","Communication / mobile / internet"],
  ["패션","Fashion and clothing"],
],[3000,6360]));
C(spacer());
C(h2("12.3 Filters"));
C(
  bullet("Date range — from/to date pickers; default is last 12 months"),
  bullet("Category — multi-select to show/hide specific categories"),
  bullet("Category detail — multi-select filtered by selected categories"),
  bullet("Purchase item — free text search against purchase[].item field"),
);
C(h2("12.4 Pivot Table Structure"));
C(bold("Rows"));
C(
  bullet("Two-level hierarchy: category (parent) → categoryDetail (child, indented)"),
  bullet("Categories are draggable; dragging a category moves all its detail rows with it"),
  bullet("Details are draggable within their parent category only"),
  bullet("Categories are collapsible/expandable"),
  bullet("Row order and collapsed state are persisted in localStorage under key \"fargaze-cost-layout\""),
  bullet("Rows sorted by total spending descending by default"),
);
C(bold("Columns"));
C(
  bullet("One column per month in the selected date range"),
  bullet("Most recent month on the left, oldest on the right"),
  bullet("Year prefix ('YY) shown only on the first month of each calendar year in the range"),
  bullet("Bottom row shows column totals (sum per month across all visible categories)"),
);
C(bold("Cells"));
C(
  bullet("Each cell shows the sum of cost.amountKRW for that category+detail+month"),
  bullet("Empty cells show — (dash)"),
  bullet("Clicking a cell opens the drill-down sidebar"),
);
C(h2("12.5 Drill-Down Sidebar"));
C(p("Clicking any cell opens a slide-in sidebar showing the raw transactions for that category + categoryDetail + month combination. Each transaction row shows: start date, activity name, title, purchase items, cost KRW. Clicking a transaction row opens a full record modal showing all non-null fields grouped by section."));
C(h2("12.6 API Design"));
C(bold("GET /api/cost-summary"));
C(p("Returns aggregated spending data for the pivot table."));
C(table(["Parameter","Type","Required","Description"],[
  ["dateFrom","string","No","Start date in YYYY-MM-DD format; default 12 months ago"],
  ["dateTo","string","No","End date in YYYY-MM-DD format; default today"],
  ["categories","string","No","Comma-separated list of categories to include"],
  ["categoryDetails","string","No","Comma-separated list of categoryDetails to include"],
  ["purchaseItem","string","No","Text filter on purchase[].item"],
],[1900,1200,1200,5060]));
C(spacer());
C(bold("GET /api/cost-transactions"));
C(p("Returns raw log entries for a specific category + categoryDetail + month combination (drill-down)."));
C(table(["Parameter","Type","Required","Description"],[
  ["category","string","Yes","Cost category to filter by"],
  ["categoryDetail","string","No","Cost categoryDetail to filter by"],
  ["dateFrom","string","Yes","Start of month in YYYY-MM-DD format"],
  ["dateTo","string","Yes","End of month in YYYY-MM-DD format"],
],[1900,1200,1200,5060]));
C(spacer());
C(p("Response: array of log documents, sorted by start.datetime ascending."));
C(h2("12.7 Currency Handling"));
C(p("All amounts in the pivot table use cost.amountKRW exclusively. For descriptive analysis of foreign currency spending (especially GBP after January 2026), cost.amountForeign and cost.currency are available in the drill-down transaction detail view."));
C(h2("12.8 Layout Persistence"));
C(p("The following layout preferences are saved to localStorage under the key \"fargaze-cost-layout\": category row order, detail row order per category, collapsed/expanded state per category."));
C(note("Note: localStorage is used for simplicity in Phase 4. In a future phase this may be migrated to a user preferences collection in MongoDB for cross-device persistence."));

// ===== 13. INSIGHTS DASHBOARD =====
C(h1("13. Insights Dashboard"));
C(h2("13.1 Overview"));
C(p("The Insights dashboard provides widget-based analytics across multiple subject domains. Each widget is self-contained and uses a shared global filter bar for time range and cross-activity filtering."));
C(h2("13.2 Widget Framework"));
C(
  bullet("Two-dimensional framework: horizontal axis = subject domain; vertical axis = analytical floor (0→4, increasing depth)"),
  bullet("All widgets share: WidgetCard shell, global filter, Summary/Trend mode toggle"),
  bullet("Chart colour system: useIsDark() hook + chartColors(isDark); light: blue-700/stone; dark: teal-400/zinc"),
  bullet("Categorical palette (v3.3): CATEGORY_COLORS_LIGHT/DARK + categoryColors(isDark) — indexed, taxonomy-agnostic colours for grouped charts (treemaps, relationship bars); light = darker fills with white text, dark = lighter fills with near-black text; assigned by index over the groups present in the data, never keyed on domain values"),
  bullet("Summary-bar palette (v3.6): BAR_COLORS_LIGHT/DARK + barColors(isDark) + autoColorMap(keys, isDark) in chart-colors.ts — a dedicated palette for the shared summary bars (bars.tsx), kept deliberately separate from categoryColors and rankFlowColors; omitting a colorMap auto-assigns colours by first-seen key order"),
  bullet("Spline tension for trend charts: 0.2 (confirmed optimal)"),
  bullet("Page layout: CSS columns (columns-1 md:columns-2 lg:columns-3) — masonry-style packing, no empty gaps under shorter widgets"),
);
C(h2("13.3 Shared Chart Components"));
C(table(["Component","File","Description"],[
  ["bars.tsx (Title / BarRow / BarSection)","src/app/insights/_components/charts/bars.tsx","(v3.6) Shared summary-bar primitives. BarSection { title, data: Record<string,number>, colorMap?, isDark } sorts desc and draws max-normalised bars (longest = full) with a {pct}% ({count}) value column; omit colorMap → auto-assign via autoColorMap. Geometry h-1.5 rounded-full; typography text-[11px], label stone-600/zinc-300, value stone-500/zinc-400. Shared by the Diet, Drinking and Interactions summaries (Interactions' PeopleBars is composed from these primitives)"],
  ["BoxPlot","src/app/insights/_components/charts/BoxPlot.tsx","CSS horizontal box plot; pr-5 right padding; label width w-10"],
  ["Histogram","src/app/insights/_components/charts/Histogram.tsx","CSS bar chart histogram; fixed font sizes"],
  ["CssTrendChart","src/app/insights/_components/charts/css-chart-components.tsx","CSS+SVG line chart with Catmull-Rom spline; multi-series; week label compression"],
  ["CssVerticalBoxPlotChart","src/app/insights/_components/charts/css-chart-components.tsx","Vertical box plots per bucket; hover tooltip; props: formatY, height, and compact (v3.4). Default shows the y-axis and a Max/P75/Avg/P25/Min name legend on the rightmost bucket; compact hides both and prints value labels at max/avg/min so several boxes fit one row"],
  ["CssDualLineChart","src/app/insights/_components/charts/css-chart-components.tsx","Dual line chart (From/To); shared HH:MM Y-axis; filled area; dashed arrows with duration; +HH:MM for post-midnight"],
  ["CssRestChart","src/app/insights/_components/charts/css-chart-components.tsx","Stacked histogram bars + avg spline overlay; unified SVG coordinate space; PLOT_T/PLOT_B bounds"],
  ["CssDailyChart","src/app/insights/_components/charts/css-chart-components.tsx","(v3.3) Single daily-series line; optional dashed average line + zone bands; tooltip floats above the marker showing value + date; baselineZero option"],
  ["Treemap","src/app/insights/_components/charts/Treemap.tsx","(v3.3) Squarified treemap; CSS-positioned cells measured via ResizeObserver; top-N cap with a neutral 기타 (+N) rollup; per-mode cell text"],
  ["CalendarHeatmap / HeatStrip","src/app/insights/_components/charts/CalendarHeatmap.tsx","(v3.3) Mon–Sun calendar grid (modal) + single-row day strip (inline); range expanded to whole weeks; out-of-range days dimmed; colour via fillFor(date)"],
  ["StackedBars","src/app/insights/_components/charts/StackedBars.tsx","(v3.5) Reusable stacked bars; percent or absolute mode; legend hover-highlight dims the other series; shared by the Diet Composition / Spicy / Relation tabs"],
  ["CssRankFlowChart","src/app/insights/_components/charts/CssRankFlowChart.tsx","(v3.5) CSS-only ranked-flow ('top-N over time'): colour-tiles ranked top→bottom per bucket, a dashed reference line, and a grey block listing people who dropped out of the previous bucket's top-N. Per-person colour (rankFlowColors, first-seen order); hover-to-trace highlights one person across all buckets and shows per-bucket counts; blur-names privacy toggle; luminance-adaptive tile text; optional controls slot for a filter. No SVG. Used by Diet, Drinking, and Interactions"],
  ["MultiSelectDropdown","src/app/insights/_components/MultiSelectDropdown.tsx","Generic multi-select with Select-all / Deselect-all; onChange(draft) / onClose(commit). Rebuilt v3.5 to render its panel through a React portal on document.body with fixed positioning, so it escapes widget-card overflow:hidden; edge-aware (flips up, clamps horizontally, caps height with scroll) and re-measures on selection change, scroll, and resize"],
],[2200,3400,3760]));
C(spacer());
C(note("Note: BoxPlot and Histogram use CSS/HTML exclusively (no SVG). CSS chart components use CSS for layout/dots/labels and thin SVG overlay only for curved line paths."));
C(h2("13.4 Implemented Widgets"));
C(bold("Sleep Widget (WBS #53)"));
C(
  bullet("Summary view: avg duration, bedtime, wake time, sleep quality counts and score"),
  bullet("Trend view: 4 metric tabs — Duration, Bedtime, Wake Time, Quality Score"),
);
C(bold("Interactions Widget (WBS #56)"));
C(
  bullet("Summary view (restructured v3.6 — no tabs): Row 1 is an always-on two-column stats grid — left column interactions (Relation Type + Method bars), right column unique people (Relation Type + Method bars). Row 2 is a full-width PeopleBars block showing the top 10 individuals split ranks 1–5 (left) / 6–10 (right), jointly normalised against one shared max across all 10, each bar coloured by that person's dominant relation type. The old Stats/Top 10 tabs, TopPeopleTable, the summaryTab state and the SummaryTab type were removed; PeopleBars is composed locally from the shared bars.tsx primitives (Title / BarRow / BarSection)"),
  bullet("Trend view: 5 metric tabs — Interactions, Unique, Relation, Method (stacked bar), People (CssRankFlowChart, v3.5)"),
  bullet("Widget-local filters: Relation + Method multi-select with AND logic; commit-on-close pattern with a server-side re-fetch (the People rank-flow is filtered on the server, unlike Diet/Drinking which filter client-side)"),
);
C(bold("Drinking Widget (WBS #57) — Complete"));
C(
  bullet("Summary view (restructured v3.6 — no tabs; every block always-on). The Drinking Days + Total Drinks counters, Drinks-Per-Day box plot, Consecutive Rest Days histogram and Session Time rows are unchanged; only the proportional-bar block and the old Top 10 tab were reworked:"),
  bullet("Row 1 (35%:65%): [Drinking Days + Total Drinks stacked] | [Drinks Per Day box plot]", 1),
  bullet("Row 2 — bar block reorganised into two columns: left [Drink Type / Occasion], right [Relation / People]. \"With Whom\" was renamed Relation; the old Top 10 tab is folded in here as People bars, each person coloured by their dominant relation type", 1),
  bullet("Row 3 (65%:35%): [Consecutive Rest Days histogram] | [Session Time — From / To / For]", 1),
  bullet("All four bar charts use the shared bars.tsx primitives + barColors palette (v3.6); the Stats/Top 10 tab toggle was removed", 1),
  bullet("Trend view — 9 metric tabs: Freq, Amt(all), Amt(day), Type, Occasion, Relation, People, Rest, Session — where Relation is the relation-type stack (formerly labelled People) and People (v3.5) is a CssRankFlowChart of the top-7 companions with a client-side Relation filter"),
);
C(bold("Diet Widget (WBS #61) — Complete"));
C(
  bullet("Summary view is distribution-oriented (not a trend): four compact vertical box plots in one row — EATING CUTOFF, CAFFEINE CUTOFF, SERVINGS (인분), CARBS — each tappable to open a modal with the full daily line (CssDailyChart); the 인분 line carries green/light-blue/red zone bands (<3 소식 / 3–6 적당 / >6 과식)"),
  bullet("CAFFEINE CUTOFF = the latest time each day a caffeinated drink (ingredient 커피 or 카페인) was finished — computed in the same pass as the drink treemaps, so it counts coffee taken without any food", 1),
  bullet("Compact box plots drop the y-axis and the Max/P75/Avg/P25/Min name legend, printing value labels at max / avg / min instead, so four boxes fit a single row", 1),
  bullet("Spicy days: an inline single-row HeatStrip (one cell per day) with a summary count (e.g. \"0 H and 4 M out of 31 days\"), tappable to open the Mon–Sun CalendarHeatmap modal", 1),
  bullet("Treemaps shown one at a time via two toggles — Food/Drink × Ingredients/Items; ingredient cells coloured by level1 group (categoryColors), item cells by a single accent; top-N cap with a 기타 rollup; cell-label font capped at 11px", 1),
  bullet("With whom I eat: toggle between relationship bars (혼자 + categories) and a top-companions list", 1),
  bullet("Uppercase, centred section titles; compact layout (four-box row, single-treemap toggles) tuned to keep the widget near a single widget's height"),
);
C(bold("Diet — Trend view (8 tabs, complete v3.5)"));
C(
  bullet("Eating · Caffeine · Servings · Carbs — four box-plot-per-bucket tabs, each rendering CssVerticalBoxPlotChart (non-compact) across the weekly/monthly buckets"),
  bullet("Composition · Spicy · Relation — three tabs built on the reusable StackedBars: Composition (Food/Drink × Ingredients/Items toggles; dynamic 30%-threshold 'others' rollup, capped at palette size), Spicy (absolute H/M/L day counts), Relation (relation-type mix, 100%; 혼자 neutral)"),
  bullet("People — a CssRankFlowChart of the top-7 companions over time, with a Relation multi-select that re-ranks client-side (each person summed over the selected relation types, zeros dropped, top-7 re-taken)"),
  bullet("Tab persistence: a trendLoadedRef in DietWidget keeps the view mounted across bucket-size changes so the active tab is not reset"),
);
C(note("Naming convention (unified v3.5) across the Diet, Drinking, and Interactions trend views: the relation-type 100% stacked tab is Relation; the top-7 individual rank-flow tab is People; the relation multi-select is the Relation filter. Diet and Drinking filter the rank-flow client-side from the per-bucket people map; Interactions filters server-side (committed on close, then re-fetch)."));
C(h2("13.5 Drinking Widget — Data Model"));
C(bold("6am Date Assignment Rule"));
C(p("Alcohol records with start.datetime between 00:00–05:59 are attributed to the previous calendar day. Implemented via assignDrinkingDate() in the API route. The fetch window is expanded by 6 hours at the start of the period to capture midnight records."));
C(bold("Drinks Quantity Calculation"));
C(table(["Field","Description"],[
  ["total","Sum of all drinks across the period"],
  ["min","Minimum per-day drinks total (drinking days only)"],
  ["max","Maximum per-day drinks total (drinking days only)"],
  ["avg","Average per-day drinks (drinking days only)"],
  ["p25","25th percentile of per-day drinks distribution"],
  ["p75","75th percentile of per-day drinks distribution"],
  ["n","Number of drinking days used in per-day stats"],
],[2400,6960]));
C(spacer());
C(bold("Drink Type Calculation"));
C(p("Each record contributes exactly 1.0 to the total across all types. If a record contains multiple alcohol items, the 1.0 is split proportionally by drinks value. E.g. a record with 와인 (2.43 drinks) and 사케 (0.94 drinks) gives: 와인 += 0.72, 사케 += 0.28. Results are rounded to integers for display."));
C(bold("Rest Day Score & Histogram Buckets"));
C(p("score(D) = diffDays(D, lastDrinkBeforeD) - 1 + (D is rest ? 1 : 0). If no prior drinking day exists, anchor to datasetFirstDate."));
C(table(["Bucket","Range","Meaning"],[
  ["0d","0 rest days","Drank on consecutive days"],
  ["1d","Exactly 1 rest day",""],
  ["2–3d","2–3 consecutive rest days",""],
  ["4–6d","4–6 consecutive rest days",""],
  ["1–2w","7–13 consecutive rest days",""],
  ["2–4w","14–29 consecutive rest days",""],
  ["1m+","30+ consecutive rest days",""],
],[2000,3400,3960]));
C(spacer());
C(bold("Trend Mode API — drinking.summary"));
C(p("mode=trend returns per-bucket data: drinkingDays, daysInPeriod, totalDrinks, avgDrinksPerDay, drinksBox {min/max/avg/p25/p75}, avgRestDays (computed via dailyScores), histogram (Record<string,number> with all 7 buckets), drinkType, occasions, companions, people, avgStartMins, avgEndMins, avgDurationSeconds. companions is the relation-type stack (Record<string,number>) behind the Relation tab; people (added v3.5) is the per-person, per-relation-type breakdown Record<string, Record<string,number>> that drives the People rank-flow tab and its client-side Relation filter — built from the same per-event dedupe and category rules as the summary's topPeople."));
C(h2("13.6 CSS Chart Architecture"));
C(
  bullet("Bars, dots, labels, axes: CSS/HTML divs with pixel or percentage positioning"),
  bullet("Curved lines: SVG with fixed pixel viewBox (e.g. \"0 0 500 160\") to avoid coordinate mismatch with CSS"),
  bullet("Week label compression: compressWeekLabels() — first bucket shows YYWww, subsequent show Www; year change resets to YYWww"),
  bullet("Y-axis overflow prevention: labels clamped (skip if outside plot bounds); Y-axis containers are overflow-hidden"),
  bullet("CssRestChart: both axes use shared PLOT_T=12px / PLOT_B=REST_H-4px bounds; bars pre-calculated via for-loop"),
  bullet("ISO week: stepBack() and currentPeriod() both use Jan-4-based ISO week calculation"),
);
C(h2("13.7 Bug Fixes in v2.9"));
C(table(["Bug","Fix"],[
  ["stepBack() week number off by one","Replaced Jan-1-based formula with ISO week calculation using Jan 4 as reference"],
  ["currentPeriod() week number off by one","Same ISO fix applied; finds this week's Monday and counts from W01 Monday"],
  ["formatBucketLabel() showing Wundefined","Updated to handle compressed format \"2026W21\" and \"W21\" in addition to raw \"2026-W21\""],
  ["CssRestChart bars overflowing upward","Unified SVG pixel coordinate space; pre-calculated segments via for-loop; shared PLOT_T/PLOT_B bounds"],
  ["avgRestDays in trend buckets incorrect","Now uses computeDailyScores() identical to computeDrinkingSummary()"],
],[3400,5960]));
C(spacer());
C(h2("13.8 Diet Widget — Data Model (NEW v3.3; extended v3.4, v3.5)"));
C(bold("API — diet.summary"));
C(p("computeDietSummary(userId, periodStart, periodEnd, crossActivities) returns one summary object for the whole period. It reuses assignDrinkingDate() as the shared 6am day-boundary helper (00:00–05:59 → previous day) across every per-day metric, fetches food/drink-bearing records (food.foods[] or food.drinks[] non-empty) with a 6-hour early lookback, and joins level2 → level1 from ingredient_master in JS (same pattern as the alcohol convMap). Per-day arrays are capped at yesterday; rangeStart/rangeEnd carry the full (uncapped) filter range for the calendar grid."));
C(table(["Field","Description"],[
  ["finishEating","[{date, endMins}] — latest end time among food-bearing records per day; endMins +1440 for post-midnight"],
  ["finishCaffeine","[{date, endMins}] — latest end time among records with a caffeinated drink (ingredient 커피/카페인) per day; computed in the drinks pass, so coffee taken without food still counts (v3.4)"],
  ["servings","[{date, total}] — Σ food.foods[].amount (인분); parseFloat so it works on String or Number"],
  ["carbsIndex","[{date, value}] — Σ (carbs H=2/M=1/L=0 × that meal's 인분); drinks excluded"],
  ["spiciness","[{date, level}] — per eating day, max of H/M/L (L = ate but not spicy); a day absent from the array had no meal logged"],
  ["ateIngredients / drankIngredients","[{level2, level1, count}] — frequency; level1 joined from ingredient_master"],
  ["ateItems / drankItems","[{item, count}] — frequency by item name"],
  ["companions","{alone, total, byRelationType, topPeople[]} — scoped to food- OR drink-bearing records; drink-only meetups (e.g. coffee) now count (v3.5)"],
  ["averages","{finishEatingMins, finishCaffeineMins, servings, carbsIndex} — mean over days present (drives the average line/marker)"],
  ["rangeStart / rangeEnd","full filter range (uncapped) — for the spiciness calendar grid"],
],[2700,6660]));
C(spacer());
C(bold("Scope rules"));
C(
  bullet("\"Eating\" = a record with at least one non-null food.foods[].item. A drink-only record (e.g. a midnight juice) is excluded from the eating metrics but still counts in the drink treemaps."),
  bullet("Alcohol (food.alcohols[]) is excluded entirely — it has no ingredients and is covered by the Drinking widget. Drink treemaps read food.drinks[] only."),
  bullet("Counting is frequency-based (each occurrence = 1)."),
  bullet("The 6am day-boundary rule from the Drinking widget applies uniformly to every per-day Diet metric — with one exception (v3.5): records tagged food.type === '아침' (breakfast) are exempted from the previous-day rollback and the +1440 late-night shift, so an early-morning breakfast stays on its own calendar day."),
);
C(bold("Summary view = distribution, not trend"));
C(p("The summary deliberately shows the distribution of daily values (box plots, with the full daily line one tap away in a modal) rather than a period trend — the average is the headline statistic. The Trend view (complete as of v3.5) rolls these same metrics into weekly/monthly buckets per the global filter; its eight tabs are described in Section 13.4."));
C(bold("Trend Mode API — diet.summary (NEW v3.5)"));
C(p("mode=trend returns one object per bucket: label, daysInPeriod, the four box-plot arrays (eatingCutoff, caffeineCutoff, servings, carbs), the composition maps (ateIng, ateItems, drankIng, drankItems), spicy {H,M,L}, relation (Record<string,number>, behind the Relation tab), and people (Record<string, Record<string,number>>). people is the per-person, per-relation-type companion breakdown that the People rank-flow tab filters and re-ranks client-side; it is built from the same personMap category counts the summary uses for topPeople, so the 아침 exception and the food-or-drink scope apply identically."));
C(bold("Spiciness calendar — one rule for all filter modes"));
C(p("Expand [rangeStart, rangeEnd] to whole Mon–Sun weeks and dim any day outside the range. Month → 1st to month-end with adjacent-month days dimmed; week → one row; day → that day's full week with only the one day solid; period → a continuous grid. Cell colours: red (any H), amber (M, no H), blue (ate, not spicy), empty (no meal logged). The inline HeatStrip uses the same fillFor() colouring in a single dateless/headerless row."));
C(bold("Colour assignment"));
C(p("Ingredient-group and relationship colours are assigned at runtime by indexing categoryColors(isDark) over the groups present in the data (locale-sorted for stability) — no domain values are hard-coded in the widget, so taxonomy changes flow through automatically. A future option is to return the canonical level1 order from ingredient_master for permanently pinned colours."));
C(bold("Components introduced"));
C(
  bullet("Treemap.tsx — squarified layout, CSS-positioned cells measured by ResizeObserver, top-N cap + neutral 기타 (+N) rollup"),
  bullet("CalendarHeatmap.tsx — CalendarHeatmap (full Mon–Sun grid, reusable for WBS #59) and HeatStrip (compact inline row)"),
  bullet("CssDailyChart (in css-chart-components.tsx) — daily line with average line, zone bands, above-marker value+date tooltip"),
  bullet("CssVerticalBoxPlotChart gained formatY (e.g. HH:MM axis), height, and compact (v3.4 — drops the y-axis and the name legend, labelling max/avg/min directly) so four boxes fit one row"),
);
C(bold("Caffeine cutoff — placement (v3.4)"));
C(p("finishCaffeine is built in the same loop pass that counts drink ingredients (before the food-only cut), not inside the finish-eating block. The finish-eating block runs only for food-bearing records, so computing caffeine there would silently drop coffees taken without food. The check is: any food.drinks[] entry whose ingredients include 커피 or 카페인 → take that record's end time as a candidate for the day's caffeine cutoff."));

// ===== 14. HANDOVER =====
C(h1("14. Project Handover & Developer Context"));
C(h2("14.1 Purpose"));
C(p("This section is written for a future Claude session continuing development of FarGaze Log. When starting a new conversation, tell Claude: \"Please read the FarGaze Log design (v3.6) and WBS (v2.7) documents in my Google Drive and let's resume the development.\""));
C(h2("14.2 Repository & Deployment"));
C(table(["Item","Value"],[
  ["GitHub repo","nullpitch-dev/fargaze-log"],
  ["Production URL","https://log.fargaze.co"],
  ["Local dev","~/projects/fargaze-log on WSL2 (Ubuntu)"],
  ["Deployment","Vercel — auto-deploys from main branch"],
  ["Node version","24.x (Vercel runtime)"],
],[2600,6760]));
C(spacer());
C(h2("14.3 Tech Stack"));
C(table(["Layer","Technology","Notes"],[
  ["Framework","Next.js 15 (App Router)","src/app directory structure"],
  ["Language","TypeScript","Strict mode"],
  ["Styling","Tailwind CSS v4","Dark mode via prefers-color-scheme; light: stone palette, dark: zinc palette"],
  ["Database","MongoDB Atlas M0","AWS Europe Ireland; mongoose ODM"],
  ["Search","MongoDB Atlas Search","Index: log_search; autocomplete + text dual-mapping"],
  ["Auth","Auth.js (NextAuth) v5","Google OAuth; EMAIL_TO_USER_ID in src/auth.ts"],
  ["Drag & Drop","@dnd-kit/core + @dnd-kit/sortable","Used in spending pivot table"],
  ["Charts","Custom CSS + SVG components","CSS-first; SVG only for curved line paths in trend charts"],
  ["Hosting","Vercel","Environment variables set in Vercel dashboard"],
],[2000,2800,4560]));
C(spacer());
C(h2("14.4 Directory Structure"));
C(table(["Path","Purpose"],[
  ["src/app/insights/page.tsx","Insights master page — CSS columns layout; widget registry (WIDGETS array)"],
  ["src/app/insights/_widgets/SleepWidget.tsx","Sleep widget"],
  ["src/app/insights/_widgets/InteractionsWidget.tsx","Interactions widget — Summary restructured v3.6 (two-column stats grid + full-width PeopleBars, no tabs); StackedBarBucket type now local here after the SVG-module retirement"],
  ["src/app/insights/_widgets/DrinkingWidget.tsx","Drinking widget — Summary (restructured v3.6: two-column bar block + People bars, no tabs) + Trend (9 metric tabs), TrendTip component"],
  ["src/app/insights/_widgets/DietWidget.tsx","Diet widget (WBS #61) — Summary view: four compact box plots, spicy HeatStrip + calendar modal, treemap toggles, companions toggle (v3.3–v3.4)"],
  ["src/app/insights/_components/charts/BoxPlot.tsx","CSS horizontal box plot — props: min, max, avg, p25, p75, isDark"],
  ["src/app/insights/_components/charts/Histogram.tsx","CSS histogram — props: buckets[] ({label, count}), isDark"],
  ["src/app/insights/_components/charts/css-chart-components.tsx","CSS+SVG chart components: CssTrendChart, CssVerticalBoxPlotChart (compact prop v3.4), CssDualLineChart, CssRestChart, CssDailyChart (v3.3), compressWeekLabels (CssStackedBarChart removed v3.6)"],
  ["src/app/insights/_components/charts/Treemap.tsx","Squarified treemap (v3.3); ResizeObserver-measured cells; top-N + 기타 rollup; label font capped at 11px (v3.4)"],
  ["src/app/insights/_components/charts/CalendarHeatmap.tsx","CalendarHeatmap (Mon–Sun grid, modal) + HeatStrip (single-row inline) (v3.3)"],
  ["src/app/insights/_components/charts/bars.tsx","(v3.6) Shared summary-bar primitives Title / BarRow / BarSection; desc-sorted, max-normalised bars with {pct}% ({count}) values; used by the Diet, Drinking and Interactions summaries (replaces the retired SVG _lib/chart-components.tsx)"],
  ["src/app/insights/_lib/chart-colors.ts","chartColors(isDark), PERSON_COLORS_LIGHT/DARK, categoryColors (v3.3), rankFlowColors (v3.5), BAR_COLORS_LIGHT/DARK + barColors(isDark) + autoColorMap (v3.6)"],
  ["src/app/insights/_lib/format.ts","formatDuration, formatBucketLabel (handles month, week raw/compressed, day)"],
  ["src/app/insights/_lib/hooks.ts","useIsDark()"],
  ["src/app/insights/_lib/date-helpers.ts","buildParams, currentMonthStr, todayStr, defaultPeriodFrom"],
  ["src/app/insights/_components/WidgetCard.tsx","WidgetCard, ViewToggle, BucketSelector, FloorBadge"],
  ["src/app/insights/_components/GlobalFilterBar.tsx","Global filter bar — 4 time modes, cross-activity multi-select"],
  ["src/app/insights/_components/MultiSelectDropdown.tsx","Reusable multi-select dropdown"],
  ["src/app/api/insights/stats/route.ts","GET /api/insights/stats — thin dispatcher (~150 lines, v3.4): auth + param parsing; routes metric/mode to the per-widget compute modules below"],
  ["src/lib/insights/dates.ts","Shared date/period helpers (v3.4): buildDateRange, stepBack, labelForPeriod, currentPeriod, assignDrinkingDate, assignSleepDate, hourStringToMinutes, yesterdayStr, diffDays, SLEEP_THRESHOLD_HOUR"],
  ["src/lib/insights/util.ts","Shared numeric helper (v3.4): percentile"],
  ["src/lib/insights/sleep.ts","computeSleepSummary + QUALITY_SCORE (v3.4)"],
  ["src/lib/insights/interactions.ts","computeInteractionsSummary, computeInteractionsTrendBucket, addTransitioning (v3.4) — no external deps"],
  ["src/lib/insights/drinking.ts","computeDrinkingSummary, computeDrinkingTrendBucket + drinking helpers (computeDailyScores, bucketScore, classifyOccasion, hourStrToDecimal, SCORE_BUCKET_ORDER) (v3.4)"],
  ["src/lib/insights/diet.ts","computeDietSummary (v3.4; computeDietTrend to follow with the Trend view)"],
  ["src/models/AlcoholConversion.ts","Mongoose model for alcohol_conversion collection"],
  ["src/models/IngredientMaster.ts","Mongoose model for ingredient_master collection (NEW v3.1); unique index { userId, level2 }"],
  ["src/models/Log.ts","Mongoose model for log collection; food.spiciness added v3.0; food.foods[].ingredients (foodsItemSchema) added v3.1; food.drinks[].ingredients (drinksItemSchema) added v3.2; alcohols unchanged"],
  ["src/lib/migration/rowToDocument.ts","Maps Google Sheets row to MongoDB document; FOOD_ITEM col 45, DRINK_ITEM col 41; foods AND drinks post-processed via parseFoodIngredients (foods v3.1, drinks v3.2)"],
  ["src/lib/migration/transform.ts","Transformation utilities; v3.1 adds parseFoodIngredients(), loadValidLevel2(), resetValidLevel2(), IngredientValidationError"],
  ["src/app/search/page.tsx","Search UI — LogEntry type and DetailPanel; food.spiciness added v3.0; mixed phrase/token query hint (v3.1); client-side tri-state sortable result columns (v3.6)"],
  ["src/app/api/search/route.ts","GET /api/search — Atlas Search primary + regex fallback; parseQuery mixed phrase/token (v3.1); per-field exact-phrase conditions mirrored across the Atlas and regex condition loops (v3.6)"],
  ["scripts/migrate.ts","Daily migration runner; calls loadValidLevel2 at start; uncomment ~2025 block for full re-migration"],
  ["scripts/migrate-alcohol-conversion.ts","One-time migration: reads AlcoholConv sheet → inserts into alcohol_conversion"],
  ["scripts/migrate-ingredient.ts","Seeds ingredient_master from the Ingredient sheet (NEW v3.1); run once, re-run only when the Ingredient sheet changes"],
  ["scripts/fill-historical-ingredients.ts","Fills food.foods[].ingredients on existing rows from embedded REVIEWED_MAP (1,156 entries) + bestGuess fallback; modes: --dry-run, --export-worklist, default write; treats [\"Not Defined\"] as refillable (NEW v3.1)"],
  ["scripts/inspect-ingredients.ts","Survey: docs with foods, items with/without ingredients, Not Defined count, top level2 distribution, samples (NEW v3.1)"],
  ["scripts/reconcile-foods.ts","Re-parses sheets with the live parser and compares against MongoDB; reports gap and per-row errors (NEW v3.1)"],
  ["scripts/scan-bad-parens.ts","Lists every source row whose FOOD or DRINK token has parentheses the parser rejects (NEW v3.1; extended to the drink column v3.2)"],
  ["scripts/fill-historical-drinks.ts","Fills food.drinks[].ingredients from embedded DRINK_MAP (278 reviewed entries) + 아이스/핫 normalisation + substring fallback; modes: --dry-run, --export-worklist, default write; treats [\"Not Defined\"] as refillable (NEW v3.2)"],
  ["scripts/inspect-drinks.ts","Survey for drinks: docs with drinks, items with/without ingredients, Not Defined count, top level2 distribution, samples (NEW v3.2)"],
],[3400,5960]));
C(spacer());
C(h2("14.5 Environment Variables"));
C(table(["Variable","Where","Purpose"],[
  ["MONGODB_URI","Vercel + .env.local","MongoDB Atlas connection string"],
  ["GOOGLE_CLIENT_ID","Vercel + .env.local","Google OAuth client ID"],
  ["GOOGLE_CLIENT_SECRET","Vercel + .env.local","Google OAuth client secret"],
  ["NEXTAUTH_SECRET","Vercel + .env.local","Auth.js session encryption key"],
  ["NEXTAUTH_URL","Vercel + .env.local","https://log.fargaze.co"],
  ["GOOGLE_OWNER_EMAIL","Vercel + .env.local","hyoje.choi@gmail.com — maps to userId hyoje"],
  ["GOOGLE_SERVICE_ACCOUNT_FILE","Vercel + .env.local","Service account JSON filename (in /myfiles) for Google Sheets API"],
  ["SPREADSHEET_ID_ACTIVE","Vercel + .env.local","Google Sheets file ID for Active spreadsheet (incl. AlcoholConv, Ingredient sheets)"],
  ["SPREADSHEET_ID_ARCHIVE","Vercel + .env.local","Google Sheets file ID for Full Archive (~2025 + 2026)"],
  ["ANTHROPIC_API_KEY","Vercel + .env.local","Anthropic API key (for future LLM features)"],
],[3000,2400,3960]));
C(spacer());
C(h2("14.6 Data Summary"));
C(table(["Item","Value"],[
  ["Total log documents","~43,123 (41,326 from ~2025, 1,797 from 2026)"],
  ["Documents with foods","6,154"],
  ["Food items total","15,375 — all with ingredients populated, 0 Not Defined (v3.1)"],
  ["Documents with drinks","~5,006"],
  ["Drink items total","~5,462 — all with ingredients populated, 0 Not Defined (v3.2)"],
  ["Date range","2018 to present"],
  ["Cost categories","22 clean categories (see Section 12.2)"],
  ["Ingredient taxonomy","73 level2 values across 16 level1 groups (ingredient_master) — food + drinks"],
  ["Primary currency","KRW — cost.amountKRW always populated; foreign amounts also stored"],
  ["User","userId = hyoje"],
  ["Atlas Search index","log_search — autocomplete + text dual-mapping on all text fields"],
],[3000,6360]));
C(spacer());
C(h2("14.7 Key Architecture Decisions"));
C(
  bullet("Auth: Google OAuth → EMAIL_TO_USER_ID map → userId in JWT cookie. Three-layer security: middleware + API 403 + MongoDB userId filter."),
  bullet("Schema: duration.totalSeconds only (no d/h/m/s). Computed from start/end UTC timestamps using timezoneOffset."),
  bullet("Migration: delete-all + re-insert strategy (no unique index). Daily run on 2026 sheet only; full re-migration by uncommenting ~2025 block."),
  bullet("Ingredients: food.foods[].ingredients (v3.1) and food.drinks[].ingredients (v3.2) populated from level2 taxonomy. Source of truth is ingredient_master (seeded from the Ingredient sheet). parseFoodIngredients validates foods and drinks against the loaded vocabulary; the historical-fill scripts repair anything the parentheses do not cover. food.alcohols[] has no ingredients."),
  bullet("Search: Atlas Search primary, regex fallback when Atlas returns 0 results. searchMode field in response indicates which was used. Field conditions support scoped exact-phrase matching via parseQuery (v3.6); result-table sorting is client-side (v3.6)."),
  bullet("Spending page layout: category order, detail order, collapsed state persisted in localStorage under key \"fargaze-cost-layout\"."),
  bullet("Dark mode: Tailwind v4 with prefers-color-scheme media query. Light = stone palette, dark = zinc palette."),
  bullet("DnD: @dnd-kit/core + @dnd-kit/sortable. Category drag moves details with it. Detail drag scoped within category."),
  bullet("Spending dropdown: uses React createPortal to render into document.body, escaping table stacking context."),
  bullet("Insights API (v3.4): one compute module per widget under src/lib/insights/ (sleep, interactions, drinking, diet), each exporting its summary (and trend) function; route.ts is a thin GET dispatcher. Shared date/period helpers live in dates.ts, shared numerics in util.ts. Each widget keeps its own Log.find + aggregation (windows differ — drinking caps at yesterday, diet has a 6h lookback), so the fetch is deliberately not abstracted into one shared pass."),
  bullet("Summary bars (v3.6): the Diet, Drinking and Interactions summaries share bars.tsx (Title / BarRow / BarSection) with a dedicated barColors palette in chart-colors.ts, kept separate from categoryColors/rankFlowColors. The legacy SVG module _lib/chart-components.tsx and CssStackedBarChart were retired in the same pass; the Interactions and Drinking summaries were restructured to drop their Stats/Top 10 tabs."),
);
C(h2("14.8 Current WBS Status"));
C(table(["Phase","Status","Notes"],[
  ["Phase 1 — Infrastructure & Auth","Complete",""],
  ["Phase 2 — Data Structure Design","Complete",""],
  ["Phase 3 — Migration Tool","Complete",""],
  ["Phase 4 — Analytics & Search","In progress","WBS #53, #56, #57, #60, #61, #62 complete; Insights polish pass (#1–#9) + bar standardisation complete (v3.6). Remaining: #54 Weight, #58 Exercise, #59 Calendar"],
  ["Phase 5 — Data Entry","Not started",""],
],[3000,1800,4560]));
C(spacer());
C(h2("14.9 Remaining Phase 4 Items"));
C(
  bullet("#54 Widget: Weight trend — body.weight over time"),
  bullet("#58 Widget: Exercise trend — exercise.frequency metric"),
  bullet("#59 Native calendar view (historical and future entries) — can reuse the CalendarHeatmap component built for Diet"),
);
C(h2("14.10 Questions to Ask Hyoje When Starting a New Conversation"));
C(
  num("Which WBS item would you like to work on next?"),
  num("Are there any bugs or UI issues to fix first?"),
  num("Is the codebase compiling and running correctly on localhost?"),
  num("Are there any design decisions from the previous session that you want to revisit?"),
);

// ===== 15. DAILY ROUTINE =====
C(h1("15. Daily Data Routine (NEW v3.1)"));
C(h2("15.1 Overview"));
C(p("This section documents the day-to-day workflow for keeping MongoDB in sync with the Google Sheets source, including ingredient population. The routine applies whenever source data changes — most commonly when yesterday's entries are moved from the Active sheet into the 2026 archive sheet."));
C(h2("15.2 The Routine — Step by Step"));
C(table(["Step","Command","What it does"],[
  ["1. Drop in new data","(manual, in Google Sheets)","Move yesterday's completed entries from the Active sheet into the 2026 archive sheet. Use the parenthesis ingredient notation on food AND drink items, e.g. 밥(쌀)+계란(계란) and 라떼(커피|우유). Items without parentheses become [\"Not Defined\"] and are repaired in steps 3-4."],
  ["2. Migrate","npm run migrate","Deletes all 2026 documents (Log.deleteMany({ userId, 'start.year': 2026 })) and rebuilds them from the 2026 sheet. Foods with parenthesis notation get their ingredients directly from parseFoodIngredients; foods without get [\"Not Defined\"]."],
  ["3. Fill ingredients","npx tsx scripts/fill-historical-ingredients.ts","Repairs every food item whose ingredients are missing or [\"Not Defined\"] using the embedded REVIEWED_MAP + bestGuess fallback. Skips items that already have real ingredients (including today's properly-parenthesised rows)."],
  ["4. Fill drinks","npx tsx scripts/fill-historical-drinks.ts","Same as step 3 but for food.drinks[].ingredients, using the DRINK_MAP. Independent of the foods fill; order between them does not matter."],
  ["5. Inspect","npx tsx scripts/inspect-ingredients.ts + inspect-drinks.ts","Surveys both foods and drinks: items with ingredients vs Not Defined, top level2 distribution, samples."],
  ["6. Reconcile","npx tsx scripts/reconcile-foods.ts","Re-reads the source sheets with the live parser and compares against MongoDB. Reports source-vs-DB gap and any per-row parse errors. Target: gap = 0, errors = 0."],
],[1700,2900,4760]));
C(spacer());
C(h2("15.3 Why migrate then fill?"));
C(p("The main migrate rebuilds 2026 from the sheet, where ingredients can only come from parentheses. Older rows without parentheses would become [\"Not Defined\"]. The fill script then tops these up from the reviewed map. Running both in sequence guarantees that both new-style (parenthesised) and old-style (parenthesis-less) rows end up with correct ingredients."));
C(note("Note (Case A — no stale ingredients): Because the user always runs migrate after any source change, every 2026 document is deleted and rebuilt each time. Old ingredient values can never linger from a previous state — there is no scenario where the sheet says one thing and MongoDB shows a stale ingredient from a deleted item."));
C(h2("15.4 Idempotency & the Not-Defined Rule"));
C(p("The fill script's skip condition treats [\"Not Defined\"] as unfilled, so re-runs repair items that a migration reset to Not Defined. Items that already hold real ingredients are skipped. This makes the fill step safe to run every day:"));
C(
  bullet("Items with real ingredients (from parentheses or a prior fill) → skipped, untouched"),
  bullet("Items that are [\"Not Defined\"] → re-filled from the reviewed map"),
  bullet("Items with no ingredients field at all → filled"),
);
C(h2("15.5 Cleaning Legacy Parentheses"));
C(p("Old source rows that used descriptive (non-ingredient) parentheses — e.g. 소고기 국밥(국만), 짬뽕(국물만), 소고기 미역국(밥만), 아이스크림(와일드바디), 회(도다리 세꼬시와 광어) — will be rejected by parseFoodIngredients because the text in parentheses is not a valid level2 value. Run scripts/scan-bad-parens.ts to list every offending row, then fix them in the sheet (remove the descriptive parentheses, or convert to real ingredient notation), and re-migrate. After cleaning, reconcile should report gap = 0 and errors = 0."));

// ===== 16. MASTER-TABLE UPDATE PROCEDURES =====
C(h1("16. Master-Table Update Procedures (NEW v3.1)"));
C(p("FarGaze has two food-related master tables that are seeded from the Active spreadsheet: the alcohol conversion table and the ingredient taxonomy. This section is the canonical procedure for updating each."));
C(h2("16.1 Updating the Alcohol Conversion Table (alcohol_conversion)"));
C(p("The alcohol_conversion collection maps each (item, unit) pair to a drinks value (see Section 8.6). To add or change a conversion:"));
C(
  num("Open the AlcoholConv sheet in the Active_2026Mar05 spreadsheet (range AlcoholConv!A2:E)"),
  num("Add or edit a row: item, unit, unitTo50ml, alcoholRatio. The drinks value is unitTo50ml × alcoholRatio. Example added in v3.1: 와인 / ml."),
  num("If precision matters, increase the decimal places shown in the sheet cell before migrating — the migration reads the displayed value"),
  num("Run npm run migrate-alcohol — this does delete-all + re-insert for the alcohol_conversion collection"),
  num("Verify the collection document count in MongoDB Atlas (54 documents as of v3.1)"),
);
C(note("Note: 1 drink = 1 소주잔 = 50ml soju equivalent. The drinks field on each alcohol log entry = amount × convMap[item][unit].drinks. Changing a conversion does NOT require re-migrating the log collection — the drinking widget reads alcohol_conversion at query time."));
C(h2("16.2 Updating the Ingredient Taxonomy (ingredient_master)"));
C(note("Note (v3.2): the same ingredient_master taxonomy now serves both foods and drinks. Adding a drink value (e.g. a new tea under 음료) follows exactly the same procedure below. After any taxonomy change, re-run migrate, then both fill-historical-ingredients.ts and fill-historical-drinks.ts."));
C(p("The ingredient_master collection holds the level1/level2 taxonomy and is the single source of truth for the level2 vocabulary used by parseFoodIngredients validation (see Section 8.7). To add, rename, or regroup an ingredient class:"));
C(
  num("Open the Ingredient sheet in the Active_2026Mar05 spreadsheet (columns level1 / level2, header row 1)"),
  num("Add a new row (new level1+level2), rename a level2 value, or move a level2 to a different level1 group"),
  num("Run npm run migrate-ingredient — this does delete-all + re-insert for ingredient_master, refreshing the level2 vocabulary"),
  num("Re-run the main migration (npm run migrate) so that parseFoodIngredients validates against the updated vocabulary; otherwise new-data rows using a renamed value would be rejected"),
  num("Run the fill script and reconcile per Section 15 to repair and verify"),
);
C(bold("Important sequencing rule"));
C(p("The main migrate (npm run migrate) calls loadValidLevel2() at startup, which reads ingredient_master. If ingredient_master is empty (migrate-ingredient never run) or stale (renames not re-seeded), migration will reject rows using the new/renamed values. Therefore: always run migrate-ingredient at least once before relying on migrate, and re-run it after any change to the Ingredient sheet. Run migrate-ingredient once; re-run only when the Ingredient sheet changes."));
C(bold("Taxonomy renames performed in v3.1"));
C(table(["Old level2","New level2","level1"],[
  ["생선 육수","해물 육수","육수"],
  ["야채 육수","채소 육수","육수"],
  ["기타해산물","기타 해산물","해산물"],
  ["콩류 (was under 채소-like grouping)","콩류 (unchanged name)","moved to 곡류"],
  ["청국장","청국장 (unchanged name)","moved to 곡류"],
],[3000,3000,3360]));
C(spacer());
C(h2("16.3 The Historical-Fill Reviewed Map"));
C(p("scripts/fill-historical-ingredients.ts embeds two mappings that resolve a food item name to its level2 ingredient list:"));
C(
  bullet("ITEM_MAP — the original 357 common items"),
  bullet("REVIEWED_MAP — 1,156 human-verified entries built over six review batches, merged on top of ITEM_MAP (reviewed entries take precedence)"),
  bullet("bestGuess() — a substring fallback for any item in neither map; genuinely unknown items become [\"Not Defined\"]"),
);
C(p("Together these cover 1,292 distinct food item names. The review process (six batches) corrected systematic substring-matcher traps — for example: 스테이크 defaulting to 소고기 (fixed for 양고기/생선/돼지 variants); 수육 defaulting to 돼지고기 (fixed for 아귀수육/복수육 → 생선); 차돌 dishes needing 소고기; (국만)/(국물) dishes being broth-only; explicit 밥 requiring 쌀; 라면 requiring 밀; 당면 being 전분 not 밀."));
C(note("Note: To extend coverage, run the script with --export-worklist to produce a TSV of distinct unmapped items with frequency and a suggested level2, fill in the final_level2 column, and fold the reviewed entries back into REVIEWED_MAP."));
C(h2("16.4 Reconciliation Result (v3.1)"));
C(p("After cleaning legacy parentheses, re-migrating, filling ingredients, and dropping in new-notation data, the food-row reconciliation reached full agreement:"));
C(table(["Metric","Value"],[
  ["Source food rows (all sheets)","6,154"],
  ["Expected documents with foods","6,154"],
  ["Actual MongoDB documents with foods","6,154"],
  ["Unexplained gap","0 (fully reconciled)"],
  ["Food items total","15,375"],
  ["Items with ingredients","15,375"],
  ["Items = \"Not Defined\"","0"],
],[4000,5360]));
C(spacer());

// ===== FOOTER =====
C(new Paragraph({ children: [new TextRun({ text: "FarGaze Log — Data Design & Requirements v3.6 — 25 June 2026", italics: true })], spacing: { before: 240 }, alignment: AlignmentType.CENTER }));

// ===== DOCUMENT ASSEMBLY =====
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 140, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 280 } } } },
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
      ]},
    ],
  },
  sections: [{ properties: { page: PAGE }, children }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("FarGaze-Log-Data-Design-v3.6.docx", buffer);
  console.log("Wrote FarGaze-Log-Data-Design-v3.6.docx (" + buffer.length + " bytes), " + children.length + " elements");
});
