import { useState, useRef, useEffect } from "react";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function load(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  { id: "1", summary: "Patrick PT", start: { dateTime: "2026-02-24T11:00:00" }, end: { dateTime: "2026-02-24T12:00:00" } },
  { id: "2", summary: "Eric Lander's birthday", start: { date: "2026-02-25" }, end: { date: "2026-02-26" } },
  { id: "3", summary: "Nora in Ojai", start: { date: "2026-02-26" }, end: { date: "2026-03-02" } },
  { id: "4", summary: "Flight to Seattle (AS 375)", start: { dateTime: "2026-02-27T08:00:00" }, end: { dateTime: "2026-02-27T10:00:00" } },
  { id: "5", summary: "MARCH Seahorse #2: SUNDAYS 10:15-10:45", start: { dateTime: "2026-03-01T10:15:00" }, end: { dateTime: "2026-03-01T10:45:00" } },
  { id: "6", summary: "Danskey Mariner Meeting", start: { dateTime: "2026-02-26T14:00:00" }, end: { dateTime: "2026-02-26T15:30:00" } },
  { id: "7", summary: "Arleta info session", start: { dateTime: "2026-02-26T17:00:00" }, end: { dateTime: "2026-02-26T18:00:00" } },
];

const DEFAULT_RULES = [
  { id: "r1", name: "Morning / breakfast", startTime: "07:00", endTime: "08:15", who: "family", days: ["mon","tue","wed","thu","fri"], note: "Preferred together, but one parent solo is fine when schedules conflict" },
  { id: "r2", name: "School drop-off", startTime: "08:15", endTime: "08:45", who: "alternate", days: ["mon","tue","wed","thu","fri"], note: "Alternate by default, adjust when one parent is away" },
  { id: "r3", name: "School pickup", startTime: "15:30", endTime: "16:00", who: "alternate", days: ["mon","tue","wed","thu","fri"], note: "" },
  { id: "r4", name: "Dinner together", startTime: "18:00", endTime: "19:00", who: "family", days: ["mon","tue","wed","thu","fri","sat","sun"], note: "" },
  { id: "r5", name: "Bedtime routine", startTime: "19:30", endTime: "20:30", who: "split", days: ["mon","tue","wed","thu","fri","sat","sun"], note: "Preferred split (each takes one kid), but one parent solo is fine when needed" },
  { id: "r6", name: "Exercise", startTime: "06:00", endTime: "07:00", who: "each", days: ["mon","wed","fri"], note: "Each person finds their own slot" },
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
  { id: "kids-nora", label: "Kids → Nora covers", color: "#E67C73" },
  { id: "kids-patrick", label: "Kids → Patrick covers", color: "#33B679" },
  { id: "kids-both", label: "Kids → Split", color: "#E67C73" },
  { id: "coverage-nora", label: "Needs coverage → Nora", color: "#F6BF26" },
  { id: "coverage-patrick", label: "Needs coverage → Patrick", color: "#F6BF26" },
  { id: "ignore", label: "Ignore", color: "#6B7280" },
];

const BLOCK_COLORS = {
  family:   { bg: "#8E24AA18", border: "#8E24AA", text: "#C084FC" },
  nora:     { bg: "#7986CB18", border: "#7986CB", text: "#93A8F4" },
  patrick:  { bg: "#33B67918", border: "#33B679", text: "#4ADE80" },
  kids:     { bg: "#E67C7318", border: "#E67C73", text: "#FCA5A5" },
  chores:   { bg: "#F6BF2618", border: "#F6BF26", text: "#FDE68A" },
  exercise: { bg: "#0B804318", border: "#0B8043", text: "#6EE7B7" },
  work:     { bg: "#03468818", border: "#034688", text: "#7DD3FC" },
  free:     { bg: "#37415118", border: "#4B5563", text: "#9CA3AF" },
  alternate:{ bg: "#F6BF2618", border: "#F6BF26", text: "#FDE68A" },
  split:    { bg: "#E67C7318", border: "#E67C73", text: "#FCA5A5" },
};

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(a, b, events, labels, rules) {
  const tagLines = Object.entries(labels).map(([id, tag]) => {
    const ev = events.find(e => e.id === id);
    return ev ? `"${ev.summary}" → ${tag}` : null;
  }).filter(Boolean).join("\n");

  const ruleLines = rules.map(r =>
    `- ${r.name}: ${r.startTime}–${r.endTime}, assigned to: ${r.who}, days: ${r.days.join(",")}${r.note ? ` (${r.note})` : ""}`
  ).join("\n");

  return `You are a warm family scheduling assistant for ${a} and ${b}. NOT micromanage-y — suggest rhythms, not minute-by-minute plans.

HOUSEHOLD:
- Two kids. Work is flexible, fits around kids. Each parent needs 45h/week.
- ${b} travels every other week. Fairness over a 2-week window.
- When one parent travels, the other banks equity rebalanced next week.
- Morning/breakfast: preferred together but one parent solo is totally fine when schedules conflict. Don't treat it as a hard requirement.
- Bedtime: preferred split (each takes one kid) but one parent doing both is fine when needed. Flexible.

STANDING DAILY RULES (apply every applicable day as baseline):
${ruleLines}

EVENT TAGS (user labeled — treat as ground truth):
${tagLines || "None yet — infer from names/context."}

CALENDAR DATA sent with each message.

APPROACH: Use the standing rules as a daily template. Then look at each day's actual events to figure out who should cover what. If ${a} has a conflict during drop-off, assign ${b}. If ${b} is traveling, ${a} covers all kid tasks and banks equity. Work blocks should fill the gaps between anchors, fitting around the day rather than being fixed 9-5.

OUTPUT FORMAT — always include a <SCHEDULE> block when suggesting schedules:
<SCHEDULE>
[
  {
    "date": "YYYY-MM-DD",
    "label": "Mon Feb 24",
    "blocks": [
      { "start": "07:00", "end": "08:15", "title": "Family breakfast", "who": "family", "note": "" },
      { "start": "08:15", "end": "08:45", "title": "Drop-off", "who": "patrick", "note": "Nora has conflict" },
      { "start": "08:45", "end": "12:00", "title": "Work", "who": "nora", "note": "" },
      { "start": "08:45", "end": "11:00", "title": "Work", "who": "patrick", "note": "" },
      { "start": "11:00", "end": "12:00", "title": "PT", "who": "patrick", "note": "from calendar" },
      { "start": "12:00", "end": "15:30", "title": "Work", "who": "patrick", "note": "" },
      { "start": "12:00", "end": "15:30", "title": "Work", "who": "nora", "note": "" },
      { "start": "15:30", "end": "16:00", "title": "Pickup", "who": "nora", "note": "" },
      { "start": "18:00", "end": "19:00", "title": "Dinner together", "who": "family", "note": "" },
      { "start": "19:30", "end": "20:30", "title": "Bedtime", "who": "split", "note": "" }
    ]
  }
]
</SCHEDULE>

WHO values: "family", "${a.toLowerCase()}", "${b.toLowerCase()}", "nora", "patrick", "kids", "work", "exercise", "chores", "free", "split", "alternate"
Show BOTH people's work blocks on the same day (they overlap — that's fine, renders side by side).
Only include days with meaningful content. 4–10 blocks per day.

For GCal push:
<GCAL_EVENTS>[{"summary":"...","start":{"dateTime":"...","timeZone":"America/New_York"},"end":{"dateTime":"...","timeZone":"America/New_York"},"colorId":"..."}]</GCAL_EVENTS>`;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getWeekDays(startDate) {
  const days = []; const d = new Date(startDate);
  for (let i = 0; i < 14; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}
function getEventsForDay(events, day) {
  return events.filter(ev => {
    const dayStr = day.toISOString().split("T")[0];
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
  return BLOCK_COLORS[w] || BLOCK_COLORS.free;
}

// ─── DAY TIMELINE ─────────────────────────────────────────────────────────────
function DayTimeline({ day, partnerAName, partnerBName }) {
  const START = 6 * 60, END = 22 * 60, TOTAL = END - START, H = 400;
  const hours = [];
  for (let h = 6; h <= 22; h += 2) hours.push(h);

  // Separate nora/patrick blocks to show side by side
  const noraBlocks = day.blocks.filter(b => {
    const w = b.who?.toLowerCase();
    return w === "nora" || w === partnerAName?.toLowerCase() || w === "work" && b.title?.toLowerCase().includes("nora");
  });
  const patrickBlocks = day.blocks.filter(b => {
    const w = b.who?.toLowerCase();
    return w === "patrick" || w === partnerBName?.toLowerCase();
  });
  const sharedBlocks = day.blocks.filter(b => {
    const w = b.who?.toLowerCase();
    return w === "family" || w === "split" || w === "alternate" || w === "kids" || w === "exercise" || w === "chores" || w === "free";
  });
  // Work blocks without a specific person get split
  const workBlocks = day.blocks.filter(b => b.who?.toLowerCase() === "work");

  function renderBlock(block, leftPct, widthPct, colorOverride) {
    const startMin = timeToMin(block.start);
    const endMin = timeToMin(block.end);
    const top = Math.max(0, ((startMin - START) / TOTAL) * H);
    const height = Math.max(16, ((endMin - startMin) / TOTAL) * H);
    const c = colorOverride || resolveBlockColor(block.who, partnerAName, partnerBName);
    return (
      <div key={`${block.start}-${block.title}-${leftPct}`} style={{
        position: "absolute",
        left: `${leftPct}%`, width: `${widthPct}%`,
        top: top + "px", height: height + "px",
        background: c.bg, borderLeft: `3px solid ${c.border}`,
        borderRadius: "0 5px 5px 0", padding: "2px 5px",
        overflow: "hidden", boxSizing: "border-box",
      }} title={`${block.title} · ${minToTime(startMin)}–${minToTime(endMin)}${block.note ? ` · ${block.note}` : ""}`}>
        <div style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: c.text, fontWeight: 500, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {block.title}
        </div>
        {height > 28 && (
          <div style={{ fontSize: "0.52rem", color: c.border + "aa", fontFamily: "'DM Mono', monospace" }}>
            {minToTime(startMin)}–{minToTime(endMin)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>{day.label}</div>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr", gap: "4px", marginBottom: "4px" }}>
        <div />
        <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#7986CB", textAlign: "center" }}>{partnerAName}</div>
        <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#33B679", textAlign: "center" }}>{partnerBName}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr", gap: "4px" }}>
        {/* Hour labels */}
        <div style={{ position: "relative", height: H + "px" }}>
          {hours.map(h => (
            <div key={h} style={{ position: "absolute", top: (((h * 60 - START) / TOTAL) * H) - 7 + "px", right: "4px", fontSize: "0.52rem", fontFamily: "'DM Mono', monospace", color: "#374151" }}>
              {h > 12 ? `${h-12}p` : h === 12 ? "12p" : `${h}a`}
            </div>
          ))}
        </div>
        {/* Nora column */}
        <div style={{ position: "relative", height: H + "px", background: "rgba(255,255,255,0.015)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
          {hours.map(h => (
            <div key={h} style={{ position: "absolute", top: (((h * 60 - START) / TOTAL) * H) + "px", left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,0.04)" }} />
          ))}
          {[...sharedBlocks, ...noraBlocks, ...workBlocks].map(b => renderBlock(b, 2, 96))}
        </div>
        {/* Patrick column */}
        <div style={{ position: "relative", height: H + "px", background: "rgba(255,255,255,0.015)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
          {hours.map(h => (
            <div key={h} style={{ position: "absolute", top: (((h * 60 - START) / TOTAL) * H) + "px", left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,0.04)" }} />
          ))}
          {[...sharedBlocks, ...patrickBlocks, ...workBlocks].map(b => renderBlock(b, 2, 96))}
        </div>
      </div>
    </div>
  );
}

// ─── CALENDAR STRIP ───────────────────────────────────────────────────────────
function CalendarStrip({ events, startDate, eventLabels, onEventClick, onDayClick, selectedDay, scheduleDays }) {
  const days = getWeekDays(startDate);
  const scheduledDates = new Set(scheduleDays.map(d => d.date));
  const [expandedDay, setExpandedDay] = useState(null);

  function DayCell({ day }) {
    const dayStr = day.toISOString().split("T")[0];
    const dayEvents = getEventsForDay(events, day);
    const isToday = day.toDateString() === new Date().toDateString();
    const isSelected = selectedDay === dayStr;
    const hasSchedule = scheduledDates.has(dayStr);
    const isExpanded = expandedDay === dayStr;

    return (
      <div style={{ position: "relative" }}>
        <div onClick={() => onDayClick(dayStr)} style={{
          background: isSelected ? "rgba(249,220,92,0.1)" : isToday ? "rgba(249,220,92,0.05)" : "rgba(255,255,255,0.03)",
          border: isSelected ? "1px solid rgba(249,220,92,0.4)" : isToday ? "1px solid rgba(249,220,92,0.15)" : "1px solid rgba(255,255,255,0.06)",
          borderRadius: "8px", padding: "6px 5px", minHeight: "72px", cursor: "pointer",
        }}>
          <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: isSelected ? "#F9DC5C" : "#6B7280", marginBottom: "3px" }}>
            {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<br />
            <span style={{ fontSize: "0.9rem", fontFamily: "'Playfair Display', serif", color: isSelected ? "#F9DC5C" : "#E5E7EB" }}>{day.getDate()}</span>
          </div>
          {hasSchedule && <div style={{ width: "14px", height: "2px", background: "#F9DC5C55", borderRadius: "99px", marginBottom: "3px" }} />}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {dayEvents.slice(0, 2).map((ev, j) => {
              const tc = tagColor(eventLabels[ev.id]);
              return (
                <div key={j} onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                  style={{ fontSize: "0.55rem", background: tc + "18", borderLeft: `2px solid ${tc}`, color: tc, borderRadius: "2px", padding: "1px 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                  title={ev.summary}>{ev.summary}
                </div>
              );
            })}
            {dayEvents.length > 2 && (
              <div onClick={e => { e.stopPropagation(); setExpandedDay(isExpanded ? null : dayStr); }}
                style={{ fontSize: "0.52rem", color: "#F9DC5C", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                +{dayEvents.length - 2} more ▾
              </div>
            )}
          </div>
        </div>
        {/* Expanded overflow */}
        {isExpanded && (
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "#1A1D24", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", padding: "8px", minWidth: "160px", marginTop: "4px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", color: "#6B7280", marginBottom: "6px" }}>{day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
            {dayEvents.map((ev, j) => {
              const tc = tagColor(eventLabels[ev.id]);
              return (
                <div key={j} onClick={e => { e.stopPropagation(); onEventClick(ev); setExpandedDay(null); }}
                  style={{ fontSize: "0.68rem", background: tc + "15", borderLeft: `2px solid ${tc}`, color: tc, borderRadius: "3px", padding: "4px 6px", marginBottom: "4px", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                  {ev.summary}
                  {eventLabels[ev.id] && <span style={{ opacity: 0.6, marginLeft: "4px" }}>· {eventLabels[ev.id]}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function WeekRow({ weekDays, label }) {
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "0.62rem", fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", color: "#6B7280", marginBottom: "4px", textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
          {weekDays.map((day, i) => <DayCell key={i} day={day} />)}
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => setExpandedDay(null)}>
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
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", color: "#6B7280", marginBottom: "14px" }}>Who owns this event?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {TAG_OPTIONS.map(tag => (
            <button key={tag.id} onClick={() => onSelect(event.id, tag.id)} style={{
              padding: "7px 10px", borderRadius: "7px", border: "none", cursor: "pointer",
              background: currentTag === tag.id ? tag.color + "25" : "rgba(255,255,255,0.04)",
              borderLeft: `3px solid ${tag.color}`,
              color: currentTag === tag.id ? tag.color : "#9CA3AF",
              fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", textAlign: "left",
            }}>
              {currentTag === tag.id ? "✓ " : ""}{tag.label}
            </button>
          ))}
          {currentTag && (
            <button onClick={() => onSelect(event.id, null)} style={{ padding: "5px 10px", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", cursor: "pointer", marginTop: "2px" }}>
              Remove tag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RULES EDITOR ─────────────────────────────────────────────────────────────
function RulesEditor({ rules, setRules, onClose, partnerAName, partnerBName }) {
  const [editing, setEditing] = useState(null);
  const days = ["mon","tue","wed","thu","fri","sat","sun"];

  function updateRule(id, field, val) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }
  function toggleDay(id, day) {
    setRules(prev => prev.map(r => {
      if (r.id !== id) return r;
      const d = r.days.includes(day) ? r.days.filter(x => x !== day) : [...r.days, day];
      return { ...r, days: d };
    }));
  }
  function addRule() {
    const id = "r" + Date.now();
    setRules(prev => [...prev, { id, name: "New anchor", startTime: "08:00", endTime: "09:00", who: "family", days: ["mon","tue","wed","thu","fri"], note: "" }]);
    setEditing(id);
  }

  const whoColors = { family: "#8E24AA", nora: "#7986CB", patrick: "#33B679", alternate: "#F6BF26", split: "#E67C73", each: "#0B8043" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#13151A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "20px", width: "520px", maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", color: "#F3F4F6", fontStyle: "italic" }}>Household Rules</p>
            <p style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", color: "#6B7280", marginTop: "2px" }}>Standing anchors applied to every day — AI adjusts around actual events</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
        </div>

        {rules.map(rule => (
          <div key={rule.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "12px", marginBottom: "8px" }}>
            {editing === rule.id ? (
              <div>
                <input value={rule.name} onChange={e => updateRule(rule.id, "name", e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 10px", color: "#E5E7EB", fontFamily: "'DM Mono', monospace", fontSize: "0.78rem", marginBottom: "8px", outline: "none" }} />
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.6rem", color: "#6B7280", fontFamily: "'DM Mono', monospace" }}>START</label>
                    <input type="time" value={rule.startTime} onChange={e => updateRule(rule.id, "startTime", e.target.value)}
                      style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "5px 8px", color: "#E5E7EB", fontFamily: "'DM Mono', monospace", fontSize: "0.75rem", outline: "none" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.6rem", color: "#6B7280", fontFamily: "'DM Mono', monospace" }}>END</label>
                    <input type="time" value={rule.endTime} onChange={e => updateRule(rule.id, "endTime", e.target.value)}
                      style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "5px 8px", color: "#E5E7EB", fontFamily: "'DM Mono', monospace", fontSize: "0.75rem", outline: "none" }} />
                  </div>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.6rem", color: "#6B7280", fontFamily: "'DM Mono', monospace", display: "block", marginBottom: "4px" }}>ASSIGNED TO</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {WHO_OPTIONS.map(w => (
                      <button key={w.id} onClick={() => updateRule(rule.id, "who", w.id)} style={{ padding: "3px 8px", borderRadius: "5px", border: "none", background: rule.who === w.id ? w.color + "30" : "rgba(255,255,255,0.05)", color: rule.who === w.id ? w.color : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", cursor: "pointer" }}>
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.6rem", color: "#6B7280", fontFamily: "'DM Mono', monospace", display: "block", marginBottom: "4px" }}>DAYS</label>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {days.map(d => (
                      <button key={d} onClick={() => toggleDay(rule.id, d)} style={{ padding: "3px 6px", borderRadius: "4px", border: "none", background: rule.days.includes(d) ? "#7986CB30" : "rgba(255,255,255,0.04)", color: rule.days.includes(d) ? "#7986CB" : "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", cursor: "pointer", textTransform: "uppercase" }}>
                        {d.slice(0,1).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <input value={rule.note} onChange={e => updateRule(rule.id, "note", e.target.value)} placeholder="Note (optional)"
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "5px 8px", color: "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", outline: "none", marginBottom: "8px" }} />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => setEditing(null)} style={{ padding: "5px 12px", background: "#7986CB", border: "none", borderRadius: "6px", color: "#0D0F14", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", cursor: "pointer" }}>Done</button>
                  <button onClick={() => setRules(prev => prev.filter(r => r.id !== rule.id))} style={{ padding: "5px 12px", background: "transparent", border: "1px solid rgba(255,0,0,0.2)", borderRadius: "6px", color: "#F87171", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setEditing(rule.id)}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: whoColors[rule.who] || "#6B7280" }} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.78rem", color: "#E5E7EB" }}>{rule.name}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", color: "#6B7280" }}>{rule.startTime}–{rule.endTime}</span>
                  </div>
                  <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "2px", marginLeft: "16px" }}>
                    {rule.who} · {rule.days.map(d => d.slice(0,1).toUpperCase()).join(" ")}
                  </div>
                </div>
                <span style={{ color: "#4B5563", fontSize: "0.75rem" }}>✏️</span>
              </div>
            )}
          </div>
        ))}
        <button onClick={addRule} style={{ width: "100%", padding: "8px", background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px", color: "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", cursor: "pointer", marginTop: "4px" }}>
          + Add anchor
        </button>
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
      {!isUser && <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", flexShrink: 0, marginRight: "7px", marginTop: "2px" }}>✦</div>}
      <div style={{ maxWidth: "82%", padding: "8px 12px", borderRadius: isUser ? "13px 13px 3px 13px" : "13px 13px 13px 3px", background: isUser ? "rgba(249,220,92,0.1)" : "rgba(255,255,255,0.05)", border: isUser ? "1px solid rgba(249,220,92,0.18)" : "1px solid rgba(255,255,255,0.07)", fontSize: "0.82rem", lineHeight: 1.65, color: "#E5E7EB", fontFamily: "'Lora', serif", whiteSpace: "pre-wrap" }}>
        {display}
        {msg.gcalEvents && <div style={{ marginTop: "8px", padding: "6px 10px", background: "rgba(51,182,121,0.1)", border: "1px solid rgba(51,182,121,0.3)", borderRadius: "6px", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✓ {msg.gcalEvents.length} events ready to push</div>}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FamilyScheduler() {
  const [view, setView] = useState(() => load("fs_setup_done", false) ? "app" : "setup");
  const [gcalToken, setGcalToken] = useState(() => load("fs_gcal_token", ""));
  const [calendarId, setCalendarId] = useState(() => load("fs_cal_id", "primary"));
  const [partnerAName, setPartnerAName] = useState(() => load("fs_name_a", "Nora"));
  const [partnerBName, setPartnerBName] = useState(() => load("fs_name_b", "Patrick"));
  const [events, setEvents] = useState(DEMO_EVENTS);
  const [messages, setMessages] = useState(() => load("fs_messages", []));
  const [eventLabels, setEventLabels] = useState(() => load("fs_labels", {}));
  const [rules, setRules] = useState(() => load("fs_rules", DEFAULT_RULES));
  const [scheduleDays, setScheduleDays] = useState(() => load("fs_schedule", []));
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [leftTab, setLeftTab] = useState("overview");
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
  useEffect(() => { save("fs_cal_id", calendarId); }, [calendarId]);
  useEffect(() => { save("fs_rules", rules); }, [rules]);
  useEffect(() => { save("fs_schedule", scheduleDays); }, [scheduleDays]);
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

  function handleDayClick(dayStr) {
    setSelectedDay(dayStr);
    if (scheduleDays.find(d => d.date === dayStr)) setLeftTab("day");
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const calData = JSON.stringify(events.slice(0, 60), null, 2);
    const tagLines = Object.entries(eventLabels).map(([id, tag]) => {
      const ev = events.find(e => e.id === id);
      return ev ? `"${ev.summary}" → ${tag}` : null;
    }).filter(Boolean).join("\n");

    const userMsg = { role: "user", content: `CALENDAR DATA:\n${calData}\n\nEVENT TAGS:\n${tagLines || "None"}\n\nUSER: ${text}` };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 3000,
          system: buildSystemPrompt(partnerAName, partnerBName, events, eventLabels, rules),
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "Something went wrong.";

      const schedMatch = raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
      if (schedMatch) {
        try {
          const parsed = JSON.parse(schedMatch[1].trim());
          setScheduleDays(prev => {
            const map = {};
            prev.forEach(d => map[d.date] = d);
            parsed.forEach(d => map[d.date] = d);
            return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
          });
          if (parsed.length > 0) { setSelectedDay(parsed[0].date); setLeftTab("day"); }
        } catch (e) { console.error("Schedule parse error:", e, schedMatch[1]); }
      }

      const gcalMatch = raw.match(/<GCAL_EVENTS>([\s\S]*?)<\/GCAL_EVENTS>/);
      let gcalEvents = null;
      if (gcalMatch) { try { gcalEvents = JSON.parse(gcalMatch[1].trim()); setPendingGcalEvents(gcalEvents); } catch {} }

      const displayText = raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g, "").replace(/<GCAL_EVENTS>[\s\S]*?<\/GCAL_EVENTS>/g, "").trim();
      setMessages(prev => [...prev, { role: "assistant", content: displayText, gcalEvents }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong — please try again." }]);
    }
    setLoading(false);
  }

  const selectedDayData = scheduleDays.find(d => d.date === selectedDay);
  const quickPrompts = [
    `Suggest a fair schedule for this week using our household rules`,
    `Nora is in Ojai Thu–Sun — map out Patrick's solo days and how we rebalance next week`,
    `Show me a typical weekday for us`,
    `Who's carrying more load right now?`,
    `Push this schedule to Google Calendar`,
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
                <input value={gcalToken} onChange={e => setGcalToken(e.target.value)} type="password" style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.85rem", fontFamily: "'DM Mono', monospace" }} placeholder="ya29.a0A..." />
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
      {showRules && <RulesEditor rules={rules} setRules={setRules} onClose={() => setShowRules(false)} partnerAName={partnerAName} partnerBName={partnerBName} />}

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0D0F14", fontFamily: "'Lora', serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>◎</div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", color: "#F3F4F6" }}>Family Scheduler</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.58rem", color: "#4B5563", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "4px", padding: "2px 5px" }}>{gcalToken ? "● Live" : "◌ Demo"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {[{ name: partnerAName, c: "#7986CB" }, { name: partnerBName, c: "#33B679" }].map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.c }} />
                <span style={{ fontSize: "0.7rem", color: "#9CA3AF", fontFamily: "'DM Mono', monospace" }}>{p.name}</span>
              </div>
            ))}
            <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.08)", margin: "0 2px" }} />
            <button onClick={() => setShowRules(true)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#9CA3AF", padding: "3px 8px", fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>⚓ Rules</button>
            <button onClick={() => { save("fs_setup_done", false); setView("setup"); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#6B7280", padding: "3px 8px", fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>⚙</button>
            <button onClick={() => { if (window.confirm("Clear chat + schedule?")) { setMessages([]); setScheduleDays([]); save("fs_messages", []); save("fs_schedule", []); }}} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#6B7280", padding: "3px 8px", fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>↺</button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT */}
          <div style={{ width: "52%", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "8px 14px 0", gap: "3px", flexShrink: 0 }}>
              <button onClick={() => setLeftTab("overview")} style={{ padding: "5px 11px", borderRadius: "6px 6px 0 0", border: "none", background: leftTab === "overview" ? "rgba(255,255,255,0.07)" : "transparent", color: leftTab === "overview" ? "#E5E7EB" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>Overview</button>
              <button onClick={() => setLeftTab("day")} style={{ padding: "5px 11px", borderRadius: "6px 6px 0 0", border: "none", background: leftTab === "day" ? "rgba(255,255,255,0.07)" : "transparent", color: leftTab === "day" ? (scheduleDays.length > 0 ? "#F9DC5C" : "#6B7280") : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer" }}>
                Day View {selectedDayData ? `· ${selectedDayData.label}` : ""}
              </button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
              {leftTab === "overview" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", color: "#F3F4F6", fontStyle: "italic" }}>Two-Week View</span>
                    <span style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: "#4B5563" }}>Click event to tag · +N to expand</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                    {[{ l: partnerAName, c: "#7986CB" }, { l: partnerBName, c: "#33B679" }, { l: "Both", c: "#8E24AA" }, { l: "Kids", c: "#E67C73" }, { l: "Coverage", c: "#F6BF26" }].map(t => (
                      <div key={t.l} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.c }} />
                        <span style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: "#6B7280" }}>{t.l}</span>
                      </div>
                    ))}
                  </div>
                  <CalendarStrip events={events} startDate={startDate} eventLabels={eventLabels} onEventClick={setSelectedEvent} onDayClick={handleDayClick} selectedDay={selectedDay} scheduleDays={scheduleDays} />
                  {pendingGcalEvents && (
                    <div style={{ marginTop: "10px", padding: "10px 14px", background: "rgba(51,182,121,0.08)", border: "1px solid rgba(51,182,121,0.2)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✦ {pendingGcalEvents.length} events ready</span>
                      <button onClick={() => pushToGCal(pendingGcalEvents)} style={{ padding: "4px 10px", background: "#33B679", border: "none", borderRadius: "6px", color: "#0D0F14", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", fontWeight: 600, cursor: "pointer" }}>Push to GCal →</button>
                    </div>
                  )}
                </div>
              )}

              {leftTab === "day" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", color: "#F3F4F6", fontStyle: "italic" }}>Daily Timeline</span>
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                      {scheduleDays.map(d => (
                        <button key={d.date} onClick={() => setSelectedDay(d.date)} style={{ padding: "2px 7px", borderRadius: "4px", border: "none", background: selectedDay === d.date ? "rgba(249,220,92,0.15)" : "rgba(255,255,255,0.05)", color: selectedDay === d.date ? "#F9DC5C" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", cursor: "pointer" }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                    {[["family","#8E24AA","Family"],["nora","#7986CB",partnerAName],["patrick","#33B679",partnerBName],["work","#034688","Work"],["exercise","#0B8043","Exercise"],["free","#4B5563","Free"]].map(([k,c,l]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ width: "8px", height: "3px", background: c, borderRadius: "99px" }} />
                        <span style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: "#4B5563" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  {selectedDayData
                    ? <DayTimeline day={selectedDayData} partnerAName={partnerAName} partnerBName={partnerBName} />
                    : <div style={{ textAlign: "center", padding: "3rem 0", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem" }}>Ask the AI to suggest a schedule — it'll appear here</div>
                  }
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: CHAT */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.92rem", color: "#F3F4F6", fontStyle: "italic" }}>Schedule with AI</p>
              <p style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "2px" }}>Uses your household rules + event tags · Timeline updates on the left</p>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: "1.5rem" }}>
                  <div style={{ fontSize: "1.6rem", marginBottom: "0.8rem", opacity: 0.3 }}>◎</div>
                  <p style={{ color: "#6B7280", fontSize: "0.8rem", lineHeight: 1.65, maxWidth: "260px", margin: "0 auto 1.2rem" }}>
                    Tag events on the left, set your household rules (⚓), then ask for a schedule.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxWidth: "300px", margin: "0 auto" }}>
                    {quickPrompts.map((p, i) => (
                      <button key={i} onClick={() => sendMessage(p)} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "7px", color: "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.07)"}
                        onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.04)"}
                      >→ {p}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 0" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem" }}>✦</div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F9DC5C", animation: `pulse 1.2s ease ${i*0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "7px", alignItems: "flex-end", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "10px", padding: "8px 10px" }}>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Describe what you need or ask to adjust the schedule…" rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontFamily: "'Lora', serif", fontSize: "0.8rem", lineHeight: 1.5, maxHeight: "110px", overflowY: "auto" }} />
                <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{ width: "28px", height: "28px", borderRadius: "6px", background: input.trim() && !loading ? "linear-gradient(135deg, #F9DC5C, #F4844C)" : "rgba(255,255,255,0.06)", border: "none", color: input.trim() && !loading ? "#0D0F14" : "#4B5563", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.8rem" }}>↑</button>
              </div>
              <p style={{ fontSize: "0.56rem", fontFamily: "'DM Mono', monospace", color: "#374151", marginTop: "4px", textAlign: "center" }}>↵ Send · Shift+↵ New line · Everything auto-saved</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
