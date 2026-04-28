import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET() {
  await connectDB();
  const userId = 'hyoje';

  const [
    total,
    withStartDatetime,
    withoutStartDatetime,
    allDayCount,
    ongoingCount,
    withCost,
    withExercise,
    withFood,
    withPeople,
    withIncome,
    withGolf,
    headerRows,
  ] = await Promise.all([
    Log.countDocuments({ userId }),
    Log.countDocuments({ userId, 'start.datetime': { $ne: null } }),
    Log.countDocuments({ userId, 'start.datetime': null }),
    Log.countDocuments({ userId, allDay: true }),
    Log.countDocuments({ userId, 'start.datetime': { $ne: null }, 'end.datetime': null }),
    Log.countDocuments({ userId, 'cost.amountKRW': { $ne: null } }),
    Log.countDocuments({ userId, exercise: { $exists: true, $ne: [] } }),
    Log.countDocuments({ userId, 'food.type': { $ne: null } }),
    Log.countDocuments({ userId, people: { $exists: true, $ne: [] } }),
    Log.countDocuments({ userId, 'income.gross': { $ne: null } }),
    Log.countDocuments({ userId, 'golf.score': { $ne: null } }),
    Log.countDocuments({ userId, 'activity.category': 'activity category' }),
  ]);
  const samples = await Log.aggregate([
    { $match: { userId } },
    { $sample: { size: 10 } }
  ]);

function renderFields(doc: any, prefix = ''): string {
  const rows: string[] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (['_id', 'userId', '__v', 'createdAt', 'updatedAt'].includes(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    const fieldName = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      rows.push(`
        <tr>
          <td style="color:#444;padding:2px 8px;width:200px;vertical-align:top">${fieldName}</td>
          <td style="color:#ccc;padding:2px 8px">${value.map((v: any) =>
            typeof v === 'object' ? Object.entries(v)
              .filter(([k, val]) => k !== '_id' && val !== null && val !== '')
              .map(([k, val]) => `<span style="color:#555">${k}:</span> ${val}`)
              .join(' · ')
            : v
          ).join('<br>')}</td>
        </tr>
      `);
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      rows.push(renderFields(value, fieldName));
    } else {
      rows.push(`
        <tr>
          <td style="color:#444;padding:2px 8px;width:200px">${fieldName}</td>
          <td style="color:#ccc;padding:2px 8px">${value instanceof Date ? value.toISOString() : value}</td>
        </tr>
      `);
    }
  }
  return rows.join('');
}


  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FarGaze Log — Data Check</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans', sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: 2rem;
      min-height: 100vh;
    }
    .header {
      border-bottom: 1px solid #222;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    .title {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 1.4rem;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 0.8rem;
      color: #555;
      margin-top: 4px;
      font-family: 'IBM Plex Mono', monospace;
    }
    .section {
      margin-bottom: 2.5rem;
    }
    .section-title {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #444;
      margin-bottom: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    th {
      text-align: left;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #444;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid #1a1a1a;
    }
    td {
      padding: 0.6rem 1rem;
      border-bottom: 1px solid #111;
      color: #ccc;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #111; }
    .num {
      font-family: 'IBM Plex Mono', monospace;
      color: #fff;
      text-align: right;
    }
    .pct {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.75rem;
      color: #444;
      text-align: right;
    }
    .bar-cell { width: 200px; }
    .bar-bg {
      height: 4px;
      background: #1a1a1a;
      border-radius: 2px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: #2E5077;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .good { color: #4ade80; }
    .warn { color: #facc15; }
    .bad { color: #f87171; }
    .total-row td { 
      color: #fff; 
      font-weight: 500;
      border-top: 1px solid #222;
      padding-top: 1rem;
    }
    .timestamp {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      color: #333;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">FarGaze Log / Data Check</div>
    <div class="subtitle">userId: ${userId} · ${new Date().toISOString()}</div>
  </div>

  <div class="section">
    <div class="section-title">Document Counts</div>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th style="text-align:right">Count</th>
          <th style="text-align:right">% of Total</th>
          <th class="bar-cell"></th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${[
          { label: 'Total documents', count: total, total, status: 'good' },
          { label: 'With start datetime', count: withStartDatetime, total, status: withStartDatetime / total > 0.99 ? 'good' : 'warn' },
          { label: 'Without start datetime (allDay/ongoing)', count: withoutStartDatetime, total, status: 'good' },
          { label: 'All-day entries', count: allDayCount, total, status: 'good' },
          { label: 'Ongoing entries (no end time)', count: ongoingCount, total, status: 'good' },
          { label: 'Header rows (should be 0)', count: headerRows, total, status: headerRows === 0 ? 'good' : 'bad' },
        ].map(r => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.count.toLocaleString()}</td>
            <td class="pct">${(r.count / r.total * 100).toFixed(1)}%</td>
            <td class="bar-cell">
              <div class="bar-bg">
                <div class="bar-fill" style="width:${Math.min(r.count / r.total * 100, 100)}%"></div>
              </div>
            </td>
            <td class="${r.status}">${r.status === 'good' ? '✓' : r.status === 'warn' ? '⚠' : '✗'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Field Coverage</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th style="text-align:right">Count</th>
          <th style="text-align:right">% of Total</th>
          <th class="bar-cell"></th>
        </tr>
      </thead>
      <tbody>
        ${[
          { label: 'Has cost (amountKRW)', count: withCost },
          { label: 'Has food entries', count: withFood },
          { label: 'Has people', count: withPeople },
          { label: 'Has exercise', count: withExercise },
          { label: 'Has income', count: withIncome },
          { label: 'Has golf score', count: withGolf },
        ].map(r => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.count.toLocaleString()}</td>
            <td class="pct">${(r.count / total * 100).toFixed(1)}%</td>
            <td class="bar-cell">
              <div class="bar-bg">
                <div class="bar-fill" style="width:${Math.min(r.count / total * 100, 100)}%"></div>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Random Samples (10) — refresh for new samples</div>
    ${samples.map((s: any, idx: number) => `
      <div style="border:1px solid #1a1a1a; border-radius:4px; margin-bottom:1rem; padding:1rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; border-bottom:1px solid #1a1a1a; padding-bottom:0.5rem;">
          <span style="font-family:'IBM Plex Mono',monospace; color:#fff; font-size:0.85rem;">
            #${idx + 1} · ${s.start?.year ?? '?'}-${String(s.start?.month ?? '?').padStart(2,'0')}-${String(s.start?.day ?? '?').padStart(2,'0')}
            ${s.start?.hour ? s.start.hour : '(allday)'}
            ${s.end?.hour ? '→ ' + s.end.hour : ''}
          </span>
          <span style="font-family:'IBM Plex Mono',monospace; color:#444; font-size:0.75rem;">${s._id}</span>
        </div>
        <table style="width:100%; font-size:0.8rem;">
          <tbody>
            ${renderFields(s)}
          </tbody>
        </table>
      </div>
    `).join('')}
  </div>

  <div class="timestamp">Generated at ${new Date().toLocaleString('en-GB')}</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
