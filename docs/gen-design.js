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
  new Paragraph({ children: [new TextRun({ text: "Version 4.5  |  7 August 2026  |  Hyoje / Claude", size: 24 })], spacing: { after: 240 } }),
);
C(p([new TextRun({ text: "Structure: ", bold: true }), new TextRun("Part I Foundations · Part II Data · Part III Features · Part IV Operations · Appendices. The body is the complete, always-current source of truth; the changelog below carries one line per version. Work status, open questions and the backlog live in the separate WBS, not here.")]));

// ===== VERSION HISTORY =====
C(h1("Version History"));
C(table(
  ["Version", "Date", "Headline"],
  [
    ["1.0","25 Apr 2026","Initial data design & requirements"],
    ["1.1","25 Apr 2026","Exercise → array; incremental sync; dedup key"],
    ["1.2","28 Apr 2026","Migration scope → archive-only; dedup → delete + re-insert"],
    ["1.3","29 Apr 2026","Phase 4 start; duration.totalSeconds; Atlas Search index"],
    ["1.4","30 Apr 2026","Schema implemented; dead-file cleanup"],
    ["1.5","30 Apr 2026","Atlas autocomplete dual-mapping; regex fallback"],
    ["1.6","30 Apr 2026","Auth & three-layer security model"],
    ["1.7","1 May 2026","Cost analysis dashboard specified"],
    ["1.8","2 May 2026","Spending dashboard; userId from session; handover added"],
    ["2.0","17 May 2026","Insights framework & first widgets (#53, #56)"],
    ["2.7","20 May 2026","Drinking widget started; alcohol_conversion; 6am threshold"],
    ["2.8","21 May 2026","Drinking widget complete; CSS BoxPlot / Histogram"],
    ["2.9","22 May 2026","Drinking Trend (8 tabs); CSS chart suite"],
    ["3.0","29 May 2026","food.spiciness field added"],
    ["3.1","4 Jun 2026","Food ingredient taxonomy; daily routine & master-table procedures"],
    ["3.2","5 Jun 2026","Drink ingredient taxonomy"],
    ["3.3","12 Jun 2026","Diet widget Summary; categoryColors palette"],
    ["3.4","14 Jun 2026","Insights API split into per-widget compute modules"],
    ["3.5","20 Jun 2026","Diet widget Trend; CssRankFlowChart; unified Relation/People naming"],
    ["3.6","25 Jun 2026","Insights polish pass; bars.tsx; search per-field phrase + sortable columns"],
    ["4.0","27 Jun 2026","Full restructure into Parts I–IV; durable spec separated from status; Transformation merged into a single transitional Migration section (Field Mapping · Strategy · History) with durable derivations moved to the Schema; uniform widget template; search ingredient display and per-tab Trend Method filter captured"],
  ["4.1","18 Jul 2026","Weight widget Summary (#54) — new \u00a79.3.5; bodyFatPercent corrected to a stored percent (was documented as a decimal) in \u00a75.2 and \u00a710.1.4; non-compact CssVerticalBoxPlotChart now prints max/avg/min values on the last bucket instead of the name legend, tooltip gained P75/P25"],
  ["4.2","19 Jul 2026","Weight widget Trend completes #54 — \u00a79.3.5 Trend written; new metric=weight.trend (granularity × buckets × optional end) in \u00a79.2; new shared CssStackedAreaChart and Segmented components; weight-colors.ts extracted; gridline inPlot guard applied across all four CSS charts; x-label thinning changed to a fixed stride walked back from the newest bucket"],
  ["4.3","26 Jul 2026","Exercise source columns BU (\ubd80\ud558) and BV (\ubc29\uc2dd) inserted \u2014 exercise[].loadKg and exercise[].setStyle added in \u00a75.2 and \u00a77.4; \u00a710.1.5 column layout rewritten, total columns 84 \u2192 86 and migration fetch range A:CG \u2192 A:CI; new \u00a713 documents the Google Calendar sync Apps Script, whose write targets moved to CG/CH"],
  ["4.4","29 Jul 2026","Exercise widget (WBS #58) shipped \u2014 new \u00a79.3.6, src/lib/insights/exercise.ts and ExerciseWidget.tsx; ModalShell extracted from DietWidget to \u00a7_components; emphasizeLast prop added to CssVerticalBoxPlotChart; \u00a75.2 setStyle CORRECTED \u2014 \ucd1d marks a day total with an unknown set split, not a rest-pause set; \uacc4\ub2e8 \uc624\ub974\uae30 \ucda9 records converted to \ubd84 so every item now carries exactly one unit"],
  ["4.5","7 Aug 2026","Exercise Trend view completes the widget \u2014 \u00a79.3.6 Trend written; new metric=exercise.trend and exercise.itemTrend (Weight-style grain \u00d7 buckets window) in src/lib/insights/exercise-trend.ts; new ExerciseTrendView.tsx and the Summary/Trend toggle in ExerciseWidget; CssTrendChart extended \u2014 optional right-axis series (the load line, resolving the v4.4 deferral), band-centred x positions, label thinning, hideable point values, uncompressed labels, a two-line hover tooltip, tiled hover zones and index keys"],
  ],
  [1100, 1300, 6960]
));
C(spacer());

C(new Paragraph({ children: [new TextRun({ text: "Part I · Foundations", bold: true, size: 28 })], spacing: { before: 280, after: 140 } }));

// ===== 1. OVERVIEW & GOALS =====
C(h1("1. Overview & Goals"));
C(p("This document is the durable specification for FarGaze Log — a personal life-analytics platform built on ~7 years of daily logs. It describes what the system is: source data, schema, transformation rules, supporting collections, search, the dashboards, and the operational procedures. It deliberately excludes work status and open questions, which live in the WBS."));

C(h2("1.1 Source Data Summary"));
C(
  bullet("~43,000 rows, 86 columns of daily life activity data (86 from v4.3 after columns BU/BV insertion; 84 from v3.1; was 83 in v3.0 after column AO insertion — no new source column was added for ingredients, which are embedded in the existing food item column via parenthesis notation)"),
  bullet("~7 years of continuous logging by Hyoje"),
  bullet("Maintained in two Google Sheets files across five data sheets"),
  bullet("Supporting master data in five additional sheets (Ingredient sheet added v3.1)"),
);

C(h2("1.2 Data Summary"));
C(table(["Item","Value"],[
  ["Total log documents","~43,123 (41,326 from ~2025, 1,797 from 2026)"],
  ["Documents with foods","6,154"],
  ["Food items total","15,375 — all with ingredients populated, 0 Not Defined (v3.1)"],
  ["Documents with drinks","~5,006"],
  ["Drink items total","~5,462 — all with ingredients populated, 0 Not Defined (v3.2)"],
  ["Documents with exercise","1,214 — one exercise item per document"],
  ["Exercise days","613 distinct days; 282 of them hold two or more records"],
  ["Exercise vocabulary","12 distinct items across 5 units (개, 층, km, 분, 초) — the units are not comparable to each other"],
  ["Date range","2018 to present"],
  ["Cost categories","22 clean categories (see Section 8.2)"],
  ["Ingredient taxonomy","73 level2 values across 16 level1 groups (ingredient_master) — food + drinks"],
  ["Primary currency","KRW — cost.amountKRW always populated; foreign amounts also stored"],
  ["User","userId = hyoje"],
  ["Atlas Search index","log_search — autocomplete + text dual-mapping on all text fields"],
],[3000,6360]));
C(spacer());

// ===== 2. ARCHITECTURE & STACK =====
C(h1("2. Architecture & Stack"));
C(p("How the system is built and deployed. The data model itself is covered in Part II."));

C(h2("2.1 Target Database"));
C(
  bullet("Database: MongoDB Atlas (M0 free tier, AWS Europe Ireland)"),
  bullet("Cluster: fargaze-log"),
  bullet("Architecture: user-isolated collections — each user manages their own schema"),
);


C(h2("2.2 Repository & Deployment"));
C(table(["Item","Value"],[
  ["GitHub repo","nullpitch-dev/fargaze-log"],
  ["Production URL","https://log.fargaze.co"],
  ["Local dev","~/projects/fargaze-log on WSL2 (Ubuntu)"],
  ["Deployment","Vercel — auto-deploys from main branch"],
  ["Node version","24.x (Vercel runtime)"],
],[2600,6760]));
C(spacer());

C(h2("2.3 Tech Stack"));
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

C(h2("2.4 Environment Variables"));
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

C(h1("3. Authentication & Access Control"));
C(h2("3.1 Overview"));
C(p("FarGaze Log uses Google OAuth via NextAuth (Auth.js v5) for authentication. Access is restricted to explicitly whitelisted Google accounts mapped to internal userIds."));
C(h2("3.2 Google Account to userId Mapping"));
C(p("The mapping from Google email to internal userId is maintained in src/auth.ts as a static lookup table (EMAIL_TO_USER_ID). The actual email values are stored in environment variables, not hardcoded in source. On first sign-in, the jwt callback receives the Google user object, looks up the email in EMAIL_TO_USER_ID, and stores the resulting userId in the JWT token cookie. On all subsequent requests, userId is read directly from the token."));
C(table(
  ["Environment Variable", "Value", "Maps to userId"],
  [["GOOGLE_OWNER_EMAIL", "hyoje.choi@gmail.com", "hyoje"]],
  [3120, 3120, 3120]
));
C(spacer());
C(h2("3.3 Three-Layer Security Model"));
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
C(h2("3.4 Access for Other Users (Current)"));
C(
  bullet("Add their Google email and a new userId to EMAIL_TO_USER_ID in src/auth.ts"),
  bullet("Add GOOGLE_USER2_EMAIL (or similar) to environment variables on Vercel and in .env.local"),
  bullet("Ensure their data in MongoDB uses their userId as the owner field"),
);
C(h2("3.5 Multi-User Roadmap (Phase 5)"));
C(
  bullet("A users collection in MongoDB will store Google email → userId mappings"),
  bullet("The EMAIL_TO_USER_ID lookup in auth.ts will be replaced by a database query"),
  bullet("User onboarding and access management will be handled through a UI"),
  bullet("No code changes will be required to grant or revoke access"),
);


C(new Paragraph({ children: [new TextRun({ text: "Part II · Data", bold: true, size: 28 })], spacing: { before: 280, after: 140 } }));

C(h1("4. Source Data & Entry Types"));
C(h2("4.1 File 1: Active_2026Mar05"));
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
C(h2("4.2 File 2: Full Archive_2026Mar06"));
C(table(
  ["Sheet", "Purpose", "Entry Types"],
  [
    ["2026","Current year archive — entries moved from Active when older than 7 days","Completed entries"],
    ["~2025","Full historical archive — all prior years","Completed entries"],
  ],
  [1700, 4400, 3260]
));
C(spacer());
C(h2("4.3 Data Flow"));
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


C(h2("4.4 Entry Types by Sheet"));
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
C(h2("4.5 Multi-day & Midnight-spanning Entries"));
C(p("Entries that span midnight or multiple days are fully supported. Since start date and end date are stored as separate fields, the datetime computation naturally handles all cases. No special logic is required — compute start.datetime and end.datetime independently from their respective date/time fields."));
C(h2("4.6 Dynamic State Computation"));
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
C(h2("4.7 The allDay Flag"));
C(p("One static flag is stored: allDay (Boolean). Set to true when both start and end hour fields are empty, indicating a full-day event with no specific time."));
C(h2("4.8 Rows to Skip During Migration"));
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
  ["duration.totalSeconds","Number","start + end + offsets","Computed from UTC-normalised timestamps. null for single all-day events or missing end. See Section 5.3 for formula."],
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
  ["body.bodyFatPercent","Number","체지방률","Stored as a PERCENT (21.265 = 21.3%), not a decimal. Verified against live data v4.1 — earlier versions of this document stated 0.207 = 20.7%, which was wrong."],
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
  ["exercise[].unit","String","운동단위","Unit. From v4.4 every item carries exactly one unit: 계단 오르기 was logged in both 층 and 분 and the 층 records were converted to 분. See §9.3.6 for the travel-time caveat on back-filled 분 amounts."],
  ["exercise[].loadKg","Number","부하","(v4.3) Weight lifted, in kg. Blank for bodyweight exercises. Repeated across plus-split items, not divided like amount."],
  ["exercise[].setStyle","String","방식","(v4.3; meaning CORRECTED v4.4) Blank means one unbroken set. 총 marks a DAY TOTAL whose set breakdown is unknown — back-filled onto older records where the day's figure survives but the per-set split does not. It is NOT a rest-pause set. Verified distinct values across the whole collection: null (1,159) and 총 (51). Repeated across plus-split items."],
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



// ===== 5.3 DERIVED FIELDS =====
C(h2("5.3 Derived Fields"));
C(p("A few fields are never entered directly — they are derived from other stored fields and stay valid regardless of how an entry was created (sheet migration today, native data entry in Phase 5). Entry state (Section 4.6) and the allDay flag (Section 4.7) are derived in the same spirit."));
C(bold("duration.totalSeconds"));
C(p("Computed from the start and end timestamps; the source sheet's d/h/m/s columns are never stored."));
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
C(note("timezoneOffset is stored per entry (read from the 시차 source column during migration); no separate timezone-master lookup is required."));

C(h1("6. Supporting Collections"));
C(h2("6.1 cost_master"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["category","String","Top-level cost category"],
  ["detail","String","Detailed sub-category"],
],[2400,2000,4960]));
C(spacer());
C(h2("6.2 activity_master"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["name","String","Activity name"],
  ["category","String","Activity category"],
],[2400,2000,4960]));
C(note("Note: Unique index on userId + name + category. Same name can exist in different categories."));
C(h2("6.3 reference_lists"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["listName","String","Reference list identifier (e.g. activity.crossActivity, food.alcohols.item)"],
  ["values","String[]","Array of allowed values"],
],[2400,2000,4960]));
C(spacer());
C(h2("6.4 timezone_master"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["code","String","Timezone abbreviation (e.g. KST, BST, GMT)"],
  ["offsetUTC","Number","UTC offset in hours (e.g. 9 for KST, 1 for BST)"],
  ["ianaTimezone","String","IANA timezone name (e.g. Asia/Seoul)"],
  ["city","String","Representative city"],
],[2400,2000,4960]));
C(spacer());
C(h2("6.5 exchange_rate"));
C(table(["Field","Type","Notes"],[
  ["userId","String","Owner"],
  ["currency","String","Currency code (e.g. GBP, USD)"],
  ["rateToKRW","Number","Exchange rate to Korean won"],
],[2400,2000,4960]));
C(spacer());
C(h2("6.6 alcohol_conversion (added v2.7)"));
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
C(h2("6.7 ingredient_master"));
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



C(h1("7. Search — Index, API & UI"));
C(h2("7.1 Overview"));
C(p("MongoDB Atlas Search (Lucene-based) is used for full-text keyword search across all relevant log fields. A single search index named log_search is defined on the log collection."));
C(p("Search behaviour:"));
C(
  bullet("Atlas Search runs first — fast, relevance-ranked results"),
  bullet("If Atlas Search returns zero results, a MongoDB regex fallback runs automatically across the same fields"),
  bullet("The API response includes a searchMode field: \"atlas\" or \"regex\""),
  bullet("The UI shows a \"포함 검색\" label when the regex fallback is active"),
);
C(h2("7.2 Korean Tokenisation — Known Limitation"));
C(p("Atlas Search uses edge n-gram tokenisation for autocomplete fields, which indexes from the start of each token. \"삼성\" matches \"삼성모바일스토어\" (prefix match) but \"모바일\" does NOT match \"삼성모바일스토어\" (mid-word). The regex fallback handles mid-word cases. Full n-gram tokenisation was deferred due to M0 free tier index size limits."));
C(h2("7.3 Index Definition"));
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
C(h2("7.4 Numeric Fields for Aggregation"));
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
  ["exercise[].loadKg","Number","(v4.3) Weight lifted in kg — supports load filtering and progressive-overload analysis per item"],
],[2800,1600,4960]));
C(spacer());
C(h2("7.5 Search API — GET /api/search"));
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
C(h2("7.6 Search UI — Result Table Sorting"));
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


// ===== 8.7 SEARCH UI — RESULT DETAIL PANEL =====
C(h2("7.7 Search UI — Result Detail Panel"));
C(p("Selecting a result opens a detail panel (DetailPanel in src/app/search/page.tsx) listing the entry's fields. Food and drink items render their ingredients inline, in parentheses, between the item name and its amount — e.g. 밀크커피 (커피, 우유) 1잔 and 샌드위치 (밀, 가공육, 버터, 치즈, 잎채소) 1 인분. The ingredients come straight from food.foods[].ingredients / food.drinks[].ingredients (the level2 values); the parenthetical is omitted when the array is empty or absent, so alcohols and ingredient-less items are unaffected. The Atlas projection and the regex .select() are both exclusion-only, so these arrays reach the client without an API change."));


C(new Paragraph({ children: [new TextRun({ text: "Part III · Features", bold: true, size: 28 })], spacing: { before: 280, after: 140 } }));


C(h1("8. Cost Analysis Dashboard"));
C(h2("8.1 Overview"));
C(p("The cost analysis dashboard provides a pivot-table view of spending by category and categoryDetail across a selected time period. It supports drill-down to raw transactions and layout customisation."));
C(h2("8.2 Cost Category Structure"));
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
C(h2("8.3 Filters"));
C(
  bullet("Date range — from/to date pickers; default is last 12 months"),
  bullet("Category — multi-select to show/hide specific categories"),
  bullet("Category detail — multi-select filtered by selected categories"),
  bullet("Purchase item — free text search against purchase[].item field"),
);
C(h2("8.4 Pivot Table Structure"));
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
C(h2("8.5 Drill-Down Sidebar"));
C(p("Clicking any cell opens a slide-in sidebar showing the raw transactions for that category + categoryDetail + month combination. Each transaction row shows: start date, activity name, title, purchase items, cost KRW. Clicking a transaction row opens a full record modal showing all non-null fields grouped by section."));
C(h2("8.6 API Design"));
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
C(h2("8.7 Currency Handling"));
C(p("All amounts in the pivot table use cost.amountKRW exclusively. For descriptive analysis of foreign currency spending (especially GBP after January 2026), cost.amountForeign and cost.currency are available in the drill-down transaction detail view."));
C(h2("8.8 Layout Persistence"));
C(p("The following layout preferences are saved to localStorage under the key \"fargaze-cost-layout\": category row order, detail row order per category, collapsed/expanded state per category."));
C(note("Note: localStorage is used for simplicity in Phase 4. In a future phase this may be migrated to a user preferences collection in MongoDB for cross-device persistence."));




C(h1("9. Insights Dashboard"));
C(h2("9.1 Overview"));
C(p("The Insights dashboard provides widget-based analytics across multiple subject domains. Each widget is self-contained and uses a shared global filter bar for time range and cross-activity filtering."));

C(h2("9.2 Platform"));
C(p("Shared, widget-agnostic machinery — written once and reused by every widget. This tier grows rarely; new widgets live in Section 9.3."));

C(h3("9.2.1 Widget Framework"));
C(
  bullet("Two-dimensional framework: horizontal axis = subject domain; vertical axis = analytical floor (0→4, increasing depth)"),
  bullet("All widgets share: WidgetCard shell, global filter, Summary/Trend mode toggle"),
  bullet("Page layout: CSS columns (columns-1 md:columns-2 lg:columns-3) — masonry-style packing, no empty gaps under shorter widgets"),
);

C(h3("9.2.2 Colour System"));
C(
  bullet("Chart colour system: useIsDark() hook + chartColors(isDark); light: blue-700/stone; dark: teal-400/zinc"),
  bullet("Categorical palette (v3.3): CATEGORY_COLORS_LIGHT/DARK + categoryColors(isDark) — indexed, taxonomy-agnostic colours for grouped charts (treemaps, relationship bars); light = darker fills with white text, dark = lighter fills with near-black text; assigned by index over the groups present in the data, never keyed on domain values"),
  bullet("Summary-bar palette (v3.6): BAR_COLORS_LIGHT/DARK + barColors(isDark) + autoColorMap(keys, isDark) in chart-colors.ts — a dedicated palette for the shared summary bars (bars.tsx), kept deliberately separate from categoryColors and rankFlowColors; omitting a colorMap auto-assigns colours by first-seen key order"),
  bullet("Spline tension for trend charts: 0.2 (confirmed optimal)"),
);

C(h3("9.2.3 Shared Chart Components"));
C(table(["Component","File","Description"],[
  ["bars.tsx (Title / BarRow / BarSection)","src/app/insights/_components/charts/bars.tsx","(v3.6) Shared summary-bar primitives. BarSection { title, data: Record<string,number>, colorMap?, isDark } sorts desc and draws max-normalised bars (longest = full) with a {pct}% ({count}) value column; omit colorMap → auto-assign via autoColorMap. Geometry h-1.5 rounded-full; typography text-[11px], label stone-600/zinc-300, value stone-500/zinc-400. Shared by the Diet, Drinking and Interactions summaries (Interactions' PeopleBars is composed from these primitives)"],
  ["BoxPlot","src/app/insights/_components/charts/BoxPlot.tsx","CSS horizontal box plot; pr-5 right padding; label width w-10"],
  ["Histogram","src/app/insights/_components/charts/Histogram.tsx","CSS bar chart histogram; fixed font sizes"],
  ["CssTrendChart","src/app/insights/_components/charts/css-chart-components.tsx","CSS+SVG line chart with Catmull-Rom spline; multi-series; week label compression. Extended v4.5, every addition off by default so older call sites render unchanged: rightSeries + formatYRight draw ONE extra series dashed with hollow dots against its own right-hand axis in the series colour (the Exercise load line); xBand centres points over n equal cells instead of spanning edge-to-edge, so the chart can align with a cell grid below it; maxXLabels thins x labels on a fixed stride walked back from the newest bucket; showValues=false hides the printed point values on dense windows; compressXLabels=false prints every label whole, because year-compression breaks once labels are thinned \u2014 the label carrying the year can be a thinned one. The hovered point shows a two-line tooltip (value over bucket name) on a translucent backdrop, always above the dot, with the whole hovered column lifted over its neighbours; hover zones are one bucket wide so they tile instead of overlapping; columns are keyed by index because labels can transiently duplicate for one frame when a parent switches grain before its refetch lands"],
  ["CssVerticalBoxPlotChart","src/app/insights/_components/charts/css-chart-components.tsx","Vertical box plots per bucket; hover tooltip (max/P75/avg/P25/min, v4.1); props: formatY, height, and compact (v3.4). Default keeps the y-axis and, since v4.1, prints max/avg/min VALUES centred on the last bucket — the Max/P75/Avg/P25/Min name legend was removed. compact hides the y-axis and prints the same three values, so several boxes fit one row. P75/P25 live in the tooltip in both modes, because printed on the chart they would fall inside the IQR box. emphasizeLast (v4.4) defaults true and bolds the final bucket label \u2014 correct when buckets are periods and the last one is the newest, meaningless when they are categories, so the Exercise widget passes false"],
  ["CssDualLineChart","src/app/insights/_components/charts/css-chart-components.tsx","Dual line chart (From/To); shared HH:MM Y-axis; filled area; dashed arrows with duration; +HH:MM for post-midnight"],
  ["inPlot(t) guard","src/app/insights/_components/charts/css-chart-components.tsx","(v4.2) Shared predicate, t >= 0 && t <= 100, applied at every gridline call site. buildYTicks pins the data max and can therefore return a tick above yMax; the y-axis labels always guarded against this but the gridlines did not, and because the plot containers are not clipped a negative top painted the line upward out of the chart and into the widget header. Applied to CssTrendChart, CssVerticalBoxPlotChart, CssStackedAreaChart and CssDailyChart"],
  ["CssRestChart","src/app/insights/_components/charts/css-chart-components.tsx","Stacked histogram bars + avg spline overlay; unified SVG coordinate space; PLOT_T/PLOT_B bounds"],
  ["CssDailyChart","src/app/insights/_components/charts/css-chart-components.tsx","(v3.3) Single daily-series line; optional dashed average line + zone bands; tooltip floats above the marker showing value + date; baselineZero option"],
  ["CssStackedAreaChart","src/app/insights/_components/charts/css-chart-components.tsx","(v4.2) Stacked area with a continuous total line. A point is {label, total, segments?, meta?} and may carry a total with NO segments, in which case the line runs across it and the coloured fill starts later; nulls break the line rather than interpolating across a gap. Props: segmentDefs (bottom to top), mode 'absolute' | 'percent', baselineZero, formatY, height, maxXLabels. Percent mode normalises each stack to 100 and hides the total line. Bands are clipped to the plot box; a lone point renders as a narrow column so a single-bucket run does not vanish. Nothing in it is weight-specific"],
  ["Segmented","src/app/insights/_components/Segmented.tsx","(v4.2) Shared multi-state toggle, generic over string | number so numeric option sets (bucket counts) work alongside string ones. Extracted from DietWidget when WeightTrendView needed the same control. ViewToggle in WidgetCard remains the dedicated Summary/Trend switch"],
  ["ModalShell","src/app/insights/_components/ModalShell.tsx","(v4.4) Shared centred modal rendered through a React portal on document.body, so it escapes widget-card overflow:hidden. Backdrop click and \u00d7 both close; clicks inside the panel do not bubble. Extracted from DietWidget when ExerciseWidget needed the same shell \u2014 the same trigger that lifted Segmented out at v4.2"],
  ["Treemap","src/app/insights/_components/charts/Treemap.tsx","(v3.3) Squarified treemap; CSS-positioned cells measured via ResizeObserver; top-N cap with a neutral 기타 (+N) rollup; per-mode cell text"],
  ["CalendarHeatmap / HeatStrip","src/app/insights/_components/charts/CalendarHeatmap.tsx","(v3.3) Mon–Sun calendar grid (modal) + single-row day strip (inline); range expanded to whole weeks; out-of-range days dimmed; colour via fillFor(date)"],
  ["StackedBars","src/app/insights/_components/charts/StackedBars.tsx","(v3.5) Reusable stacked bars; percent or absolute mode; legend hover-highlight dims the other series; shared by the Diet Composition / Spicy / Relation tabs"],
  ["CssRankFlowChart","src/app/insights/_components/charts/CssRankFlowChart.tsx","(v3.5) CSS-only ranked-flow ('top-N over time'): colour-tiles ranked top→bottom per bucket, a dashed reference line, and a grey block listing people who dropped out of the previous bucket's top-N. Per-person colour (rankFlowColors, first-seen order); hover-to-trace highlights one person across all buckets and shows per-bucket counts; blur-names privacy toggle; luminance-adaptive tile text; optional controls slot for a filter. No SVG. Used by Diet, Drinking, and Interactions"],
  ["MultiSelectDropdown","src/app/insights/_components/MultiSelectDropdown.tsx","Generic multi-select with Select-all / Deselect-all; onChange(draft) / onClose(commit). Rebuilt v3.5 to render its panel through a React portal on document.body with fixed positioning, so it escapes widget-card overflow:hidden; edge-aware (flips up, clamps horizontally, caps height with scroll) and re-measures on selection change, scroll, and resize"],
],[2200,3400,3760]));
C(spacer());
C(note("Note: BoxPlot and Histogram use CSS/HTML exclusively (no SVG). CSS chart components use CSS for layout/dots/labels and thin SVG overlay only for curved line paths."));

C(h3("9.2.4 CSS Chart Architecture"));
C(
  bullet("Bars, dots, labels, axes: CSS/HTML divs with pixel or percentage positioning"),
  bullet("Curved lines: SVG with fixed pixel viewBox (e.g. \"0 0 500 160\") to avoid coordinate mismatch with CSS"),
  bullet("Week label compression: compressWeekLabels() — first bucket shows YYWww, subsequent show Www; year change resets to YYWww"),
  bullet("Y-axis overflow prevention: labels clamped (skip if outside plot bounds); Y-axis containers are overflow-hidden"),
  bullet("CssRestChart: both axes use shared PLOT_T=12px / PLOT_B=REST_H-4px bounds; bars pre-calculated via for-loop"),
  bullet("ISO week: stepBack() and currentPeriod() both use Jan-4-based ISO week calculation"),
);

C(h2("9.3 Widgets"));
C(p("One sub-section per widget, each on the same template: Purpose · API / data shape · Summary · Trend · Filters · Notes. Slots that don't apply are omitted. Adding a widget means filling the same slots — the platform tier above does not change."));

// ── 9.3.1 Sleep ──────────────────────────────────────────────────────────────
C(h3("9.3.1 Sleep (WBS #53)"));
C(bold("Purpose")); C(p("Sleep duration and quality analytics."));
C(bold("Summary"));
C(
  bullet("Summary view: avg duration, bedtime, wake time, sleep quality counts and score"),
);
C(bold("Trend"));
C(
  bullet("Trend view: 4 metric tabs — Duration, Bedtime, Wake Time, Quality Score"),
);

// ── 9.3.2 Interactions ───────────────────────────────────────────────────────
C(h3("9.3.2 Interactions (WBS #56)"));
C(bold("Purpose")); C(p("Who you spend time with, by relation type and contact method, and how that changes over time."));
C(bold("API / data shape")); C(p("computeInteractionsSummary and computeInteractionsTrendBucket in src/lib/insights/interactions.ts. Each people group carries one method + one category (relation type) and a target list; trend buckets expose totalCount, uniquePeopleCount, byRelationType, byMethod and top7."));
C(bold("Summary"));
C(
  bullet("Summary view (restructured v3.6 — no tabs): Row 1 is an always-on two-column stats grid — left column interactions (Relation Type + Method bars), right column unique people (Relation Type + Method bars). Row 2 is a full-width PeopleBars block showing the top 10 individuals split ranks 1–5 (left) / 6–10 (right), jointly normalised against one shared max across all 10, each bar coloured by that person's dominant relation type. The old Stats/Top 10 tabs, TopPeopleTable, the summaryTab state and the SummaryTab type were removed; PeopleBars is composed locally from the shared bars.tsx primitives (Title / BarRow / BarSection)"),
);
C(bold("Trend"));
C(
  bullet("Trend view: 5 metric tabs — Interactions, Unique, Relation, Method (stacked bar), People (CssRankFlowChart, v3.5)"),
);
C(bold("Filters"));
C(
  bullet("Widget-local filters: Relation + Method multi-select with AND logic; commit-on-close pattern with a server-side re-fetch (the People rank-flow is filtered on the server, unlike Diet/Drinking which filter client-side)"),
);
C(p("The Interactions widget carries a Method filter that is recomputed server-side (a missing param means \"all methods\", so the default view is unchanged). The Summary and the Trend tabs each own an independent selection — switching tabs preserves each separately."));
C(bold("Method filter — in Summary"));
C(p("One Method control sits between the header line and the contents. Selecting a subset re-scopes the headline interactions count (events containing a selected-method group), the Relation Type bars, unique people, and the People bars. The left Method bars stay full as the filter's stable reference list."));
C(bold("Method filter — in Trend"));
C(
  bullet("Interactions / Unique / Relation tabs: each shows its own Method dropdown (above the chart) and filters that tab's metric only — interactionsMethod, uniqueMethod and relationMethod are passed to computeInteractionsTrendBucket as separate per-metric filters."),
  bullet("Method tab: unfiltered — it is the full reference breakdown."),
  bullet("People tab: unchanged — keeps its own Relation + Method controls inside the rank-flow chart."),
);
C(note("Counts that depend on uniqueness (unique people) are recomputed on the server, never derived by subtracting method marginals."));

// ── 9.3.3 Drinking ───────────────────────────────────────────────────────────
C(h3("9.3.3 Drinking (WBS #57)"));
C(bold("Purpose")); C(p("Alcohol consumption: how much, how often, with whom and on what occasions, plus rest-day and session patterns."));
C(bold("API / data shape"));
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
C(bold("Summary"));
C(
  bullet("Summary view (restructured v3.6 — no tabs; every block always-on). The Drinking Days + Total Drinks counters, Drinks-Per-Day box plot, Consecutive Rest Days histogram and Session Time rows are unchanged; only the proportional-bar block and the old Top 10 tab were reworked:"),
  bullet("Row 1 (35%:65%): [Drinking Days + Total Drinks stacked] | [Drinks Per Day box plot]", 1),
  bullet("Row 2 — bar block reorganised into two columns: left [Drink Type / Occasion], right [Relation / People]. \"With Whom\" was renamed Relation; the old Top 10 tab is folded in here as People bars, each person coloured by their dominant relation type", 1),
  bullet("Row 3 (65%:35%): [Consecutive Rest Days histogram] | [Session Time — From / To / For]", 1),
  bullet("All four bar charts use the shared bars.tsx primitives + barColors palette (v3.6); the Stats/Top 10 tab toggle was removed", 1),
);
C(bold("Trend"));
C(
  bullet("Trend view — 9 metric tabs: Freq, Amt(all), Amt(day), Type, Occasion, Relation, People, Rest, Session — where Relation is the relation-type stack (formerly labelled People) and People (v3.5) is a CssRankFlowChart of the top-7 companions with a client-side Relation filter"),
);
C(bold("Filters"));
C(p("The Trend People rank-flow carries a client-side Relation multi-select that re-ranks the top-7 from the per-bucket people map (commit on close)."));

// ── 9.3.4 Diet ───────────────────────────────────────────────────────────────
C(h3("9.3.4 Diet (WBS #61)"));
C(bold("Purpose")); C(p("Eating and drinking patterns: timing (eating / caffeine cutoff), quantity (인분, carbs), spiciness, ingredient/item composition, and companions."));
C(bold("API / data shape"));
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
C(p("The summary deliberately shows the distribution of daily values (box plots, with the full daily line one tap away in a modal) rather than a period trend — the average is the headline statistic. The Trend view (complete as of v3.5) rolls these same metrics into weekly/monthly buckets per the global filter; its eight tabs appear under this widget's Trend view below."));
C(bold("Trend Mode API — diet.summary (NEW v3.5)"));
C(p("mode=trend returns one object per bucket: label, daysInPeriod, the four box-plot arrays (eatingCutoff, caffeineCutoff, servings, carbs), the composition maps (ateIng, ateItems, drankIng, drankItems), spicy {H,M,L}, relation (Record<string,number>, behind the Relation tab), and people (Record<string, Record<string,number>>). people is the per-person, per-relation-type companion breakdown that the People rank-flow tab filters and re-ranks client-side; it is built from the same personMap category counts the summary uses for topPeople, so the 아침 exception and the food-or-drink scope apply identically."));
C(bold("Summary"));
C(
  bullet("Summary view is distribution-oriented (not a trend): four compact vertical box plots in one row — EATING CUTOFF, CAFFEINE CUTOFF, SERVINGS (인분), CARBS — each tappable to open a modal with the full daily line (CssDailyChart); the 인분 line carries green/light-blue/red zone bands (<3 소식 / 3–6 적당 / >6 과식)"),
  bullet("CAFFEINE CUTOFF = the latest time each day a caffeinated drink (ingredient 커피 or 카페인) was finished — computed in the same pass as the drink treemaps, so it counts coffee taken without any food", 1),
  bullet("Compact box plots drop the y-axis and the Max/P75/Avg/P25/Min name legend, printing value labels at max / avg / min instead, so four boxes fit a single row", 1),
  bullet("Spicy days: an inline single-row HeatStrip (one cell per day) with a summary count (e.g. \"0 H and 4 M out of 31 days\"), tappable to open the Mon–Sun CalendarHeatmap modal", 1),
  bullet("Treemaps shown one at a time via two toggles — Food/Drink × Ingredients/Items; ingredient cells coloured by level1 group (categoryColors), item cells by a single accent; top-N cap with a 기타 rollup; cell-label font capped at 11px", 1),
  bullet("With whom I eat: toggle between relationship bars (혼자 + categories) and a top-companions list", 1),
  bullet("Uppercase, centred section titles; compact layout (four-box row, single-treemap toggles) tuned to keep the widget near a single widget's height"),
);
C(bold("Trend"));
C(
  bullet("Eating · Caffeine · Servings · Carbs — four box-plot-per-bucket tabs, each rendering CssVerticalBoxPlotChart (non-compact) across the weekly/monthly buckets"),
  bullet("Composition · Spicy · Relation — three tabs built on the reusable StackedBars: Composition (Food/Drink × Ingredients/Items toggles; dynamic 30%-threshold 'others' rollup, capped at palette size), Spicy (absolute H/M/L day counts), Relation (relation-type mix, 100%; 혼자 neutral)"),
  bullet("People — a CssRankFlowChart of the top-7 companions over time, with a Relation multi-select that re-ranks client-side (each person summed over the selected relation types, zeros dropped, top-7 re-taken)"),
  bullet("Tab persistence: a trendLoadedRef in DietWidget keeps the view mounted across bucket-size changes so the active tab is not reset"),
);
C(note("Naming convention (unified v3.5) across the Diet, Drinking, and Interactions trend views: the relation-type 100% stacked tab is Relation; the top-7 individual rank-flow tab is People; the relation multi-select is the Relation filter. Diet and Drinking filter the rank-flow client-side from the per-bucket people map; Interactions filters server-side (committed on close, then re-fetch)."));
C(bold("Filters"));
C(p("The Trend People rank-flow carries a client-side Relation multi-select (re-ranks from the per-bucket people map)."));
C(bold("Notes"));
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

// ── 9.3.5 Weight ──────────────────────────────────────────
C(h3("9.3.5 Weight (WBS #54)"));

C(bold("Purpose"));
C(p("Body weight and composition: the distribution of daily weight across the filter period, the average make-up of that weight, and the most recent measurement — so that a stable weight number can be read against the composition changing underneath it."));

C(bold("API / data shape"));
C(p("computeWeightSummary(userId, periodStart, periodEnd, crossActivities) in src/lib/insights/weight.ts, dispatched as metric=weight.summary. Documents carrying body.weight are fetched with the standard $expr + $dateFromParts local-date filter, then collapsed to one record per calendar day by collapseToDays() — repeat readings on the same day are averaged, so a double weigh-in day does not count twice."));
C(p("computeWeightTrend(userId, granularity, buckets, end, crossActivities) is dispatched as metric=weight.trend and responds under the key trend, not summary. Its parameters are granularity (day | week | month), buckets (a count, clamped server-side at 400) and an optional end anchor \u2014 deliberately NOT the shared timeMode / timePeriod pair the other trend metrics use. Both functions share collapseToDays() and buildComposition(), so the two views can never disagree about what a day is worth."));
C(table(["Response field","Meaning"],[
  ["granularity","Echo of the requested bucket size"],
  ["rangeStart / rangeEnd","The resolved span actually returned, after leading-empty trimming. rangeEnd is the END of the last bucket and may legitimately fall in the future \u2014 the widget clamps the displayed value to today rather than making the API lie"],
  ["buckets[]","Oldest to newest. Each is {label, start, end, weight, n, composition}"],
  ["buckets[].weight","Average weight over EVERY day in the bucket; null when the bucket is empty"],
  ["buckets[].n","Days carrying a weight reading"],
  ["buckets[].composition","Composition & {n} averaged over full-triple days ONLY, so the segments always sum exactly to composition.weight; null when the bucket has no InBody day at all"],
],[2600, 6760]));
C(table(["Field","Description"],[
  ["weightBox","{min, max, avg, p25, p75, n} over per-day weight values — period scoped"],
  ["avgComposition","Composition + n — period scoped. When any day in the period carries a full triple the average is taken over those days ONLY, so the three segments always sum exactly to the bar total"],
  ["latest","Composition + date — the most recent measurement overall, NOT period scoped (see Notes)"],
  ["deltaFromAvg","{weight, muscleMass, bodyFat, bodyFatPercent} — latest minus average; the segment deltas are null unless both bars are segmented"],
  ["compositionMax","max(latest.weight, avgComposition.weight) — the shared scale that makes the two bar lengths comparable"],
],[2400,6960]));
C(spacer());
C(p("Composition is {weight, muscleMass, bodyFat, other, bodyFatPercent, musclePct, fatPct, otherPct, hasComposition}. When muscleMass or bodyFat is absent the object is still returned with hasComposition false and weight populated, so the widget always has a bar to draw rather than a hole."));

C(bold("Segment semantics (InBody Dial)"));
C(table(["Source field","Meaning"],[
  ["체중 — weight","Total body weight"],
  ["골격근량 — muscleMass","SKELETAL muscle only. Bone is NOT included — it falls into other. Labelling this segment plain \"Muscle\" would overstate it, since total muscle mass (근육량, which the Dial does not report) is higher"],
  ["체지방량 — bodyFat","Derived in the source sheet as weight × 체지방률, so it is never an independent measurement"],
  ["기타 — other","weight − muscleMass − bodyFat: organs, body water outside skeletal muscle, smooth and cardiac muscle, and bone mineral. Around 34% of body weight — a legitimate, large, fairly stable component, NOT a residual error bucket"],
],[2400,6960]));
C(spacer());

C(bold("Day boundary"));
C(p("Unlike the Drinking and Diet widgets, Weight does NOT apply the 6am assignDrinkingDate rule. Weigh-ins happen in the morning, so a 06:30 reading belongs to its own calendar day; rolling it back would attribute it to the day before."));

C(bold("Summary"));
C(
  bullet("Two columns. Left (25–35% width): WEIGHT (KG) — a single-bucket non-compact CssVerticalBoxPlotChart showing min / p25 / avg / p75 / max for the filter period, with the values printed on the last-bucket labels (v4.1) and P75/P25 available on hover"),
  bullet("Right: BODY COMPOSITION — one titled block holding two horizontal stacked bars, AVERAGE and LATEST (with its date and year), each bar length scaled against compositionMax and each segment carrying its kg and (%) inside"),
  bullet("Between the two bars sits a delta strip — weight and body-fat movement from the period average to the latest reading; a zero delta renders as an em dash rather than disappearing, so the row does not jump as the filter changes"),
  bullet("A single shared legend (Skeletal Muscle / Fat / Other) sits under both bars — the two rows were merged into one block specifically to avoid printing the same legend twice"),
  bullet("Pre-InBody ranges: both bars render as a single un-segmented weight bar labelled \"weight only\", and the legend is suppressed entirely"),
);

C(bold("Trend"));
C(p("One chart, not a set of tabs. The top of a stacked area IS total weight, so weight and composition are the same picture by construction and separating them would have drawn the same data twice. A three-state unit control switches what that one chart is answering:"));
C(table(["Mode","What it draws","Y-axis"],[
  ["Weight","Total line only, no fill \u2014 the default","Zoomed to the data (roughly 63\u201371)"],
  ["kg","Stacked area, muscle / fat / other, with the total line over it","Pinned to zero"],
  ["%","Stacked area normalised to 100, total line hidden","0\u2013100"],
],[1400, 5560, 2400]));
C(p("The kg mode must sit on a zero baseline. The internal stack boundaries fall at roughly 31 (muscle), 46 (+fat) and 70 (+other); a cropped 63\u201371 window pushes every one of them below the floor, leaving a single band covering the whole plot. Zero baseline fixes that but flattens seven years of movement into a near-straight line \u2014 which is exactly what the Weight mode exists to restore. Each mode is honest about a different question, and none of them is a compromise between the two."));
C(
  bullet("Controls are granularity \u00d7 bucket count, not a time span. The span is the product of the two, so an unrenderable combination (Day granularity across seven years) cannot be expressed rather than having to be guarded against"),
  bullet("Bucket counts offered per granularity: Day 14/30/60/90, Week 12/26/52/104, Month 12/24/60/120. Switching granularity resets the count to that granularity's default, since a valid month count is not necessarily a valid day count"),
  bullet("The resolved range is printed above the chart: the control states a count, the header states the span it produced"),
  bullet("Labels are shortened by formatBucketLabels, which expects yyWww / yy.mm / mm-dd, so WeightTrendView converts the API's ISO labels before passing them"),
  bullet("The caption below the chart changes with the mode, so the total-versus-fill distinction is explained only where it applies"),
);

C(bold("Filters"));
C(p("Global filter bar only — no widget-local filter. crossActivities applies to BOTH the period query and the latest-ever lookup, so the two bars never differ in scope along that axis."));
C(p("The Trend view takes crossActivities from the same global filter, but ignores the selected period as a range: granularity \u00d7 buckets IS its span. The period still sets where the window ENDS \u2014 see the anchor rule below \u2014 so selecting a past month moves the whole window back rather than filtering inside it. The Summary/Trend toggle is therefore never disabled on this widget, unlike Diet, whose trend buckets are built from timeMode and timePeriod directly."));

C(bold("Notes"));
C(bold("Latest is deliberately outside the global filter"));
C(p("weightBox and avgComposition are period scoped; latest is the most recent measurement in the whole dataset. Comparing a past month's average against that same month's final reading answers nothing useful — the comparison people actually want is \"where am I now against how I was then\". findLatestDay() therefore runs its own unbounded query, sorted on start.year/month/day descending, then re-fetches that whole day so repeat readings collapse the same way. When the selected period is the current one, latest falls inside it anyway and nothing changes."));
C(note("Consequence: filtering to a pre-InBody range pairs a weight-only AVERAGE bar with a fully segmented LATEST bar. The segment deltas null out, so nothing breaks, but the two bars look structurally different. Accepted deliberately."));

C(bold("One fat percentage, not two"));
C(p("bodyFatPercent (measured) and fatPct (derived as bodyFat / weight) are identical on any single day, because the sheet derives 체지방량 from 체지방률. They diverge only in the average, where one is a mean of daily ratios and the other a ratio of means — a gap of roughly 0.03 percentage points. avgComposition therefore passes null for bodyFatPercent so that buildComposition derives it, guaranteeing the widget shows ONE fat percentage that agrees with the three segment shares."));

C(bold("The trend anchor is min(end of selected period, today)"));
C(p("Buckets are counted back from an anchor, and the anchor is NOT the last measurement. Anchoring on the newest weigh-in would slide a stale reading to the right-hand edge and hide the fact that nothing has been recorded for a fortnight; anchoring on today makes that gap visible as empty recent buckets, which is the honest picture. But that rule must not override a deliberate period selection: choosing January 2026 should run the chart to 31 January even though the last reading that month was the 20th, and must not run it to today. Taking the earlier of the period end and today satisfies both \u2014 a past period ends where it ends, and the current period still stops at today rather than rendering a fortnight of empty future buckets."));
C(note("buildDateRange returns a UTC instant, so the anchor date is read from its UTC fields. Reading it locally would turn 2026-07-31T23:59:59.999Z into 1 August under BST and shift every bucket boundary by one \u2014 precisely the failure the local-date-field convention exists to prevent."));

C(bold("Empty buckets: trim the leading ones, keep the interior ones"));
C(p("A request for 90 monthly buckets reaches back further than the data goes, and rendering twenty blank buckets before the first weigh-in wastes the width that the real data needs. Leading empties are therefore trimmed server-side. Interior empties are kept and rendered as a break in the line, because a gap inside the data is information \u2014 February and March 2026 carry no readings at all, and interpolating across them would invent weigh-ins that never happened."));

C(bold("Where the total line and the fill separate, that IS the pre-InBody boundary"));
C(p("A bucket's weight averages every day in it; its composition averages only the days carrying a full muscle/fat triple. In a bucket that mixes pre-InBody and post-InBody days the two differ slightly \u2014 April 2020 reports weight 66.0 over 30 days against composition.weight 66.1 over 22 \u2014 so the total line and the top of the fill part company. This is deliberate and must not be reconciled: forcing them to agree would require either dropping weight-only days from the total (throwing away real measurements) or attributing a composition to days that never had one. Buckets with no InBody day at all carry composition null, and the chart simply draws the line across them with no fill beneath."));

C(bold("Pinned segment colours"));
C(p("Muscle / Fat / Other are three fixed semantic segments, so their colours are hard-coded in the widget rather than assigned through barColors / autoColorMap, which exist for dynamic key sets whose membership varies. Orange always means fat. Same rationale as QualityPie in SleepWidget. The values are drawn from the existing palette: primary blue/teal for muscle, the box plot's own average orange for fat, stone/zinc neutral for other."));
C(p("From v4.2 the palette lives in src/app/insights/_widgets/weight-colors.ts rather than inside WeightWidget, because WeightTrendView needs the same three colours and importing them from its own parent would be a circular import. SEG_ORDER is muscle, fat, other \u2014 read left to right in the Summary bars and bottom to top in the Trend stack. Keeping the two identical is deliberate: muscle sits at the bottom of the stack, so it is the only band that loses its base if the axis is ever cropped, and fat and other stay whole."));

C(bold("Measured label fitting"));
C(p("A segment's share is a percentage, but whether its figures fit is a question of pixels. CompositionRow measures its track with a ResizeObserver (the same approach as Treemap.tsx) and shows the kg line only above MIN_KG_PX, adding the (%) line only above MIN_PCT_PX. On a narrow card the Fat segment may therefore show kg alone; the full figures stay available in the segment's title tooltip."));

C(h3("9.3.6 Exercise (WBS #58)"));

C(bold("Purpose"));
C(p("Exercise volume and consistency. The Summary shows the filter period, one block per item, with all-time personal bests printed beside the period figures so a good month can be read against the ceiling rather than in isolation. The Trend (v4.5) shows the routine over a longer window: how often per bucket, which items in which stretches, and how the per-day amounts moved."));

C(bold("API / data shape"));
C(p("computeExerciseSummary(userId, periodStart, periodEnd, crossActivities) in src/lib/insights/exercise.ts, dispatched as metric=exercise.summary. duration.totalSeconds is not read at all. Scope is activity.category === 운동, which excludes the six 걷기 rows filed under 문화/취미 and 육아. The Trend metrics below share the same scope and the same fetch approach from src/lib/insights/exercise-trend.ts."));
C(p("The query is deliberately UNBOUNDED. The personal bests are all-time while everything else is period-scoped, so one fetch of every 운동 record is taken and the period is cut in memory rather than issuing a second query. At roughly 1,210 records that is far cheaper than the round trip it replaces; the approach should be revisited above about 20,000."));
C(note("Consequence: the date filter never reaches MongoDB. Dates are compared as YYYY-MM-DD strings built from start.year/month/day, so this widget needs no $expr + $dateFromParts filter and no UTC boundary can shift a day. It satisfies the Appendix A local-date convention by construction rather than by guard."));
C(table(["Response field","Meaning"],[
  ["dates[]","Every day in the period, ascending. The end is capped at today, so the current month is not scored against days that have not happened yet — the same rule as the Weight widget"],
  ["exerciseDays","Days in the period carrying at least one 운동 record"],
  ["periodDays","Length of dates[]"],
  ["daysPerWeek","exerciseDays ÷ periodDays × 7"],
  ["dayCounts","date → record count. Drives the HeatStrip and the calendar modal"],
  ["items[]","One entry per item present in the period, sorted by days desc, then total desc, then name"],
],[2400,6960]));
C(table(["items[] field","Meaning"],[
  ["item / unit","Item name and its unit. One unit per item is verified in the data; the first non-empty wins if that ever breaks"],
  ["days / daysPerWeek / total","Period-scoped. total sums day totals; loadKg is never added in"],
  ["restPauseCount","Period count of 총 records. The identifier is a misnomer — see Notes"],
  ["boxes","One or two ExerciseBoxStats, or null when the item has fewer than 3 days in the period. Shaped exactly like BoxPlotBucket, so the widget passes it straight to CssVerticalBoxPlotChart"],
  ["daily","Day totals aligned index-for-index to dates[]; null on a day with no record"],
  ["dailySetMax","Biggest straight set per day, aligned the same way. null for the whole item when it would merely repeat daily"],
  ["bestSet / bestDay","All-time {value, date}. bestSet excludes 총 records; bestDay includes them"],
  ["bestSetRestPause","All-time best 총 record. Computed and returned but NOT rendered — see Notes"],
  ["bestLoadKg","All-time heaviest load, or null for the ten items that never carry one"],
],[2400,6960]));
C(spacer());
C(p("A dense daily array aligned to one shared dates[] is used rather than per-item {date, value} pairs, which would repeat the same 31 dates once per item. Ties on any best go to the EARLIEST date — the first time the figure was reached, not the most recent time it was matched."));

C(bold("Summary"));
C(
  bullet("Row 1 — whole period: an exercise-days counter (23/30, with days-per-week beneath) beside a full-width HeatStrip. The whole row is a button opening a CalendarHeatmap modal"),
  bullet("Row 2 onward — a two-column grid of item blocks, most-frequent item first. Each block carries the item name, its days and days-per-week, a one-line list of all-time bests with the month and year each was set, the box plot(s), and the period total"),
  bullet("Each box is drawn as its OWN chart with its own scale, side by side. On a shared scale the day box always sits roughly three times higher than the set box, because a day holds roughly three sets — true, but it squashes both shapes flat. The figures printed on each box are what guard against reading the two as comparable"),
  bullet("Tapping an item block opens a modal holding its daily-total chart and, where it differs, its biggest-set chart. The charts live in a modal because five items in a month is normal, and five inline charts made the card roughly four times taller than every other widget on the page"),
  bullet("Under three days in the period the box plot is suppressed and the raw values are listed as plain text instead — there is no distribution worth drawing"),
);

C(bold("API — exercise.trend and exercise.itemTrend (v4.5)"));
C(p("computeExerciseTrend(userId, start, end, grain, crossActivities) and computeExerciseItemTrend(userId, item, start, end, grain, crossActivities) in src/lib/insights/exercise-trend.ts, dispatched as metric=exercise.trend and metric=exercise.itemTrend. The window is Weight-style: grain (day | week | month) \u00d7 buckets (a count), resolved in the route by counting back from min(end of the selected filter period, today) — the same anchor rule as weight.trend, for the same reasons — landing on a bucket boundary (Monday or the 1st) so the first bucket is whole. The end cap at today means the current partial bucket reports only its elapsed days and is scored fairly. Both metrics reuse the unbounded-fetch, cut-in-memory approach; everything here is period-scoped, but at ~1.2k records one plain fetch stays cheaper than a date-filtered one and keeps the YYYY-MM-DD string discipline."));
C(table(["exercise.trend field","Meaning"],[
  ["grain / buckets[] / bucketDays[]","Echoed grain; bucket start dates ascending; PERIOD days inside each bucket — a bucket straddling the window edge counts only its real days, so activity ratios stay honest"],
  ["frequency[]","Days exercised per bucket, any item"],
  ["groups[]","Items grouped under their activity.name (근육 운동 / 유산소 운동 / 계단 오르기) — the grouping is read from the data, never a hardcoded list. Groups sort by their items' combined days desc; items by totalDays desc. Items with zero days in the window never appear"],
  ["groups[].items[]","{item, unit, totalDays, activeDays[]} — activeDays is days exercised per bucket, aligned to buckets[]"],
],[2800,6560]));
C(table(["exercise.itemTrend field","Meaning"],[
  ["collapsed","True when, within the window, every active day holds exactly one record and none are 총 — the Summary collapse test, period-scoped. The biggest-set series is then null because it would repeat the day total"],
  ["buckets[]","Same bucketing as the main call, but leading emptiness is trimmed by THIS item's data — the modal owes the timeline no alignment, and opening on months of nothing helps nobody"],
  ["dayTotal {value[], load[]}","value = average day total per active day in the bucket, 총 included; null = no active day. load = the day's set loads averaged with nulls as zero (3\u00d750 reps at 10 kg is 150 reps at 10 kg, not 30 kg), then averaged across active days; the whole array is null when the item carries no load at all"],
  ["biggestSet {value[], load[]}","value = average of each day's biggest straight set — max reps, a tie going to the heavier load; 총-only days contribute nothing. load = that chosen set's own load, nulls as zero, averaged the same way"],
],[2800,6560]));
C(spacer());
C(note("Leading empty buckets are trimmed (by any-item activity for the main call); interior empties are kept — a gap inside the window is information, per the standing convention."));

C(bold("Trend"));
C(
  bullet("Controls are grain \u00d7 bucket count, Weight-style, with the SAME options and defaults as the Weight widget — Day 14/30/60/90 (default 30), Week 12/26/52/104 (26), Month 12/24/60/120 (24). Switching grain resets the count to that grain's default, and a resolved-range line above the charts states the span the window produced, clamped to today"),
  bullet("Frequency — days exercised per bucket as a CssTrendChart, y-axis pinned to zero, drawn in band mode and left-padded so each point sits exactly over its timeline column below. Hidden entirely at day grain, where a 0/1 square wave would merely repeat the timeline"),
  bullet("Item timeline — a Gantt-style grid. One row per item under small group headers taken from activity.name; whole row tappable. Each cell is coloured by activeDays \u00f7 bucketDays on a single accent (the Summary's pinned blue/teal) through five opacity zones: \u22645% barely-there, \u226435% seldom, \u226465% so-so, \u226495% routine, >95% treated as 100%. A zone legend sits below; at day grain every filled cell is 100%, so the legend hides too. Hovering a cell shows a two-line tooltip — n/bucketDays days over the bucket name"),
  bullet("Dense windows stay readable: above 16 buckets the charts hide their printed point values (hover shows a value with its bucket name); above 60 buckets the timeline tightens its cell gap from 2px to 1px. Timeline x labels thin on the fixed newest-anchored stride, and every printed label carries its year (26.03 style) — the charts pass compressXLabels false for the same reason"),
  bullet("Tapping a row opens a ModalShell holding the item's bucket-average charts: one chart when collapsed, otherwise Day total and Biggest set stacked, each on its own scale. Where load exists it is drawn by CssTrendChart's right-axis extension — dashed, hollow dots, amber (the palette's existing average colour), its own right-hand axis — resolving the load line deferred at v4.4. A caption states the averaging rule and, for set-based items, the 총 handling in the Summary's public wording (combined-total records)"),
);

C(bold("Filters"));
C(p("Global filter bar plus the ViewToggle in the card header (added v4.5 — the toggle was absent at v4.4 because no Trend view existed). The Summary behaves as before. The Trend takes crossActivities from the global filter but, like Weight, treats the period only as the window's ANCHOR: grain \u00d7 count is its span, and selecting a past period slides the whole window back rather than filtering inside it. The card's loading and error states stay scoped to the Summary because the Trend view owns its own fetches — the main call on every filter, grain or count change, and the per-item call on tap."));

C(bold("Notes"));
C(bold("총 marks a day total with an unknown set split, NOT a rest-pause set"));
C(p("Corrected at v4.4; the code identifiers still carry the old reading. 총 was back-filled onto older records where the day's total survives but the per-set breakdown does not — for example 42 pull-ups logged across more than thirty minutes, certainly several sets, with no record of how many. A 총 record is therefore a day total under another name."));
C(p("The consequences all point the same way and are implemented: 총 records are excluded from the Set box, from dailySetMax and from bestSet, because none of those is a set; they are included in the Day box, in total and in bestDay, because all of those are day figures. bestSetRestPause is computed and returned but deliberately not rendered — a best 총 is a best day under another name, and printing both would report one fact twice."));
C(note("Naming debt: REST_PAUSE, restPauseCount and bestSetRestPause in exercise.ts, and restPauseCount in ExerciseWidget.tsx, are misnomers introduced before the meaning was established. Rename to something like combinedCount / bestCombined when those files are next touched."));

C(bold("Two boxes, collapsing to one"));
C(p("The Set box and the Day box carry different numbers only when a day can hold more than one straight set. When an item has exactly one record per day and no 총 records the two are the same numbers drawn twice, so the server emits a single unlabelled box instead. 턱걸이 and 딥스 normally show two; 걷기, 달리기, 스텝퍼, 요가 and Leg extension show one. 스쿼트 has one record per day but carries 총 records, so its two boxes genuinely differ and it correctly keeps both — the rule handles it without a special case."));
C(p("The same test drives dailySetMax and the bests line: wherever the two figures would coincide, one is printed rather than two identical ones."));

C(bold("Average, not median"));
C(p("CssVerticalBoxPlotChart marks avg, and its tooltip is labelled Avg. Carrying a median in that field would have printed a label contradicting the value, and adding a median marker would have meant patching a component two shipped widgets depend on, for a second centre line that mostly repeats what the IQR box already shows. Reps per set are skewed, so median is the better statistic in theory; the box carries the skew either way."));

C(bold("Presence, not intensity, on the heat strip"));
C(p("dayCounts returns a record count, but the strip and the calendar use a single accent colour for any non-zero day. Shading by count would imply that four 턱걸이 sets is a bigger day than one 걷기 — a ranking across incomparable units that the data cannot support. The count is returned anyway, so graded shading stays available later without an API change."));

C(bold("Units: 층 converted to 분, and the travel-time caveat"));
C(p("계단 오르기 was logged in 층 (floors) on some records and 분 on others. The 층 records were converted to 분 at roughly four floors per minute before the widget was built, leaving exactly one unit per item across the whole dataset. The per-item counts still quoted in older WBS revisions (걷기 74, 스텝퍼 15) predate that pass and are stale."));
C(note("Amount in 분 is actual activity time, which is NOT the same idea as duration — end minus start, including travel. Older 분 records were back-filled from (end − start), so their amounts carry travel time and run slightly high. 분 totals are therefore not strictly comparable across the whole history."));

C(bold("The load line — deferred at v4.4, built at v4.5"));
C(p("The Summary deferred the load line because no component carried two y-axes (CssDualLineChart is hard-wired to session times, CssRestChart to the rest histogram) and load was too sparse for a daily chart to be worth blocking on. The Trend resolved it differently on both counts: the second axis went into CssTrendChart as an optional right-axis series — off by default, so the two shipped widgets using that chart render unchanged — and the Trend's bucket averaging turns sparse daily loads into a line worth drawing. The Summary's daily modal still has no load line; if one is ever wanted there, the natural home remains an optional second series on CssDailyChart."));
C(bold("Trend rendering decisions (v4.5)"));
C(p("The timeline shows one cell per bucket rather than merged bars, because merged bars hide the per-bucket intensity that the zones exist to show. Presence and intensity share one hue — the zone ramp is opacity on the Summary's pinned accent — so the timeline and the heat strip read as the same language. The frequency chart's y-axis is raw days, not percent: raw days are concrete, and the percent framing lives in the zone colours instead. The modal averages per ACTIVE day (11 km per run, not 110 km per month) because intensity, not volume, is the question a trend answers; days off are absent, not zeros."));


C(new Paragraph({ children: [new TextRun({ text: "Part IV · Operations", bold: true, size: 28 })], spacing: { before: 280, after: 140 } }));


// ===== 10. MIGRATION (merged from old §6 Transformation + §11 Migration) =====
C(h1("10. Migration"));
C(p("Everything that lifts the Google Sheets data into MongoDB. This whole section is transitional: once the Phase 5 data-entry feature lands, entries are created natively and the field-mapping and migration machinery here retire together. Durable derivations (e.g. duration.totalSeconds) live with the schema in Section 5, not here."));
C(h2("10.1 Field Mapping"));
C(p("How each source cell becomes a document field. These rules run inside the migration tool only."));
C(h3("10.1.1 Multi-value Field Parsing"));
C(p("Comma-separated values across corresponding columns are zipped into arrays. Applies to: purchase, drinks, foods, alcohols, exercise."));
C(p("Example — purchase columns:"));
C(
  bullet("구매항목: \"서랍장,현관 의자,욕실 선반,휴지통\""),
  bullet("량: \"2,1,1,1\""),
  bullet("단위: \"개,개,개,개\""),
);
C(h3("10.1.2 Plus-sign Concatenation Rule"));
C(p("Items containing a plus sign (e.g. \"와인+사케\") are split into separate array entries at migration time via zipMultiValueWithPlusSplit(). The amount is divided evenly across all split items. purchase[].item is explicitly excluded from this treatment. MongoDB never contains + in any item fields."));
C(h3("10.1.3 People Field Parsing"));
C(p("The people fields use pipe (|) as a group separator and comma (,) as a value separator within each group. Each group is one method/category/target combination. \"등\" is filtered out from target lists."));
C(p("Example:"));
C(
  bullet("수단 (method): \"대면|영상\""),
  bullet("성격 (category): \"가족|생활\""),
  bullet("대상 (targets): \"민아,윤지|Mariana,아버지\""),
  bullet("Result: two people documents — (대면, 가족, 민아), (대면, 가족, 윤지) and (영상, 생활, Mariana), (영상, 생활, 아버지)"),
);
C(h3("10.1.4 Other Parsing Rules"));
C(
  bullet("Numeric fields: remove thousand-separator commas before parsing (e.g. \"1,500,000\" → 1500000)"),
  bullet("bodyFatPercent: stored as a PERCENT (21.265 = 21.3%). Corrected in v4.1 — earlier versions documented a decimal (0.207); live data shows the percent form. Consumers should treat a value under 1 as a decimal and multiply by 100, otherwise use it as-is."),
  bullet("allDay flag: true when both start and end hour fields are empty"),
  bullet("H/M/L values (carbs, fat, spiciness): stored as-is as strings"),
  bullet("Null/empty strings: parseString() returns null for empty, #N/A, or #-prefixed values"),
);
C(h3("10.1.5 Google Sheets Column Layout"));
C(p("Two insertions shape the current layout. In v3.0 a new column AO (spiciness) was inserted between AN (fat) and the previous AO (drink item), shifting every column after it by one. In v4.3 two new columns BU (부하) and BV (방식) were inserted after BT (운동단위), shifting every column after them by two. The total is now 86 columns. The migration script fetch range is A:CI — A:CH would be exact, and A:CI keeps one spare column."));
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
  ["BU (NEW v4.3)","72","exercise[].loadKg"],
  ["BV (NEW v4.3)","73","exercise[].setStyle"],
  ["BW","74","reading.title (was col 72)"],
  ["BX","75","movie.title (was col 73)"],
  ["BY","76","golf.score (was col 74)"],
  ["BZ","77","golf.approach (was col 75)"],
  ["CA","78","golf.putts (was col 76)"],
  ["CB","79","income.gross (was col 77)"],
  ["CC","80","income.net (was col 78)"],
  ["CD","81","travel.city (was col 79)"],
  ["CE","82","travel.theme (was col 80)"],
  ["CF","83","notes (was col 81)"],
  ["CG","84","sync.status (was col 82)"],
  ["CH","85","sync.eventId (was col 83)"],
],[2200,2200,4960]));
C(note("Two numbering systems are in use and they differ by one. The index column above is 0-based, as used by rowToDocument.ts. Google Apps Script getRange() is 1-based, so CG is column number 85 and CH is column number 86. See Section 13 for the sync script that writes to those two columns."));
C(spacer());
C(h3("10.1.6 Food Ingredient Parsing"));
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
C(p("Each ingredient inside the parentheses is validated against the level2 vocabulary loaded from ingredient_master (see Section 6.7). If any value is not a valid level2 term, parseFoodIngredients() throws IngredientValidationError. The per-row try/catch in migrate.ts catches it, skips the entire row, and logs the offending value and row number. The user then corrects the source row (or adds the missing taxonomy term) and re-migrates."));
C(bold("Vocabulary loading — single source of truth"));
C(p("VALID_LEVEL2 is NOT hard-coded. loadValidLevel2(userId) is awaited once at migration start (after Mongo connection and index sync, before any sheet is migrated). It reads all level2 values from ingredient_master and caches them, plus the \"Not Defined\" sentinel. parseFoodIngredients() is synchronous and reads this cache; it throws if called before the vocabulary is loaded (fail-fast). Because the vocabulary comes from the Ingredient sheet via ingredient_master, adding or renaming a level2 value requires only: edit the Ingredient sheet → npm run migrate-ingredient → re-run migration. No code change."));
C(bold("Scope"));
C(p("As of v3.1 this parsing applied only to food.foods[]. As of v3.2 the same parser is also applied to food.drinks[] (see Section 6.7). food.alcohols[] is the only food sub-array that is NOT parsed for ingredients."));

// ===== 6.7 DRINK INGREDIENT PARSING =====
C(h3("10.1.7 Drink Ingredient Parsing"));
C(p("Drink items in column AP may carry the same inline parenthesis ingredient notation as food items, e.g. 라떼(커피|우유). The generic parseFoodIngredients() function (Section 6.6) is reused unchanged — in rowToDocument.ts the food.drinks array is post-processed with the same .map() that food.foods uses, stripping the parentheses from the item name and populating food.drinks[].ingredients with the validated level2 values."));
C(p("Key points specific to drinks:"));
C(
  bullet("The existing drink note tag (커피 / 차 / blank in column AS) is preserved — ingredients are added alongside it, not in place of it."),
  bullet("Validation uses the same VALID_LEVEL2 vocabulary loaded from ingredient_master, which in v3.2 includes the new 음료 and 당류 level2 values (see Section 6.7)."),
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
C(h2("10.2 Strategy"));
C(p("How a migration run is executed and re-run safely."));
C(h3("10.2.1 Overview"));
C(p("Migration covers the two archive sheets only: ~2025 and 2026. Active, History, and Future sheets are out of scope until Phase 5. Re-migration uses delete-all + re-insert — Log.deleteMany({ userId }) then bulk insert. No deduplication check required."));
C(p("This strategy was chosen because:"));
C(
  bullet("The same activity can legitimately occur multiple times within the same minute"),
  bullet("Row numbers in Google Sheets are not stable (rows are inserted, deleted, and moved regularly)"),
  bullet("Active/History/Future sheets are managed separately in Google Sheets until Phase 5"),
);
C(h3("10.2.2 Supporting Collections"));
C(p("Supporting collections (cost_master, activity_master, reference_lists, timezone_master, exchange_rate) use a delete-all + re-insert strategy per collection. activity_master uses a unique index on userId + name + category. alcohol_conversion is seeded via npm run migrate-alcohol from the AlcoholConv sheet. ingredient_master (added v3.1) is seeded via npm run migrate-ingredient from the Ingredient sheet. See Sections 15 and 16 for the daily routine and master-table update procedures."));
C(h3("10.2.3 Incremental Sync — Deferred to Post-MVP"));
C(p("The DB_Status/DB_ID column approach designed in v1.1 has been deferred to post-MVP. It will be implemented after the Phase 5 data entry feature is complete."));
C(h3("10.2.4 Source Sheets to Migrate"));
C(table(["Sheet","File","Priority"],[
  ["~2025","Full Archive_2026Mar06","1 — largest historical dataset"],
  ["2026","Full Archive_2026Mar06","2 — current year archive"],
],[2400,3400,3560]));
C(note("Note: Active, History, and Future sheets are NOT migrated. They are managed in Google Sheets until Phase 5."));
C(h3("10.2.5 Supporting Collections to Migrate"));
C(
  bullet("cost_master — from Cost sheet in Active_2026Mar05"),
  bullet("activity_master — from Activity sheet in Active_2026Mar05"),
  bullet("reference_lists — from Activity sheet columns 3–14 in Active_2026Mar05"),
  bullet("timezone_master — from TimeDiff sheet in Active_2026Mar05"),
  bullet("exchange_rate — from TimeDiff sheet in Active_2026Mar05 (current rates only)"),
  bullet("alcohol_conversion — from AlcoholConv sheet in Active_2026Mar05 (npm run migrate-alcohol)"),
  bullet("ingredient_master — from Ingredient sheet in Active_2026Mar05 (npm run migrate-ingredient) — NEW v3.1"),
);
C(h3("10.2.6 Migration Tool Requirements"));
C(
  bullet("Connect to Google Sheets via Google Sheets API / service account"),
  bullet("Read all rows from each sheet (skip first header rows)"),
  bullet("Apply row filtering rules per Section 4.8"),
  bullet("Apply all transformation rules per Section 10.1 (Field Mapping)"),
  bullet("Compute duration.totalSeconds from UTC-normalised start and end timestamps"),
  bullet("Clear all existing log documents for the user before inserting (delete-all + re-insert)"),
  bullet("Write transformed documents to MongoDB using bulk insert"),
  bullet("Report migration statistics: total rows, skipped rows, inserted rows, error rows"),
  bullet("Log any rows that fail validation with row number and reason (includes ingredient validation errors, v3.1)"),
);
C(h3("10.2.7 Performance Target"));
C(
  bullet("Migrate ~43,000 rows in under 5 minutes"),
  bullet("Use MongoDB bulk insert operations (not one-by-one)"),
);
C(h2("10.3 History & Results"));
C(p("Dated, one-time events, recorded for traceability."));
C(h3("10.3.1 v3.0 Re-migration"));
C(p("After adding column AO (spiciness) to Google Sheets, a full re-migration of both 2026 and ~2025 archive sheets is required. Steps:"));
C(
  num("Add column AO (spiciness, values H/M/L) to both Active and Archive spreadsheets"),
  num("Deploy updated rowToDocument.ts and Log.ts"),
  num("In migrate.ts: uncomment the ~2025 block and run Log.deleteMany({ userId }) for both years"),
  num("Run migration for both ~2025 and 2026"),
  num("Verify document count and spot-check food.spiciness on sample records"),
);
C(h3("10.3.2 Codebase Cleanup (30 April 2026)"));
C(p("The following dead files were removed during Phase 4 implementation:"));
C(
  bullet("src/lib/migration/migrate.ts — old unused migration wrapper, superseded by scripts/migrate.ts"),
  bullet("src/app/api/migrate/route.ts — old API route"),
  bullet("src/app/api/migrate-full/route.ts — old API route"),
  bullet("src/app/api/test-transform/route.ts — old test route"),
  bullet(".next/ cache — cleared to resolve stale TypeScript declaration errors"),
);
C(h3("10.3.3 v3.1 Ingredient Migration"));
C(p("After establishing the ingredient taxonomy and adopting parenthesis notation, the following one-time setup was performed. These steps are also the reference procedure for any future taxonomy change:"));
C(
  num("Populate the Ingredient sheet (level1 / level2, header row 1) — 73 level2 values across 16 level1 groups as of v3.2"),
  num("Run npm run migrate-ingredient to seed ingredient_master"),
  num("Deploy updated Log.ts (foodsItemSchema with ingredients), transform.ts (parseFoodIngredients + loadValidLevel2), rowToDocument.ts (foods post-processing), migrate.ts (loadValidLevel2 call)"),
  num("Historical fill: run npx tsx scripts/fill-historical-ingredients.ts to populate food.foods[].ingredients for all existing rows from the embedded reviewed map (see Section 12.3)"),
  num("Verify with scripts/inspect-ingredients.ts and reconcile with scripts/reconcile-foods.ts"),
);
C(note("Note: Old source rows that used descriptive parentheses such as (국만), (국물), (밥만), or a content list like 회(도다리 세꼬시와 광어) must be cleaned before re-migration, because parseFoodIngredients() reads anything in parentheses as an ingredient list and will reject non-level2 values. scripts/scan-bad-parens.ts lists every offending row."));


C(h3("10.3.4 Migration Results"));
C(note("Note: Re-migration completed 30 April 2026 with v1.4 schema (43,123 documents). A full re-migration was performed after v3.0 column AO insertion, and again after v3.1 ingredient adoption. The figures below are the v1.4 baseline; the v3.1 food-row reconciliation result is recorded in Section 12.4."));
C(table(["Sheet","Total rows","Skipped","Inserted","Errors"],[
  ["~2025","41,327","1","41,326","0"],
  ["2026","1,797","0","1,797","0"],
  ["Total","43,124","1","43,123","0"],
],[2160,2000,1700,1900,1600]));
C(spacer());



C(h1("11. Daily Data Routine"));
C(h2("11.1 Overview"));
C(p("This section documents the day-to-day workflow for keeping MongoDB in sync with the Google Sheets source, including ingredient population. The routine applies whenever source data changes — most commonly when yesterday's entries are moved from the Active sheet into the 2026 archive sheet."));
C(h2("11.2 The Routine — Step by Step"));
C(table(["Step","Command","What it does"],[
  ["1. Drop in new data","(manual, in Google Sheets)","Move yesterday's completed entries from the Active sheet into the 2026 archive sheet. Use the parenthesis ingredient notation on food AND drink items, e.g. 밥(쌀)+계란(계란) and 라떼(커피|우유). Items without parentheses become [\"Not Defined\"] and are repaired in steps 3-4."],
  ["2. Migrate","npm run migrate","Deletes all 2026 documents (Log.deleteMany({ userId, 'start.year': 2026 })) and rebuilds them from the 2026 sheet. Foods with parenthesis notation get their ingredients directly from parseFoodIngredients; foods without get [\"Not Defined\"]."],
  ["3. Fill ingredients","npx tsx scripts/fill-historical-ingredients.ts","Repairs every food item whose ingredients are missing or [\"Not Defined\"] using the embedded REVIEWED_MAP + bestGuess fallback. Skips items that already have real ingredients (including today's properly-parenthesised rows)."],
  ["4. Fill drinks","npx tsx scripts/fill-historical-drinks.ts","Same as step 3 but for food.drinks[].ingredients, using the DRINK_MAP. Independent of the foods fill; order between them does not matter."],
  ["5. Inspect","npx tsx scripts/inspect-ingredients.ts + inspect-drinks.ts","Surveys both foods and drinks: items with ingredients vs Not Defined, top level2 distribution, samples."],
  ["6. Reconcile","npx tsx scripts/reconcile-foods.ts","Re-reads the source sheets with the live parser and compares against MongoDB. Reports source-vs-DB gap and any per-row parse errors. Target: gap = 0, errors = 0."],
],[1700,2900,4760]));
C(spacer());
C(h2("11.3 Why migrate then fill?"));
C(p("The main migrate rebuilds 2026 from the sheet, where ingredients can only come from parentheses. Older rows without parentheses would become [\"Not Defined\"]. The fill script then tops these up from the reviewed map. Running both in sequence guarantees that both new-style (parenthesised) and old-style (parenthesis-less) rows end up with correct ingredients."));
C(note("Note (Case A — no stale ingredients): Because the user always runs migrate after any source change, every 2026 document is deleted and rebuilt each time. Old ingredient values can never linger from a previous state — there is no scenario where the sheet says one thing and MongoDB shows a stale ingredient from a deleted item."));
C(h2("11.4 Idempotency & the Not-Defined Rule"));
C(p("The fill script's skip condition treats [\"Not Defined\"] as unfilled, so re-runs repair items that a migration reset to Not Defined. Items that already hold real ingredients are skipped. This makes the fill step safe to run every day:"));
C(
  bullet("Items with real ingredients (from parentheses or a prior fill) → skipped, untouched"),
  bullet("Items that are [\"Not Defined\"] → re-filled from the reviewed map"),
  bullet("Items with no ingredients field at all → filled"),
);
C(h2("11.5 Cleaning Legacy Parentheses"));
C(p("Old source rows that used descriptive (non-ingredient) parentheses — e.g. 소고기 국밥(국만), 짬뽕(국물만), 소고기 미역국(밥만), 아이스크림(와일드바디), 회(도다리 세꼬시와 광어) — will be rejected by parseFoodIngredients because the text in parentheses is not a valid level2 value. Run scripts/scan-bad-parens.ts to list every offending row, then fix them in the sheet (remove the descriptive parentheses, or convert to real ingredient notation), and re-migrate. After cleaning, reconcile should report gap = 0 and errors = 0."));



C(h1("12. Master-Table Update Procedures"));
C(p("FarGaze has two food-related master tables that are seeded from the Active spreadsheet: the alcohol conversion table and the ingredient taxonomy. This section is the canonical procedure for updating each."));
C(h2("12.1 Updating the Alcohol Conversion Table (alcohol_conversion)"));
C(p("The alcohol_conversion collection maps each (item, unit) pair to a drinks value (see Section 6.6). To add or change a conversion:"));
C(
  num("Open the AlcoholConv sheet in the Active_2026Mar05 spreadsheet (range AlcoholConv!A2:E)"),
  num("Add or edit a row: item, unit, unitTo50ml, alcoholRatio. The drinks value is unitTo50ml × alcoholRatio. Example added in v3.1: 와인 / ml."),
  num("If precision matters, increase the decimal places shown in the sheet cell before migrating — the migration reads the displayed value"),
  num("Run npm run migrate-alcohol — this does delete-all + re-insert for the alcohol_conversion collection"),
  num("Verify the collection document count in MongoDB Atlas (54 documents as of v3.1)"),
);
C(note("Note: 1 drink = 1 소주잔 = 50ml soju equivalent. The drinks field on each alcohol log entry = amount × convMap[item][unit].drinks. Changing a conversion does NOT require re-migrating the log collection — the drinking widget reads alcohol_conversion at query time."));
C(h2("12.2 Updating the Ingredient Taxonomy (ingredient_master)"));
C(note("Note (v3.2): the same ingredient_master taxonomy now serves both foods and drinks. Adding a drink value (e.g. a new tea under 음료) follows exactly the same procedure below. After any taxonomy change, re-run migrate, then both fill-historical-ingredients.ts and fill-historical-drinks.ts."));
C(p("The ingredient_master collection holds the level1/level2 taxonomy and is the single source of truth for the level2 vocabulary used by parseFoodIngredients validation (see Section 6.7). To add, rename, or regroup an ingredient class:"));
C(
  num("Open the Ingredient sheet in the Active_2026Mar05 spreadsheet (columns level1 / level2, header row 1)"),
  num("Add a new row (new level1+level2), rename a level2 value, or move a level2 to a different level1 group"),
  num("Run npm run migrate-ingredient — this does delete-all + re-insert for ingredient_master, refreshing the level2 vocabulary"),
  num("Re-run the main migration (npm run migrate) so that parseFoodIngredients validates against the updated vocabulary; otherwise new-data rows using a renamed value would be rejected"),
  num("Run the fill script and reconcile per Section 11 to repair and verify"),
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
C(h2("12.3 The Historical-Fill Reviewed Map"));
C(p("scripts/fill-historical-ingredients.ts embeds two mappings that resolve a food item name to its level2 ingredient list:"));
C(
  bullet("ITEM_MAP — the original 357 common items"),
  bullet("REVIEWED_MAP — 1,156 human-verified entries built over six review batches, merged on top of ITEM_MAP (reviewed entries take precedence)"),
  bullet("bestGuess() — a substring fallback for any item in neither map; genuinely unknown items become [\"Not Defined\"]"),
);
C(p("Together these cover 1,292 distinct food item names. The review process (six batches) corrected systematic substring-matcher traps — for example: 스테이크 defaulting to 소고기 (fixed for 양고기/생선/돼지 variants); 수육 defaulting to 돼지고기 (fixed for 아귀수육/복수육 → 생선); 차돌 dishes needing 소고기; (국만)/(국물) dishes being broth-only; explicit 밥 requiring 쌀; 라면 requiring 밀; 당면 being 전분 not 밀."));
C(note("Note: To extend coverage, run the script with --export-worklist to produce a TSV of distinct unmapped items with frequency and a suggested level2, fill in the final_level2 column, and fold the reviewed entries back into REVIEWED_MAP."));
C(h2("12.4 Reconciliation Result (v3.1)"));
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



// ===== 13. GOOGLE CALENDAR SYNC =====
C(h1("13. Google Calendar Sync"));
C(p("A Google Apps Script pushes selected Active and Future rows into a Google Calendar. It predates the FarGaze Log project and is documented here from v4.3 because it reads and writes source-sheet columns by position, which makes it sensitive to any column insertion. It is independent of MongoDB \u2014 nothing in this section affects migration or the dashboards."));

C(h2("13.1 Where the Script Lives"));
C(table(["Item","Value"],[
  ["Apps Script project","FarGazeLogMigration \u2014 bound to the Active spreadsheet, single file Code.gs"],
  ["Entry point","migrateToCalendar(e)"],
  ["Menu","\uD83D\uDE80 Far Gaze \u2192 Sync to Calendar (added by onOpen)"],
  ["Trigger","Runs when the Calendar sheet cell Q1 is edited; exits immediately unless Q1 is TRUE"],
  ["Advanced service","Calendar (Calendar.Events.insert / update / remove)"],
  ["Target calendar","A shared family calendar, referenced by calendar ID inside the script"],
  ["Source sheets","Active and Future only. Archive sheets (~2025, 2026) are never synced."],
  ["Not in the Git repository","The script lives in the spreadsheet, not in nullpitch-dev/fargaze-log"],
],[3000,6360]));
C(spacer());

C(h2("13.2 The Calendar Staging Sheet"));
C(p("The script does not read the Active and Future sheets directly. It reads sixteen columns from a helper sheet named Calendar, which is produced by a single spilled ARRAYFORMULA + QUERY in that sheet. Only the anchor cell holds the formula; every other cell displays as plain text. The formula stacks an Active block and a Future block, tags each row with its source sheet name and source row number, then filters to rows where the export flag is Y or U, or where the flag is blank but an Event_ID exists (the deletion case)."));
C(table(["Staging column","Index in script","Contents","Source"],[
  ["A","row[0]","Source sheet name","Literal \"Active\" or \"Future\""],
  ["B","row[1]","Export flag (Y / U / blank)","Column E"],
  ["C","row[2]","Title","Column C"],
  ["D","row[3]","Start date","DATE(I, J, K)"],
  ["E","row[4]","Start time","Column M, blank when 0"],
  ["F","row[5]","Start timezone","VLOOKUP of column H against the TimeDiff sheet; falls back to Europe/London"],
  ["G","row[6]","End date","DATE(P, Q, R)"],
  ["H","row[7]","End time","Column T, blank when 0"],
  ["I","row[8]","End timezone","VLOOKUP of column O against TimeDiff; falls back to Europe/London"],
  ["J","row[9]","All-day flag","TRUE when column M is blank"],
  ["K","row[10]","Description","Column D"],
  ["L","row[11]","Location","Column AA"],
  ["M","row[12]","Participants","Column BD"],
  ["N","row[13]","Sync_Status","Column CG (was CE before v4.3)"],
  ["O","row[14]","Event_ID","Column CH (was CF before v4.3)"],
  ["P","row[15]","Source row number","ROW()"],
],[2000,1700,2600,3060]));
C(spacer());
C(note("Note: the description comes from column D, not from notes (\uBE44\uACE0) in column CF. The notes column is never read by this script."));

C(h2("13.3 The Five Rules"));
C(p("For each staging row the script compares the export flag against Sync_Status and decides what to do:"));
C(table(["Flag","Sync_Status","Action"],[
  ["blank","blank","Skip \u2014 the row was never meant to be synced"],
  ["Y","Synced","Skip \u2014 already in the calendar and unchanged"],
  ["blank","Synced","Delete the calendar event, then clear Sync_Status and Event_ID on the source row"],
  ["Y","blank","Insert a new calendar event, then write Synced and the new Event_ID back"],
  ["U","(any)","Update the existing event by Event_ID, then write Synced and the Event_ID back"],
],[1300,1700,6360]));
C(spacer());
C(p("Anything that is neither Y nor U, and does not match the deletion case, is skipped. After each successful write the script sleeps 1.5 seconds to stay inside the Calendar API quota."));

C(h2("13.4 Write-back Columns \u2014 the Position Hazard"));
C(p("Two functions write back to the source sheet: finalizeSourceRow (on insert or update) and clearSourceStatus (on delete). Both address cells with getRange(rowNum, columnNumber), which is 1-based, whereas the index column in Section 10.1.5 is 0-based. The two numbering systems differ by one, and the column insertions in v3.0 and v4.3 moved both targets."));
C(table(["What the script writes","0-based index","Column letter","getRange() number"],[
  ["Export flag \u2014 set to Y","4","E","5 (never moved)"],
  ["Sync_Status","84","CG","85 (was 83 before v4.3)"],
  ["Event_ID","85","CH","86 (was 84 before v4.3)"],
],[3000,1800,1700,2860]));
C(spacer());
C(note("Warning: the staging formula uses A1-style references (Active!CG:CG, Active!CH:CH), which Google Sheets rewrites automatically when columns are inserted. The getRange() numbers in the script are hard-coded and do NOT rewrite. After any column insertion the two sides disagree: the script reads the correct columns but writes to the old ones. Before v4.3 the stale write targets were CE (\uC8FC\uC81C) and CF (\uBE44\uACE0), so an unpatched run would have overwritten travel themes and notes with Synced markers and calendar event IDs, and would then have re-inserted every event as a duplicate because Sync_Status read back as blank."));

C(h2("13.5 Procedure After Any Column Insertion"));
C(
  num("Insert the new columns in all five sheets"),
  num("Open the Calendar sheet and confirm the staging formula rewrote its Sync_Status and Event_ID references to the new letters"),
  num("Open Extensions \u2192 Apps Script and update the getRange() numbers in finalizeSourceRow and clearSourceStatus, remembering the +1 offset from the 0-based index"),
  num("Save the script \u2014 no deployment step is required, the trigger picks up saved code"),
  num("Update the migration fetch range in scripts/migrate.ts and the column indices in rowToDocument.ts"),
  num("Only then tick Q1 on the Calendar sheet"),
);
C(note("Note: run a single test row before a full sync. If Sync_Status and Event_ID land in the intended columns and no duplicate events appear in the calendar, the patch is correct."));
C(spacer());



C(new Paragraph({ children: [new TextRun({ text: "Appendices", bold: true, size: 28 })], spacing: { before: 280, after: 140 } }));

// ===== APPENDICES =====
C(h1("Appendix A — Conventions & Patterns"));
C(p("Durable engineering conventions distilled from across the project. New work should follow these."));

C(h3("A.1 Key Architecture Decisions"));
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

C(h3("A.2 Data & Query Conventions"));
C(
  bullet("MongoDB date-range queries filter on the local date fields (start.year/month/day) via $expr + $dateFromParts, never on start.datetime (UTC), to avoid timezone-shift errors."),
  bullet("Atlas aggregations always begin with userId as the first match condition."),
  bullet("Filtered aggregations that depend on uniqueness (e.g. unique-people counts) are recomputed server-side — they cannot be derived from marginal totals."),
  bullet("The 6am day boundary (assignDrinkingDate) is the canonical 'when did this day start' rule, shared by the drinking and diet widgets; 아침 (breakfast) records are exempt from the rollback."),
);
C(h3("A.3 Charting Conventions"));
C(
  bullet("CSS/HTML charts are the standard (bars, stacked bars, box plots, histograms, rank-flow). SVG is reserved for splines and overlays."),
  bullet("Summary bars share bars.tsx (Title / BarRow / BarSection) with the barColors palette; trend stacks use StackedBars; ranked flows use CssRankFlowChart."),
  bullet("Colour: useIsDark() + chartColors(isDark) for SVG; categoryColors, rankFlowColors and barColors are kept as separate palettes; spline tension is 0.2."),
  bullet("Each Insights widget follows the same template — Purpose · API / data shape · Summary view · Trend view · Filters · Notes — so new widgets slot in mechanically."),
  bullet("Shared components are extended with optional props, never duplicated. A second widget needing an existing control is a signal to extract that control, not to copy it — Segmented was lifted out of DietWidget into _components/Segmented.tsx on exactly that trigger (v4.2). Where a case really is different, the difference is stated in the code rather than left implicit."),
);
C(h3("A.4 Documentation & Delivery Conventions"));
C(
  bullet("Each regenerated doc is written out in full — every section present, never 'unchanged from vX.X'. The changelog keeps one line per version; the body is the source of truth."),
  bullet("This design doc holds durable spec only. Work status, open questions and the backlog live in the WBS."),
  bullet("Generators (gen-design.js, gen-wbs.js, docx-helpers.js) are patched with targeted edits; .docx outputs are validated before delivery."),
);

C(h1("Appendix B — Directory Map"));
C(table(["Path","Purpose"],[
  ["src/app/insights/page.tsx","Insights master page — CSS columns layout; widget registry (WIDGETS array); ExerciseWidget registered v4.4"],
  ["src/app/insights/_widgets/SleepWidget.tsx","Sleep widget"],
  ["src/app/insights/_widgets/InteractionsWidget.tsx","Interactions widget — Summary restructured v3.6 (two-column stats grid + full-width PeopleBars, no tabs); StackedBarBucket type now local here after the SVG-module retirement"],
  ["src/app/insights/_widgets/DrinkingWidget.tsx","Drinking widget — Summary (restructured v3.6: two-column bar block + People bars, no tabs) + Trend (9 metric tabs), TrendTip component"],
  ["src/app/insights/_widgets/DietWidget.tsx","Diet widget (WBS #61) — Summary view: four compact box plots, spicy HeatStrip + calendar modal, treemap toggles, companions toggle (v3.3–v3.4); its local ModalShell was extracted to _components/ModalShell.tsx at v4.4"],
  ["src/app/insights/_components/charts/BoxPlot.tsx","CSS horizontal box plot — props: min, max, avg, p25, p75, isDark"],
  ["src/app/insights/_components/charts/Histogram.tsx","CSS histogram — props: buckets[] ({label, count}), isDark"],
  ["src/app/insights/_components/charts/css-chart-components.tsx","CSS+SVG chart components: CssTrendChart (right-axis series, xBand, maxXLabels, showValues, compressXLabels, two-line hover tooltip, tiled hover zones, index keys — all v4.5), CssVerticalBoxPlotChart (compact prop v3.4; last-bucket values v4.1), CssDualLineChart, CssRestChart, CssDailyChart (v3.3), CssStackedAreaChart (v4.2), formatBucketLabels, inPlot gridline guard (v4.2) (CssStackedBarChart removed v3.6)"],
  ["src/app/insights/_components/Segmented.tsx","(v4.2) Shared multi-state toggle extracted from DietWidget; generic over string | number; used by DietWidget and WeightTrendView"],
  ["src/app/insights/_components/ModalShell.tsx","(v4.4) Shared portal modal extracted from DietWidget; used by DietWidget and ExerciseWidget"],
  ["src/app/insights/_widgets/WeightWidget.tsx","Weight widget (WBS #54) — shell holding both views and their fetches. Summary: period box plot (non-compact CssVerticalBoxPlotChart, single bucket) beside a Body Composition block of two stacked bars (Average / Latest) with a delta strip between them; local CompositionRow measures itself with a ResizeObserver to decide which figures fit inside each segment. Trend (v4.2) delegates to WeightTrendView and owns granularity, bucket count and unit state, resetting the count when granularity changes"],
  ["src/app/insights/_widgets/WeightTrendView.tsx","(v4.2) Weight Trend view — one CssStackedAreaChart with a three-state unit control (Weight / kg / %), granularity and bucket-count selectors, ISO-to-short label conversion, and the resolved-range header clamped to today"],
  ["src/app/insights/_widgets/ExerciseWidget.tsx","(v4.4, toggle v4.5) Exercise widget (WBS #58). Summary: period counter + HeatStrip row opening a CalendarHeatmap modal; a two-column grid of item blocks, each with its bests line and one chart per box; tapping a block opens a modal holding the daily-total and biggest-set charts. Local helpers fmt, mean, monthYear, bestLines, plainValues. v4.5 adds the ViewToggle in the card header and mounts ExerciseTrendView as the trend branch; card loading/error stay scoped to the Summary"],
  ["src/app/insights/_widgets/ExerciseTrendView.tsx","(v4.5) Exercise Trend view — owns its own fetches. Grain \u00d7 count controls (Weight's options and defaults), resolved-range line, frequency CssTrendChart in band mode left-padded to align over the timeline, Gantt-style item timeline (group headers from activity.name, five-zone opacity cells, per-cell hover tooltip, adaptive cell gap), and a per-item ModalShell with bucket-average charts carrying the dashed right-axis load line"],
  ["src/app/insights/_widgets/weight-colors.ts","(v4.2) SEG / SEG_ORDER / segColor / soloColor — the pinned muscle-fat-other palette, extracted from WeightWidget so the Trend view can import it without a circular dependency"],
  ["src/lib/insights/weight.ts","computeWeightSummary (v4.1) and computeWeightTrend (v4.2) — collapseToDays and buildComposition shared by both; the trend path issues ONE query for the whole span and buckets in memory rather than one query per bucket, because a 400-bucket day request would otherwise be 400 round trips"],
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
  ["src/app/api/insights/stats/route.ts","GET /api/insights/stats — thin dispatcher (v3.4): auth + param parsing; routes metric/mode to the per-widget compute modules below; exercise.summary branch added v4.4 (no date filter passed through \u2014 the compute module cuts the period itself); exercise.trend / exercise.itemTrend branch added v4.5 — resolves the Weight-style grain \u00d7 buckets window (anchor min(period end, today), start snapped to a bucket boundary) and passes it down"],
  ["src/lib/insights/dates.ts","Shared date/period helpers (v3.4): buildDateRange, stepBack, labelForPeriod, currentPeriod, assignDrinkingDate, assignSleepDate, hourStringToMinutes, yesterdayStr, diffDays, SLEEP_THRESHOLD_HOUR"],
  ["src/lib/insights/util.ts","Shared numeric helper (v3.4): percentile"],
  ["src/lib/insights/sleep.ts","computeSleepSummary + QUALITY_SCORE (v3.4)"],
  ["src/lib/insights/interactions.ts","computeInteractionsSummary, computeInteractionsTrendBucket, addTransitioning (v3.4) — no external deps"],
  ["src/lib/insights/drinking.ts","computeDrinkingSummary, computeDrinkingTrendBucket + drinking helpers (computeDailyScores, bucketScore, classifyOccasion, hourStrToDecimal, SCORE_BUCKET_ORDER) (v3.4)"],
  ["src/lib/insights/diet.ts","computeDietSummary (v3.4; computeDietTrend to follow with the Trend view)"],
  ["src/lib/insights/exercise.ts","(v4.4) computeExerciseSummary \u2014 one UNBOUNDED fetch of every \uc6b4\ub3d9 record, period cut in memory on YYYY-MM-DD strings so no MongoDB date filter is needed; boxOf / bestOf / groupByItem / sumByDate helpers; REST_PAUSE and MIN_BOX_DAYS constants"],
  ["src/lib/insights/exercise-trend.ts","(v4.5) computeExerciseTrend and computeExerciseItemTrend \u2014 same unbounded-fetch, cut-in-memory approach; bucketKey/buildBuckets (day / ISO-Monday week / month) with per-bucket period-day counts; grouping read from activity.name; names the \ucd1d marker DAY_TOTAL_MARK rather than repeating the REST_PAUSE misnomer; private date-helper mirrors of exercise.ts — a third copy is the signal to extract them to dates.ts"],
  ["src/models/AlcoholConversion.ts","Mongoose model for alcohol_conversion collection"],
  ["src/models/IngredientMaster.ts","Mongoose model for ingredient_master collection (NEW v3.1); unique index { userId, level2 }"],
  ["src/models/Log.ts","Mongoose model for log collection; food.spiciness added v3.0; food.foods[].ingredients (foodsItemSchema) added v3.1; food.drinks[].ingredients (drinksItemSchema) added v3.2; exercise[].loadKg and exercise[].setStyle added v4.3 to both ILog and LogSchema; alcohols unchanged"],
  ["src/lib/migration/rowToDocument.ts","Maps Google Sheets row to MongoDB document; FOOD_ITEM col 45, DRINK_ITEM col 41; foods AND drinks post-processed via parseFoodIngredients (foods v3.1, drinks v3.2); v4.3 shifts every index after col 71 by +2 and reads exercise[].loadKg (col 72) and exercise[].setStyle (col 73) per item"],
  ["src/lib/migration/transform.ts","Transformation utilities; v3.1 adds parseFoodIngredients(), loadValidLevel2(), resetValidLevel2(), IngredientValidationError"],
  ["src/app/search/page.tsx","Search UI — LogEntry type and DetailPanel; food.spiciness added v3.0; mixed phrase/token query hint (v3.1); client-side tri-state sortable result columns (v3.6)"],
  ["src/app/api/search/route.ts","GET /api/search — Atlas Search primary + regex fallback; parseQuery mixed phrase/token (v3.1); per-field exact-phrase conditions mirrored across the Atlas and regex condition loops (v3.6)"],
  ["scripts/migrate.ts","Daily migration runner; calls loadValidLevel2 at start; uncomment ~2025 block for full re-migration, and re-comment it afterwards; fetch range A:CI from v4.3 (was A:CG)"],
  ["scripts/migrate-alcohol-conversion.ts","One-time migration: reads AlcoholConv sheet → inserts into alcohol_conversion"],
  ["scripts/migrate-ingredient.ts","Seeds ingredient_master from the Ingredient sheet (NEW v3.1); run once, re-run only when the Ingredient sheet changes"],
  ["scripts/fill-historical-ingredients.ts","Fills food.foods[].ingredients on existing rows from embedded REVIEWED_MAP (1,156 entries) + bestGuess fallback; modes: --dry-run, --export-worklist, default write; treats [\"Not Defined\"] as refillable (NEW v3.1)"],
  ["scripts/inspect-ingredients.ts","Survey: docs with foods, items with/without ingredients, Not Defined count, top level2 distribution, samples (NEW v3.1)"],
  ["scripts/reconcile-foods.ts","Re-parses sheets with the live parser and compares against MongoDB; reports gap and per-row errors (NEW v3.1)"],
  ["scripts/scan-bad-parens.ts","Lists every source row whose FOOD or DRINK token has parentheses the parser rejects (NEW v3.1; extended to the drink column v3.2)"],
  ["scripts/fill-historical-drinks.ts","Fills food.drinks[].ingredients from embedded DRINK_MAP (278 reviewed entries) + 아이스/핫 normalisation + substring fallback; modes: --dry-run, --export-worklist, default write; treats [\"Not Defined\"] as refillable (NEW v3.2)"],
  ["scripts/inspect-drinks.ts","Survey for drinks: docs with drinks, items with/without ingredients, Not Defined count, top level2 distribution, samples (NEW v3.2)"],
  ["scripts/inspect-exercise.ts","Survey for exercise: entry and day counts, distinct items and units, records per day, per-year distribution. Does not report loadKg or setStyle"],
  ["scripts/check-exercise-fields.ts","Verifies loadKg and setStyle reached MongoDB after a migration; unwinds exercise[] and prints load by item plus setStyle counts (NEW v4.3)"],
],[3400,5960]));
C(spacer());

// ===== FOOTER =====
C(new Paragraph({ children: [new TextRun({ text: "FarGaze Log — Data Design & Requirements v4.5 — 7 August 2026", italics: true })], spacing: { before: 240 }, alignment: AlignmentType.CENTER }));


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
  fs.writeFileSync("FarGaze-Log-Data-Design-v4.5.docx", buffer);
  console.log("Wrote FarGaze-Log-Data-Design-v4.5.docx (" + buffer.length + " bytes), " + children.length + " elements");
});
