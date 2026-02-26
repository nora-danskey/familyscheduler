import { useState, useRef, useEffect } from "react";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function load(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  { id: "1", summary: "Patrick PT", start: { dateTime: "2026-02-24T11:00:00" }, end: { dateTime: "2026-02-24T12:00:00" } },
  { id: "2", summary: "Eric Lander's birthday", start: { date: "2026-02-25" }, end: { date: "2026-02-26" } },
  { id: "3", summary: "Nora in Ojai", start: { date: "2026-02-26" }, end: { date: "2026-03-02" } },
  { id: "4", summary: "Flight to Seattle (AS 375)", start: { dateTime: "2026-02-26T08:00:00" }, end: { dateTime: "2026-02-26T10:00:00" } },
  { id: "5", summary: "MARCH Seahorse #2: SUNDAYS 10:15-10:45", start: { dateTime: "2026-03-01T10:15:00" }, end: { dateTime: "2026-03-01T10:45:00" } },
  { id: "6", summary: "Danskey Mariner Meeting", start: { dateTime: "2026-02-25T14:00:00" }, end: { dateTime: "2026-02-25T15:30:00" } },
  { id: "7", summary: "Arleta info session", start: { dateTime: "2026-02-25T17:00:00" }, end: { dateTime: "2026-02-25T18:00:00" } },
];

const DEFAULT_RULES = [
  { id: "r1", name: "Morning / breakfast", startTime: "07:00", endTime: "08:20", who: "family", days: ["mon","tue","wed","thu","fri"], note: "Preferred together as a family; alternate if one parent is traveling or needs morning hours for work" },
  { id: "r2", name: "School drop-off", startTime: "08:20", endTime: "09:00", who: "alternate", days: ["mon","tue","wed","thu","fri"], note: "Alternate by default" },
  { id: "r3", name: "School pickup", startTime: "16:20", endTime: "17:00", who: "alternate", days: ["mon","tue","wed","thu","fri"], note: "" },
  { id: "r4", name: "Dinner together", startTime: "19:00", endTime: "19:30", who: "family", days: ["mon","tue","wed","thu","fri","sat","sun"], note: "Always together" },
  { id: "r5", name: "Bedtime routine", startTime: "19:30", endTime: "20:30", who: "split", days: ["mon","tue","wed","thu","fri","sat","sun"], note: "Preferred split, solo is fine when needed" },
  { id: "r6", name: "Exercise", startTime: "06:00", endTime: "07:00", who: "each", days: ["mon","tue","wed","thu","fri","sat","sun"], note: "1 hour each, daily, any time during waking hours — schedule flexibly around other commitments" },
];

const WHO_OPTIONS = [
  { id: "family", label: "Family together", color: "#8E24AA" },
  { id: "nora", label: "Nora", color: "#7986CB" },
  { id: "patrick", label: "Patrick", color: "#33B679" },
  { id: "alternate", label: "Alternate (fair split)", color: "#F6BF26" },
  { id: "split", label: "Split (each takes a kid)", color: "#E67C73" },
  { id: "each", label: "Each independently", color: "#0B8043" },
];

const TAG_OPTIONS = [
  { id: "nora", label: "Nora's", color: "#7986CB" },
  { id: "patrick", label: "Patrick's", color: "#33B679" },
  { id: "both", label: "Both", color: "#8E24AA" },
  { id: "kids-nora", label: "Kids → Nora covers", color: "#7986CB" },
  { id: "kids-patrick", label: "Kids → Patrick covers", color: "#33B679" },
  { id: "kids-both", label: "Kids → Both", color: "#8E24AA" },
  { id: "coverage", label: "Needs coverage", color: "#F6BF26" },
  { id: "ignore", label: "Ignore", color: "#6B7280" },
];

const BLOCK_COLORS = {
  family:   { bg: "#8E24AA18", border: "#8E24AA", text: "#C084FC" },
  nora:     { bg: "#7986CB18", border: "#7986CB", text: "#93A8F4" },
  patrick:  { bg: "#33B67918", border: "#33B679", text: "#4ADE80" },
  kids:     { bg: "#E67C7318", border: "#E67C73", text: "#FCA5A5" },
  chores:   { bg: "#F6BF2618", border: "#F6BF26", text: "#FDE68A" },
  exercise: { bg: "#0B804318", border: "#0B8043", text: "#6EE7B7" },
  work:     { bg: "#03468818", border: "#3B82F6", text: "#7DD3FC" },
  free:     { bg: "#37415118", border: "#4B5563", text: "#9CA3AF" },
  alternate:{ bg: "#F6BF2618", border: "#F6BF26", text: "#FDE68A" },
  split:    { bg: "#E67C7318", border: "#E67C73", text: "#FCA5A5" },
};

// ─── SCHEDULE PARSING HELPERS ─────────────────────────────────────────────────
function parseScheduleRobust(text) {
  const startIdx = text.indexOf("<SCHEDULE>");
  if (startIdx === -1) return null;
  const inner = text.slice(startIdx + "<SCHEDULE>".length);
  const endIdx = inner.indexOf("</SCHEDULE>");
  if (endIdx !== -1) {
    try { return JSON.parse(inner.slice(0, endIdx).trim()); } catch {}
  }
  // Fallback: brace-count to extract complete day objects from truncated JSON
  const days = [];
  let depth = 0, start = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (inner[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try { const obj = JSON.parse(inner.slice(start, i + 1)); if (obj.date) days.push(obj); } catch {}
        start = -1;
      }
    }
  }
  return days.length > 0 ? days : null;
}

function normalizeBlocks(days) {
  return days.map(day => ({
    ...day,
    blocks: (day.blocks || []).map(b => ({
      start: b.start || b.s || "",
      end: b.end || b.e || "",
      title: b.title || b.t || "",
      who: b.who || b.w || "",
      note: b.note || b.n || "",
    }))
  }));
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(a, b, events, labels, rules) {
  const tagLines = Object.entries(labels).map(([id, tag]) => {
    const ev = events.find(e => e.id === id);
    return ev ? `"${ev.summary}" → ${tag}` : null;
  }).filter(Boolean).join("\n");

  const ruleLines = rules.map(r =>
    `- ${r.name}: ${r.startTime}–${r.endTime}, assigned: ${r.who}, days: ${r.days.join(",")}${r.note ? ` (${r.note})` : ""}`
  ).join("\n");

  return `CRITICAL OUTPUT RULES — follow exactly, no exceptions:
1. When suggesting a schedule: output ONLY <SCHEDULE>...</SCHEDULE> then <SUMMARY>...</SUMMARY> then 2 plain sentences. NO text before <SCHEDULE>. NO markdown. NO headers.
2. Use compact block keys: {"s":"HH:MM","e":"HH:MM","t":"title","w":"who"} — nothing else in each block.
3. Labels must be "Day Date" only e.g. "Mon Feb 24" — no annotations.
4. Include ALL 14 days in <SCHEDULE>. WHO values: "family","nora","patrick","work","exercise","kids","free","split","alternate"
5. <SUMMARY> format: {"week1":{"nora":{"workHours":0,"parentingHours":0,"exerciseHours":0,"freeHours":0},"patrick":{...},"notes":"..."},"week2":{...}}

You are a warm family scheduling assistant for ${a} and ${b}. Suggest practical rhythms, not micromanagement.

HOUSEHOLD RULES:
${ruleLines}

WORK HOURS RULES:
- Each parent needs exactly 45 hours/week of work
- Work can happen 6am–10pm, but ONLY when the other parent is with the kids during kid-coverage windows
- Kid coverage windows: 7:00am–9:00am (morning) and 4:20pm–10:00pm (evening/night)
- Dinner together 7:00–7:30pm is sacred — neither parent works then
- Bedtime 7:30–8:30pm: both parents engaged with kids (split or one solo)
- Work travel days: assume traveling parent works 9 hours that day
- When one parent is traveling: home parent covers all kid tasks; solo parenting hours bank as equity

FIXED DAILY ANCHORS:
- Morning/breakfast: 7:00–8:20am (preferred together; alternate if one parent traveling or needs morning work hours)
- Drop-off: 8:20–9:00am · Pickup: 4:20–5:00pm
- Dinner together: 7:00–7:30pm (always, no exceptions)
- Bedtime: 7:30–8:30pm (preferred split, one solo OK)
- Exercise: 1 hour each, daily, any time during waking hours

EVENT TAGS: ${tagLines || "None yet."}
CALENDAR DATA sent with each message.`;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getWeekDays(startDate) {
  const days = []; const d = new Date(startDate);
  for (let i = 0; i < 14; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}
function getEventsForDay(events, day) {
  return events.filter(ev => {
    const dayStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
    if (ev.start?.date) return dayStr >= ev.start.date && dayStr < (ev.end?.date || ev.start.date);
    return ev.start?.dateTime?.split("T")[0] === dayStr;
  });
}
function timeToMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m) {
  const h = Math.floor(m / 60); const min = m % 60;
  const ampm = h >= 12 ? "pm" : "am"; const h12 = h % 12 || 12;
  return `${h12}:${min.toString().padStart(2,"0")}${ampm}`;
}
function tagColor(tag) {
  if (!tag) return "#4B5563";
  if (tag === "nora") return "#7986CB";
  if (tag === "patrick") return "#33B679";
  if (tag === "both") return "#8E24AA";
  if (tag.startsWith("kids")) return "#E67C73";
  if (tag.startsWith("coverage")) return "#F6BF26";
  return "#6B7280";
}
function resolveBlockColor(who, a, b) {
  const w = who?.toLowerCase();
  if (w === "family") return BLOCK_COLORS.family;
  if (w === a?.toLowerCase() || w === "nora") return BLOCK_COLORS.nora;
  if (w === b?.toLowerCase() || w === "patrick") return BLOCK_COLORS.patrick;
  if (w === "work") return BLOCK_COLORS.work;
  if (w === "exercise") return BLOCK_COLORS.exercise;
  return BLOCK_COLORS[w] || BLOCK_COLORS.free;
}

// ─── DAY TIMELINE ─────────────────────────────────────────────────────────────
function DayTimeline({ day, partnerAName, partnerBName }) {
  const START = 6 * 60, END = 22 * 60, TOTAL = END - START, H = 480;
  const hours = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];

  const noraBlocks = day.blocks.filter(b => {
    const w = b.who?.toLowerCase();
    return w === "nora" || w === partnerAName?.toLowerCase() || w === "work" || w === "exercise" || w === "free";
  });
  const patrickBlocks = day.blocks.filter(b => {
    const w = b.who?.toLowerCase();
    return w === "patrick" || w === partnerBName?.toLowerCase() || w === "work" || w === "exercise" || w === "free";
  });
  const sharedBlocks = day.blocks.filter(b => {
    const w = b.who?.toLowerCase();
    return w === "family" || w === "split" || w === "alternate" || w === "kids";
  });

  function renderBlock(block, forPerson) {
    const startMin = timeToMin(block.start);
    const endMin = timeToMin(block.end);
    const top = Math.max(0, ((startMin - START) / TOTAL) * H);
    const height = Math.max(14, ((endMin - startMin) / TOTAL) * H);

    let c = resolveBlockColor(block.who, partnerAName, partnerBName);
    // Work blocks get person-specific color tint
    if (block.who?.toLowerCase() === "work") {
      c = forPerson === "nora" ? { ...BLOCK_COLORS.work, border: "#7986CB", text: "#93A8F4" } : { ...BLOCK_COLORS.work, border: "#33B679", text: "#4ADE80" };
    }

    return (
      <div key={`${block.start}-${block.title}-${forPerson}`} style={{
        position: "absolute", left: "2px", right: "2px",
        top: top + "px", height: height + "px",
        background: c.bg, borderLeft: `3px solid ${c.border}`,
        borderRadius: "0 4px 4px 0", padding: "2px 5px", overflow: "hidden",
      }} title={`${block.title} · ${minToTime(startMin)}–${minToTime(endMin)}${block.note ? ` · ${block.note}` : ""}`}>
        <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: c.text, fontWeight: 500, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {block.title}
        </div>
        {height > 26 && <div style={{ fontSize: "0.5rem", color: c.border + "99", fontFamily: "'DM Mono', monospace" }}>{minToTime(startMin)}–{minToTime(endMin)}</div>}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>{day.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr", gap: "4px" }}>
        <div style={{ position: "relative", height: H + "px" }}>
          {hours.map(h => (
            <div key={h} style={{ position: "absolute", top: (((h * 60 - START) / TOTAL) * H) - 7 + "px", right: "3px", fontSize: "0.48rem", fontFamily: "'DM Mono', monospace", color: "#374151" }}>
              {h > 12 ? `${h-12}p` : h === 12 ? "12p" : `${h}a`}
            </div>
          ))}
        </div>
        {[["nora", partnerAName, "#7986CB"], ["patrick", partnerBName, "#33B679"]].map(([key, name, color]) => {
          const personBlocks = key === "nora" ? noraBlocks : patrickBlocks;
          return (
            <div key={key}>
              <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color, textAlign: "center", marginBottom: "4px" }}>{name}</div>
              <div style={{ position: "relative", height: H + "px", background: "rgba(255,255,255,0.015)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                {hours.map(h => (
                  <div key={h} style={{ position: "absolute", top: (((h * 60 - START) / TOTAL) * H) + "px", left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,0.03)" }} />
                ))}
                {sharedBlocks.map(b => renderBlock(b, key))}
                {personBlocks.map(b => renderBlock(b, key))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TWO-WEEK SCHEDULE GRID ───────────────────────────────────────────────────
function ScheduleGrid({ scheduleDays, onDayClick, selectedDay, partnerAName, partnerBName }) {
  if (!scheduleDays.length) return (
    <div style={{ textAlign: "center", padding: "3rem 0", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem" }}>
      Ask the AI to suggest a schedule — it'll appear here
    </div>
  );

  const week1 = scheduleDays.filter((_, i) => i < 7);
  const week2 = scheduleDays.filter((_, i) => i >= 7);

  const blockColorDot = (who, a, b) => {
    const w = who?.toLowerCase();
    if (w === "family" || w === "split" || w === "alternate") return "#8E24AA";
    if (w === "nora" || w === a?.toLowerCase()) return "#7986CB";
    if (w === "patrick" || w === b?.toLowerCase()) return "#33B679";
    if (w === "work") return "#3B82F6";
    if (w === "exercise") return "#0B8043";
    return "#4B5563";
  };

  function WeekRow({ days, label }) {
    // Pad to 7 days
    const padded = [...days];
    while (padded.length < 7) padded.push(null);
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#6B7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
          {padded.map((day, i) => {
            if (!day) return <div key={i} style={{ background: "rgba(255,255,255,0.01)", borderRadius: "6px", minHeight: "70px", border: "1px dashed rgba(255,255,255,0.04)" }} />;
            const isSelected = selectedDay === day.date;
            return (
              <div key={day.date} onClick={() => onDayClick(day.date)} style={{
                background: isSelected ? "rgba(249,220,92,0.08)" : "rgba(255,255,255,0.03)",
                border: isSelected ? "1px solid rgba(249,220,92,0.35)" : "1px solid rgba(255,255,255,0.07)",
                borderRadius: "6px", padding: "6px 5px", minHeight: "140px", cursor: "pointer",
              }}>
                <div style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: isSelected ? "#F9DC5C" : "#6B7280", marginBottom: "5px" }}>
                  {day.label.split(" ")[0].toUpperCase()}<br />
                  <span style={{ fontSize: "0.85rem", fontFamily: "'Playfair Display', serif", color: isSelected ? "#F9DC5C" : "#E5E7EB" }}>{new Date(day.date + "T12:00:00").getDate()}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {day.blocks.map((b, j) => {
                    const bc = blockColorDot(b.who, partnerAName, partnerBName);
                    return (
                      <div key={j} style={{ fontSize: "0.52rem", color: bc, fontFamily: "'DM Mono', monospace", borderLeft: `2px solid ${bc}40`, paddingLeft: "3px" }}>
                        <div style={{ opacity: 0.55, fontSize: "0.48rem" }}>{b.start}</div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <WeekRow days={week1} label="Week 1" />
      <WeekRow days={week2} label="Week 2" />
    </div>
  );
}

// ─── WEEKLY TOTALS ────────────────────────────────────────────────────────────
function WeeklyTotals({ summary, partnerAName, partnerBName }) {
  if (!summary) return null;

  function TotalsCard({ weekLabel, data }) {
    if (!data) return null;
    const { nora, patrick, notes } = data;
    const a = nora, b = patrick;
    const cats = [
      { label: "Work", aVal: a?.workHours, bVal: b?.workHours, color: "#3B82F6", target: 45 },
      { label: "Parenting", aVal: a?.parentingHours, bVal: b?.parentingHours, color: "#E67C73" },
      { label: "Exercise", aVal: a?.exerciseHours, bVal: b?.exerciseHours, color: "#0B8043" },
      { label: "Free time", aVal: a?.freeHours, bVal: b?.freeHours, color: "#8E24AA" },
    ];
    return (
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
        <div style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px" }}>{weekLabel}</div>
        {cats.map(cat => {
          const total = (cat.aVal || 0) + (cat.bVal || 0) || 1;
          const aPct = Math.round(((cat.aVal || 0) / total) * 100);
          const offTarget = cat.target && Math.abs((cat.aVal || 0) - cat.target) > 2;
          return (
            <div key={cat.label} style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: "#6B7280", marginBottom: "3px" }}>
                <span style={{ color: "#9CA3AF" }}>{cat.label}</span>
                <span>
                  <span style={{ color: "#7986CB" }}>{partnerAName} {cat.aVal || 0}h</span>
                  <span style={{ color: "#374151" }}> · </span>
                  <span style={{ color: "#33B679" }}>{partnerBName} {cat.bVal || 0}h</span>
                  {cat.target && <span style={{ color: offTarget ? "#F87171" : "#4B5563", marginLeft: "4px" }}>/{cat.target}h target</span>}
                </span>
              </div>
              <div style={{ height: "5px", background: "rgba(255,255,255,0.05)", borderRadius: "99px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${aPct}%`, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}88)`, borderRadius: "99px", transition: "width 0.4s" }} />
              </div>
            </div>
          );
        })}
        {notes && <div style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: "#F9DC5C", background: "rgba(249,220,92,0.06)", border: "1px solid rgba(249,220,92,0.12)", borderRadius: "6px", padding: "6px 8px", marginTop: "4px" }}>⚖ {notes}</div>}
      </div>
    );
  }

  return (
    <div>
      <TotalsCard weekLabel="Week 1 totals" data={summary.week1} />
      <TotalsCard weekLabel="Week 2 totals" data={summary.week2} />
    </div>
  );
}

// ─── GCAL STRIP ───────────────────────────────────────────────────────────────
function GCalStrip({ events, startDate, eventLabels, onEventClick }) {
  const days = getWeekDays(startDate);

  function DayCell({ day }) {
    const dayStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
    const dayEvents = getEventsForDay(events, day);
    const isToday = day.toDateString() === new Date().toDateString();

    function fmtTime(dt) {
      if (!dt) return "";
      const d = new Date(dt);
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }

    return (
      <div style={{
        background: isToday ? "rgba(249,220,92,0.05)" : "rgba(255,255,255,0.03)",
        border: isToday ? "1px solid rgba(249,220,92,0.2)" : "1px solid rgba(255,255,255,0.06)",
        borderRadius: "8px", padding: "6px 5px", minHeight: "140px",
      }}>
        <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: isToday ? "#F9DC5C" : "#6B7280", marginBottom: "5px" }}>
          {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<br />
          <span style={{ fontSize: "0.9rem", fontFamily: "'Playfair Display', serif", color: isToday ? "#F9DC5C" : "#E5E7EB" }}>{day.getDate()}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {dayEvents.map((ev, j) => {
            const tc = tagColor(eventLabels[ev.id]);
            const time = ev.start?.dateTime ? fmtTime(ev.start.dateTime) : "";
            return (
              <div key={j} onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                style={{ fontSize: "0.55rem", background: tc + "18", borderLeft: `2px solid ${tc}`, color: tc, borderRadius: "2px", padding: "2px 3px", cursor: "pointer" }}
                title={ev.summary}>
                {time && <div style={{ opacity: 0.65, fontSize: "0.5rem" }}>{time}</div>}
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.summary}</div>
              </div>
            );
          })}
          {dayEvents.length === 0 && <div style={{ fontSize: "0.5rem", color: "#374151", fontFamily: "'DM Mono', monospace" }}>—</div>}
        </div>
      </div>
    );
  }

  function WeekRow({ weekDays, label }) {
    return (
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", color: "#6B7280", marginBottom: "4px", textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
          {weekDays.map((day, i) => <DayCell key={i} day={day} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <WeekRow weekDays={days.slice(0, 7)} label="Week 1" />
      <WeekRow weekDays={days.slice(7, 14)} label="Week 2" />
    </div>
  );
}

// ─── EVENT TAG POPUP ──────────────────────────────────────────────────────────
function EventTagPopup({ event, currentTag, onSelect, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#1A1D24", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "14px", padding: "18px", minWidth: "260px", maxWidth: "300px" }} onClick={e => e.stopPropagation()}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", color: "#F3F4F6", marginBottom: "3px", fontStyle: "italic" }}>{event.summary}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", color: "#6B7280", marginBottom: "12px" }}>Who owns this event?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {TAG_OPTIONS.map(tag => (
            <button key={tag.id} onClick={() => onSelect(event.id, tag.id)} style={{ padding: "6px 10px", borderRadius: "6px", border: "none", cursor: "pointer", background: currentTag === tag.id ? tag.color + "25" : "rgba(255,255,255,0.04)", borderLeft: `3px solid ${tag.color}`, color: currentTag === tag.id ? tag.color : "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", textAlign: "left" }}>
              {currentTag === tag.id ? "✓ " : ""}{tag.label}
            </button>
          ))}
          {currentTag && <button onClick={() => onSelect(event.id, null)} style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", cursor: "pointer", marginTop: "2px" }}>Remove tag</button>}
        </div>
      </div>
    </div>
  );
}

// ─── RULES EDITOR ─────────────────────────────────────────────────────────────
function RulesEditor({ rules, setRules, onClose }) {
  const [editing, setEditing] = useState(null);
  const days = ["mon","tue","wed","thu","fri","sat","sun"];
  function updateRule(id, field, val) { setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r)); }
  function toggleDay(id, day) { setRules(prev => prev.map(r => { if (r.id !== id) return r; const d = r.days.includes(day) ? r.days.filter(x => x !== day) : [...r.days, day]; return { ...r, days: d }; })); }
  function addRule() { const id = "r" + Date.now(); setRules(prev => [...prev, { id, name: "New anchor", startTime: "08:00", endTime: "09:00", who: "family", days: ["mon","tue","wed","thu","fri"], note: "" }]); setEditing(id); }
  const whoColors = { family: "#8E24AA", nora: "#7986CB", patrick: "#33B679", alternate: "#F6BF26", split: "#E67C73", each: "#0B8043" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#13151A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "20px", width: "500px", maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", color: "#F3F4F6", fontStyle: "italic" }}>Household Rules</p>
            <p style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: "#6B7280", marginTop: "2px" }}>Standing anchors applied every day — AI adjusts around actual events</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
        </div>
        {rules.map(rule => (
          <div key={rule.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "10px", marginBottom: "6px" }}>
            {editing === rule.id ? (
              <div>
                <input value={rule.name} onChange={e => updateRule(rule.id, "name", e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px", padding: "5px 8px", color: "#E5E7EB", fontFamily: "'DM Mono', monospace", fontSize: "0.75rem", marginBottom: "7px", outline: "none" }} />
                <div style={{ display: "flex", gap: "7px", marginBottom: "7px" }}>
                  {[["START", "startTime"], ["END", "endTime"]].map(([lbl, field]) => (
                    <div key={field} style={{ flex: 1 }}>
                      <label style={{ fontSize: "0.58rem", color: "#6B7280", fontFamily: "'DM Mono', monospace", display: "block", marginBottom: "2px" }}>{lbl}</label>
                      <input type="time" value={rule[field]} onChange={e => updateRule(rule.id, field, e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px", padding: "4px 7px", color: "#E5E7EB", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", outline: "none" }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: "7px" }}>
                  <label style={{ fontSize: "0.58rem", color: "#6B7280", fontFamily: "'DM Mono', monospace", display: "block", marginBottom: "3px" }}>ASSIGNED TO</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                    {WHO_OPTIONS.map(w => (
                      <button key={w.id} onClick={() => updateRule(rule.id, "who", w.id)} style={{ padding: "2px 7px", borderRadius: "4px", border: "none", background: rule.who === w.id ? w.color + "28" : "rgba(255,255,255,0.05)", color: rule.who === w.id ? w.color : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", cursor: "pointer" }}>{w.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "3px", marginBottom: "7px" }}>
                  {days.map(d => (
                    <button key={d} onClick={() => toggleDay(rule.id, d)} style={{ padding: "2px 5px", borderRadius: "3px", border: "none", background: rule.days.includes(d) ? "#7986CB28" : "rgba(255,255,255,0.04)", color: rule.days.includes(d) ? "#7986CB" : "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.58rem", cursor: "pointer", textTransform: "uppercase" }}>{d[0].toUpperCase()}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "5px" }}>
                  <button onClick={() => setEditing(null)} style={{ padding: "4px 10px", background: "#7986CB", border: "none", borderRadius: "5px", color: "#0D0F14", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", cursor: "pointer" }}>Done</button>
                  <button onClick={() => setRules(prev => prev.filter(r => r.id !== rule.id))} style={{ padding: "4px 10px", background: "transparent", border: "1px solid rgba(255,0,0,0.2)", borderRadius: "5px", color: "#F87171", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setEditing(rule.id)}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: whoColors[rule.who] || "#6B7280" }} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.75rem", color: "#E5E7EB" }}>{rule.name}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", color: "#6B7280" }}>{rule.startTime}–{rule.endTime}</span>
                  </div>
                  <div style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "1px", marginLeft: "14px" }}>{rule.who} · {rule.days.map(d => d[0].toUpperCase()).join(" ")}</div>
                </div>
                <span style={{ color: "#4B5563", fontSize: "0.7rem" }}>✏</span>
              </div>
            )}
          </div>
        ))}
        <button onClick={addRule} style={{ width: "100%", padding: "7px", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.09)", borderRadius: "6px", color: "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", cursor: "pointer", marginTop: "3px" }}>+ Add anchor</button>
      </div>
    </div>
  );
}

// ─── MESSAGE ──────────────────────────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === "user";
  const display = isUser ? msg.content.replace(/^CALENDAR DATA:[\s\S]*?USER:\s*/m, "") : msg.content;
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "10px" }}>
      {!isUser && <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.58rem", flexShrink: 0, marginRight: "6px", marginTop: "2px" }}>✦</div>}
      <div style={{ maxWidth: "82%", padding: "8px 12px", borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: isUser ? "rgba(249,220,92,0.09)" : "rgba(255,255,255,0.05)", border: isUser ? "1px solid rgba(249,220,92,0.16)" : "1px solid rgba(255,255,255,0.07)", fontSize: "0.8rem", lineHeight: 1.65, color: "#E5E7EB", fontFamily: "'Lora', serif", whiteSpace: "pre-wrap" }}>
        {display}
        {msg.gcalEvents && <div style={{ marginTop: "7px", padding: "5px 9px", background: "rgba(51,182,121,0.1)", border: "1px solid rgba(51,182,121,0.28)", borderRadius: "6px", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✓ {msg.gcalEvents.length} events ready to push</div>}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FamilyScheduler() {
  const [view, setView] = useState(() => load("fs_setup_done", false) ? "app" : "setup");
  const [gcalToken, setGcalToken] = useState(() => load("fs_gcal_token", ""));
  const [gcalTokenTime, setGcalTokenTime] = useState(() => load("fs_gcal_token_time", null));
  const [calendarId, setCalendarId] = useState(() => load("fs_cal_id", "primary"));
  const [partnerAName, setPartnerAName] = useState(() => load("fs_name_a", "Nora"));
  const [partnerBName, setPartnerBName] = useState(() => load("fs_name_b", "Patrick"));
  const [events, setEvents] = useState(DEMO_EVENTS);
  const [messages, setMessages] = useState(() => load("fs_messages", []));
  const [eventLabels, setEventLabels] = useState(() => load("fs_labels", {}));
  const [rules, setRules] = useState(() => load("fs_rules", DEFAULT_RULES));
  const [scheduleDays, setScheduleDays] = useState(() => load("fs_schedule", []));
  const [summary, setSummary] = useState(() => load("fs_summary", null));
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showRules, setShowRules] = useState(false);
  // Tabs: "calendar" (gcal) | "schedule-2wk" | "schedule-day" | "totals"
  const [activeTab, setActiveTab] = useState("calendar");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingGcalEvents, setPendingGcalEvents] = useState(null);
  const [calLoading, setCalLoading] = useState(false);
  const chatEndRef = useRef(null);

  const startDate = (() => {
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); return d;
  })();

  useEffect(() => { save("fs_messages", messages.slice(-60)); }, [messages]);
  useEffect(() => { save("fs_labels", eventLabels); }, [eventLabels]);
  useEffect(() => { save("fs_name_a", partnerAName); }, [partnerAName]);
  useEffect(() => { save("fs_name_b", partnerBName); }, [partnerBName]);
  useEffect(() => { save("fs_gcal_token", gcalToken); }, [gcalToken]);
  useEffect(() => { save("fs_gcal_token_time", gcalTokenTime); }, [gcalTokenTime]);
  useEffect(() => { save("fs_cal_id", calendarId); }, [calendarId]);
  useEffect(() => { save("fs_rules", rules); }, [rules]);
  useEffect(() => { save("fs_schedule", scheduleDays); }, [scheduleDays]);
  useEffect(() => { save("fs_summary", summary); }, [summary]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadGoogleCalendar() {
    save("fs_setup_done", true);
    if (!gcalToken) { setView("app"); return; }
    setCalLoading(true);
    try {
      const twoWeeksOut = new Date(startDate.getTime() + 14 * 86400000);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=100&orderBy=startTime&singleEvents=true&timeMin=${startDate.toISOString()}&timeMax=${twoWeeksOut.toISOString()}`,
        { headers: { Authorization: `Bearer ${gcalToken}` } }
      );
      const data = await res.json();
      if (data.items) setEvents(data.items);
    } catch {}
    setCalLoading(false);
    setView("app");
  }

  async function pushToGCal(evs) {
    if (!gcalToken) { alert("Demo mode — no GCal token."); return; }
    let pushed = 0;
    for (const ev of evs) {
      try {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          { method: "POST", headers: { Authorization: `Bearer ${gcalToken}`, "Content-Type": "application/json" }, body: JSON.stringify(ev) });
        pushed++;
      } catch {}
    }
    alert(`✓ Pushed ${pushed}/${evs.length} events.`);
    setPendingGcalEvents(null);
  }

  function handleEventTag(id, tag) {
    setEventLabels(prev => { const u = { ...prev }; if (tag === null) delete u[id]; else u[id] = tag; return u; });
    setSelectedEvent(null);
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const calData = JSON.stringify(events.slice(0, 30), null, 2);
    const tagLines = Object.entries(eventLabels).map(([id, tag]) => {
      const ev = events.find(e => e.id === id);
      return ev ? `"${ev.summary}" → ${tag}` : null;
    }).filter(Boolean).join("\n");

    const isScheduleReq = /schedule|suggest|two.?week|2.week/i.test(text);
    const fmtReminder = isScheduleReq ? "\n\n[OUTPUT FORMAT REQUIRED: <SCHEDULE>[{\"date\":\"YYYY-MM-DD\",\"label\":\"Mon Feb 24\",\"blocks\":[{\"s\":\"HH:MM\",\"e\":\"HH:MM\",\"t\":\"title\",\"w\":\"who\"}]}]</SCHEDULE> then <SUMMARY>{\"week1\":{\"nora\":{\"workHours\":0,\"parentingHours\":0,\"exerciseHours\":0,\"freeHours\":0},\"patrick\":{...},\"notes\":\"\"},\"week2\":{...}}</SUMMARY> then max 2 plain sentences. Output SCHEDULE tag FIRST. No text before it. Include all 14 days.]" : "";
    const userMsg = { role: "user", content: `CALENDAR DATA:\n${calData}\n\nEVENT TAGS:\n${tagLines || "None"}\n\nUSER: ${text}${fmtReminder}` };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    // Strip calendar data from history to avoid sending it repeatedly
    const recentMsgs = newMsgs.slice(-8);
    const apiMsgs = recentMsgs.map((m, i) => {
      const isLast = i === recentMsgs.length - 1;
      const content = (!isLast && m.role === "user")
        ? m.content.replace(/^CALENDAR DATA:[\s\S]*?USER:\s*/m, "")
        : m.content;
      return { role: m.role, content };
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 4000,
          system: buildSystemPrompt(partnerAName, partnerBName, events, eventLabels, rules),
          messages: apiMsgs,
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        const bodyText = await res.text().catch(() => "(unreadable)");
        console.error("Non-JSON response:", res.status, bodyText.slice(0, 500));
        setMessages(prev => [...prev, { role: "assistant", content: `Error ${res.status} — check console for details.` }]);
        setLoading(false); return;
      }
      if (!res.ok) {
        const errMsg = data?.details?.error?.message || data?.error || `Error ${res.status}`;
        console.error("API error:", data);
        setMessages(prev => [...prev, { role: "assistant", content: `Something went wrong: ${errMsg}` }]);
        setLoading(false); return;
      }
      const raw = data.content?.[0]?.text || "Something went wrong.";

      const parsed = parseScheduleRobust(raw);
      if (parsed && parsed.length > 0) {
        const normalized = normalizeBlocks(parsed);
        setScheduleDays(prev => {
          const map = {};
          prev.forEach(d => map[d.date] = d);
          normalized.forEach(d => map[d.date] = d);
          return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
        });
        setSelectedDay(normalized[0].date);
        setActiveTab("schedule-2wk");
      }

      // Parse SUMMARY
      const sumMatch = raw.match(/<SUMMARY>([\s\S]*?)<\/SUMMARY>/);
      if (sumMatch) {
        try { setSummary(JSON.parse(sumMatch[1].trim())); } catch {}
      }

      // Parse GCAL
      const gcalMatch = raw.match(/<GCAL_EVENTS>([\s\S]*?)<\/GCAL_EVENTS>/);
      let gcalEvents = null;
      if (gcalMatch) { try { gcalEvents = JSON.parse(gcalMatch[1].trim()); setPendingGcalEvents(gcalEvents); } catch {} }

      // Show only text before <SCHEDULE> — simple split avoids any regex edge cases
      const displayText = raw.split("<SCHEDULE>")[0]
        .replace(/<SUMMARY>[\s\S]*?<\/SUMMARY>/g, "")
        .replace(/<GCAL_EVENTS>[\s\S]*?<\/GCAL_EVENTS>/g, "")
        .trim();
      setMessages(prev => [...prev, { role: "assistant", content: displayText, gcalEvents }]);
    } catch (e) {
      console.error("sendMessage error:", e);
      setMessages(prev => [...prev, { role: "assistant", content: `Something went wrong: ${e.message}` }]);
    }
    setLoading(false);
  }

  const selectedDayData = scheduleDays.find(d => d.date === selectedDay);
  const quickPrompts = [
    `Suggest a fair two-week schedule using our household rules`,
    `Nora is in Ojai Wed–Sun — map out Patrick's solo days and rebalance next week`,
    `Show me a typical weekday`,
    `Who's carrying more load right now?`,
    `Push schedule to Google Calendar`,
  ];

  const TABS = [
    { id: "calendar", label: "My Calendar" },
    { id: "schedule-2wk", label: "Suggested · 2-Week" },
    { id: "schedule-day", label: `Suggested · Day${selectedDayData ? ` (${selectedDayData.label})` : ""}` },
    { id: "totals", label: "Totals" },
  ];

  // ── SETUP ──
  if (view === "setup") {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital@0;1&family=DM+Mono:wght@400;500&display=swap'); *{box-sizing:border-box;margin:0;padding:0} body{background:#0D0F14} input{outline:none} ::placeholder{color:#4B5563} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ minHeight: "100vh", background: "#0D0F14", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "'Lora', serif" }}>
          <div style={{ maxWidth: "460px", width: "100%", animation: "fadeUp 0.5s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "3rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>◎</div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2.2rem", color: "#F3F4F6", fontWeight: 400 }}>Family Scheduler</h1>
              <p style={{ color: "#6B7280", marginTop: "0.75rem", fontSize: "0.95rem" }}>A fair two-week schedule, built together.</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "2rem" }}>
              {[["Your name", partnerAName, setPartnerAName, "e.g. Nora"], ["Partner's name (the traveler)", partnerBName, setPartnerBName, "e.g. Patrick"]].map(([lbl, val, set, ph]) => (
                <div key={lbl} style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>{lbl}</label>
                  <input value={val} onChange={e => set(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.9rem", fontFamily: "'Lora', serif" }} placeholder={ph} />
                </div>
              ))}
              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "1.5rem 0" }} />
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>Google Calendar OAuth Token <span style={{ color: "#4B5563" }}>(optional)</span></label>
                <input value={gcalToken} onChange={e => { setGcalToken(e.target.value); setGcalTokenTime(Date.now()); }} type="password" style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.85rem", fontFamily: "'DM Mono', monospace" }} placeholder="ya29.a0A..." />
                <p style={{ fontSize: "0.72rem", color: "#4B5563", marginTop: "6px", lineHeight: 1.5 }}>Get at <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" style={{ color: "#7986CB" }}>OAuth Playground</a> — expires ~1hr</p>
              </div>
              <div style={{ marginBottom: "2rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>Calendar ID</label>
                <input value={calendarId} onChange={e => setCalendarId(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.85rem", fontFamily: "'DM Mono', monospace" }} placeholder="primary" />
              </div>
              <button onClick={loadGoogleCalendar} disabled={calLoading} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", border: "none", borderRadius: "10px", color: "#0D0F14", fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}>
                {calLoading ? "Loading…" : "Let's plan →"}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── MAIN APP ──
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital@0;1&family=DM+Mono:wght@400;500&display=swap'); *{box-sizing:border-box;margin:0;padding:0} body{background:#0D0F14;overflow:hidden} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:99px} textarea{outline:none;resize:none} input[type=time]{color-scheme:dark} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}}`}</style>

      {selectedEvent && <EventTagPopup event={selectedEvent} currentTag={eventLabels[selectedEvent.id]} onSelect={handleEventTag} onClose={() => setSelectedEvent(null)} />}
      {showRules && <RulesEditor rules={rules} setRules={setRules} onClose={() => setShowRules(false)} />}

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0D0F14", fontFamily: "'Lora', serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem" }}>◎</div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", color: "#F3F4F6" }}>Family Scheduler</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.56rem", color: "#4B5563", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "3px", padding: "2px 5px" }}>{gcalToken ? "● Live" : "◌ Demo"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {[{ name: partnerAName, c: "#7986CB" }, { name: partnerBName, c: "#33B679" }].map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.c }} />
                <span style={{ fontSize: "0.68rem", color: "#9CA3AF", fontFamily: "'DM Mono', monospace" }}>{p.name}</span>
              </div>
            ))}
            <div style={{ width: "1px", height: "10px", background: "rgba(255,255,255,0.08)", margin: "0 2px" }} />
            <button onClick={() => setShowRules(true)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "5px", color: "#9CA3AF", padding: "2px 7px", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>⚓ Rules</button>
            <button onClick={() => { save("fs_setup_done", false); setView("setup"); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "5px", color: "#6B7280", padding: "2px 7px", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>⚙</button>
            <button onClick={() => { if (window.confirm("Clear chat + schedule?")) { setMessages([]); setScheduleDays([]); setSummary(null); save("fs_messages",[]); save("fs_schedule",[]); save("fs_summary",null); }}} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "5px", color: "#6B7280", padding: "2px 7px", fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>↺</button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT PANEL */}
          <div style={{ width: "52%", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Tab bar */}
            <div style={{ display: "flex", padding: "8px 12px 0", gap: "2px", flexShrink: 0, overflowX: "auto" }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  padding: "4px 10px", borderRadius: "5px 5px 0 0", border: "none", whiteSpace: "nowrap",
                  background: activeTab === tab.id ? "rgba(255,255,255,0.07)" : "transparent",
                  color: activeTab === tab.id ? "#E5E7EB" : "#6B7280",
                  fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                }}>{tab.label}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>

              {/* MY CALENDAR */}
              {activeTab === "calendar" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.92rem", color: "#F3F4F6", fontStyle: "italic" }}>My Calendar</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.56rem", fontFamily: "'DM Mono', monospace", color: "#4B5563" }}>Click event to tag · +N to expand all</span>
                      <button onClick={loadGoogleCalendar} disabled={calLoading} style={{ padding: "3px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px", color: calLoading ? "#4B5563" : "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.58rem", cursor: calLoading ? "default" : "pointer" }}>
                        {calLoading ? "↻ loading…" : "↻ refresh"}
                      </button>
                    </div>
                  </div>
                  {gcalToken && gcalTokenTime && (() => {
                    const age = Date.now() - gcalTokenTime;
                    const expired = age > 60 * 60 * 1000;
                    const warning = age > 50 * 60 * 1000;
                    if (!expired && !warning) return null;
                    return (
                      <div style={{ marginBottom: "8px", padding: "6px 10px", background: expired ? "rgba(239,68,68,0.08)" : "rgba(246,191,38,0.08)", border: `1px solid ${expired ? "rgba(239,68,68,0.25)" : "rgba(246,191,38,0.25)"}`, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: expired ? "#F87171" : "#F6BF26" }}>
                          {expired ? "⚠ Token expired — refresh won't load new data" : "⚠ Token expiring soon (~10 min left)"}
                        </span>
                        <button onClick={() => setView("setup")} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${expired ? "rgba(239,68,68,0.4)" : "rgba(246,191,38,0.4)"}`, borderRadius: "4px", color: expired ? "#F87171" : "#F6BF26", fontFamily: "'DM Mono', monospace", fontSize: "0.58rem", cursor: "pointer" }}>
                          Update token →
                        </button>
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                    {[{ l: partnerAName, c: "#7986CB" }, { l: partnerBName, c: "#33B679" }, { l: "Both", c: "#8E24AA" }, { l: "Kids", c: "#E67C73" }, { l: "Coverage", c: "#F6BF26" }].map(t => (
                      <div key={t.l} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.c }} />
                        <span style={{ fontSize: "0.56rem", fontFamily: "'DM Mono', monospace", color: "#6B7280" }}>{t.l}</span>
                      </div>
                    ))}
                  </div>
                  <GCalStrip events={events} startDate={startDate} eventLabels={eventLabels} onEventClick={setSelectedEvent} />
                  {pendingGcalEvents && (
                    <div style={{ marginTop: "10px", padding: "10px 12px", background: "rgba(51,182,121,0.07)", border: "1px solid rgba(51,182,121,0.2)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✦ {pendingGcalEvents.length} events ready</span>
                      <button onClick={() => pushToGCal(pendingGcalEvents)} style={{ padding: "4px 10px", background: "#33B679", border: "none", borderRadius: "5px", color: "#0D0F14", fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", fontWeight: 600, cursor: "pointer" }}>Push to GCal →</button>
                    </div>
                  )}
                </div>
              )}

              {/* SUGGESTED 2-WEEK */}
              {activeTab === "schedule-2wk" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.92rem", color: "#F3F4F6", fontStyle: "italic" }}>Suggested Schedule</span>
                    <span style={{ fontSize: "0.56rem", fontFamily: "'DM Mono', monospace", color: "#4B5563" }}>Click a day for timeline</span>
                  </div>
                  <ScheduleGrid scheduleDays={scheduleDays} onDayClick={d => { setSelectedDay(d); setActiveTab("schedule-day"); }} selectedDay={selectedDay} partnerAName={partnerAName} partnerBName={partnerBName} />
                </div>
              )}

              {/* SUGGESTED DAY */}
              {activeTab === "schedule-day" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.92rem", color: "#F3F4F6", fontStyle: "italic" }}>Daily Timeline</span>
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                      {scheduleDays.map(d => (
                        <button key={d.date} onClick={() => setSelectedDay(d.date)} style={{ padding: "2px 6px", borderRadius: "4px", border: "none", background: selectedDay === d.date ? "rgba(249,220,92,0.14)" : "rgba(255,255,255,0.05)", color: selectedDay === d.date ? "#F9DC5C" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.58rem", cursor: "pointer" }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                    {[["#8E24AA","Family/shared"],["#7986CB",partnerAName],["#33B679",partnerBName],["#3B82F6","Work"],["#0B8043","Exercise"],["#4B5563","Free"]].map(([c,l]) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ width: "8px", height: "3px", background: c, borderRadius: "99px" }} />
                        <span style={{ fontSize: "0.54rem", fontFamily: "'DM Mono', monospace", color: "#4B5563" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  {selectedDayData
                    ? <DayTimeline day={selectedDayData} partnerAName={partnerAName} partnerBName={partnerBName} />
                    : <div style={{ textAlign: "center", padding: "3rem 0", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem" }}>Select a day above or ask AI for a schedule</div>
                  }
                </div>
              )}

              {/* TOTALS */}
              {activeTab === "totals" && (
                <div>
                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.92rem", color: "#F3F4F6", fontStyle: "italic" }}>Weekly Totals</span>
                    <p style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "3px" }}>Calculated from the suggested schedule</p>
                  </div>
                  {summary
                    ? <WeeklyTotals summary={summary} partnerAName={partnerAName} partnerBName={partnerBName} />
                    : <div style={{ textAlign: "center", padding: "3rem 0", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem" }}>Ask the AI to suggest a schedule — totals appear here automatically</div>
                  }
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: CHAT */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.9rem", color: "#F3F4F6", fontStyle: "italic" }}>Schedule with AI</p>
              <p style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "2px" }}>Uses your household rules + event tags · Timeline + totals update automatically</p>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: "1.5rem" }}>
                  <div style={{ fontSize: "1.6rem", marginBottom: "0.8rem", opacity: 0.3 }}>◎</div>
                  <p style={{ color: "#6B7280", fontSize: "0.78rem", lineHeight: 1.65, maxWidth: "240px", margin: "0 auto 1.2rem" }}>
                    Tag events in My Calendar, set rules (⚓), then ask for a schedule.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: "290px", margin: "0 auto" }}>
                    {quickPrompts.map((p, i) => (
                      <button key={i} onClick={() => sendMessage(p)} style={{ padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "6px", color: "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.07)"}
                        onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.04)"}
                      >→ {p}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 0" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.58rem" }}>✦</div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F9DC5C", animation: `pulse 1.2s ease ${i*0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "9px", padding: "7px 10px" }}>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Ask to suggest a schedule, adjust fairness, or describe what you need…" rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontFamily: "'Lora', serif", fontSize: "0.8rem", lineHeight: 1.5, maxHeight: "100px", overflowY: "auto" }} />
                <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{ width: "26px", height: "26px", borderRadius: "5px", background: input.trim() && !loading ? "linear-gradient(135deg, #F9DC5C, #F4844C)" : "rgba(255,255,255,0.06)", border: "none", color: input.trim() && !loading ? "#0D0F14" : "#4B5563", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.78rem" }}>↑</button>
              </div>
              <p style={{ fontSize: "0.54rem", fontFamily: "'DM Mono', monospace", color: "#374151", marginTop: "4px", textAlign: "center" }}>↵ Send · Shift+↵ New line · Everything auto-saved</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
