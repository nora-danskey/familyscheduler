import { useState, useRef, useEffect } from "react";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function load(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  { id: "1", summary: "Patrick: Work Travel (Chicago)", start: { date: "2026-03-02" }, end: { date: "2026-03-06" } },
  { id: "2", summary: "School Drop-off", start: { dateTime: "2026-03-02T08:00:00" }, end: { dateTime: "2026-03-02T08:30:00" } },
  { id: "3", summary: "Soccer Practice", start: { dateTime: "2026-03-04T16:00:00" }, end: { dateTime: "2026-03-04T17:30:00" } },
  { id: "4", summary: "Piano Recital", start: { dateTime: "2026-03-14T14:00:00" }, end: { dateTime: "2026-03-14T15:30:00" } },
  { id: "5", summary: "Book Club", start: { dateTime: "2026-03-11T19:00:00" }, end: { dateTime: "2026-03-11T21:00:00" } },
  { id: "6", summary: "Family Dinner (Grandma)", start: { dateTime: "2026-03-07T18:00:00" }, end: { dateTime: "2026-03-07T21:00:00" } },
];

const BLOCK_COLORS = {
  family:   { bg: "#8E24AA22", border: "#8E24AA", text: "#C084FC", label: "Family" },
  nora:     { bg: "#7986CB22", border: "#7986CB", text: "#93A8F4", label: "Nora" },
  patrick:  { bg: "#33B67922", border: "#33B679", text: "#4ADE80", label: "Patrick" },
  kids:     { bg: "#E67C7322", border: "#E67C73", text: "#FCA5A5", label: "Kids" },
  chores:   { bg: "#F6BF2622", border: "#F6BF26", text: "#FDE68A", label: "Chores" },
  exercise: { bg: "#0B804322", border: "#0B8043", text: "#6EE7B7", label: "Exercise" },
  work:     { bg: "#03468822", border: "#034688", text: "#7DD3FC", label: "Work" },
  free:     { bg: "#37415122", border: "#4B5563", text: "#9CA3AF", label: "Free time" },
};

function buildSystemPrompt(a, b, events, labels) {
  const tagLines = Object.entries(labels).map(([id, tag]) => {
    const ev = events.find(e => e.id === id);
    return ev ? `"${ev.summary}" → ${tag}` : null;
  }).filter(Boolean).join("\n");

  return `You are a warm, practical family scheduling assistant for ${a} and ${b}. You are NOT micromanage-y.

HOUSEHOLD:
- Two kids. Family mornings preferred. Each parent takes one child at bedtime (flexible).
- 45 hrs/week work each. ${b} travels every other week.
- Fairness over a 2-week window. Travel weeks bank equity for the following week.

EVENT TAGS: ${tagLines || "None yet — infer from names/context."}

CALENDAR DATA is sent with each message.

─── VISUAL SCHEDULE FORMAT ───
When suggesting a schedule, ALWAYS include a <SCHEDULE> block with structured daily time blocks so the app can render a visual timeline. Even if also giving text explanation, include this.

Format:
<SCHEDULE>
[
  {
    "date": "2026-02-24",
    "label": "Mon Feb 24",
    "blocks": [
      { "start": "07:00", "end": "08:30", "title": "Morning together", "who": "family", "note": "Breakfast, get kids ready" },
      { "start": "08:30", "end": "09:00", "title": "School drop-off", "who": "nora", "note": "" },
      { "start": "09:00", "end": "17:30", "title": "Work", "who": "patrick", "note": "45h/week" },
      { "start": "09:00", "end": "17:00", "title": "Work", "who": "nora", "note": "" },
      { "start": "17:00", "end": "18:30", "title": "Pickup + activities", "who": "patrick", "note": "" },
      { "start": "18:30", "end": "19:30", "title": "Dinner together", "who": "family", "note": "" },
      { "start": "19:30", "end": "20:30", "title": "Bedtime", "who": "nora", "note": "Takes both kids" },
      { "start": "20:30", "end": "22:00", "title": "Free time", "who": "patrick", "note": "" }
    ]
  }
]
</SCHEDULE>

WHO values: "family", "nora", "patrick", "kids", "chores", "exercise", "work", "free"
Use actual names ${a} and ${b} for who field (lowercase).
Only include days that have meaningful schedule suggestions — don't pad with empty days.
Keep blocks practical, not micromanage-y. 4-8 blocks per day is ideal.

─── GCAL PUSH FORMAT ───
When user confirms push to calendar:
<GCAL_EVENTS>
[{"summary":"...","description":"...","start":{"dateTime":"...","timeZone":"America/New_York"},"end":{"dateTime":"...","timeZone":"America/New_York"},"colorId":"..."}]
</GCAL_EVENTS>
Color IDs: 1=blue(${a}), 2=green(${b}), 3=purple(family), 4=red(kids), 5=yellow(chores), 10=green(exercise)`;
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
    if (ev.start?.date) return dayStr >= ev.start.date && dayStr < ev.end.date;
    return ev.start?.dateTime?.split("T")[0] === dayStr;
  });
}
function timeToMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(m) { const h = Math.floor(m / 60); const min = m % 60; return `${h}:${min.toString().padStart(2, "0")}${h < 12 ? "am" : "pm"}`.replace("12:00pm", "noon"); }

// ─── DAILY TIMELINE ───────────────────────────────────────────────────────────
function DayTimeline({ day, blocks, partnerAName, partnerBName }) {
  const START_MIN = 6 * 60;  // 6am
  const END_MIN = 22 * 60;   // 10pm
  const TOTAL = END_MIN - START_MIN;
  const HEIGHT = 320;

  function resolveColor(who) {
    const w = who?.toLowerCase();
    if (w === partnerAName?.toLowerCase() || w === "nora" || w === "partner a") return BLOCK_COLORS.nora;
    if (w === partnerBName?.toLowerCase() || w === "patrick" || w === "partner b") return BLOCK_COLORS.patrick;
    return BLOCK_COLORS[w] || BLOCK_COLORS.free;
  }

  const hourMarkers = [];
  for (let h = 7; h <= 21; h += 2) {
    const pct = ((h * 60 - START_MIN) / TOTAL) * 100;
    hourMarkers.push({ h, pct });
  }

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
        {day.label}
      </div>
      <div style={{ position: "relative", height: HEIGHT + "px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Hour gridlines */}
        {hourMarkers.map(({ h, pct }) => (
          <div key={h} style={{ position: "absolute", top: `${pct}%`, left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,0.04)", zIndex: 0 }}>
            <span style={{ position: "absolute", left: "6px", top: "-9px", fontSize: "0.55rem", fontFamily: "'DM Mono', monospace", color: "#374151" }}>
              {h > 12 ? `${h - 12}pm` : h === 12 ? "noon" : `${h}am`}
            </span>
          </div>
        ))}
        {/* Blocks */}
        {blocks.map((block, i) => {
          const startMin = timeToMin(block.start);
          const endMin = timeToMin(block.end);
          const top = Math.max(0, ((startMin - START_MIN) / TOTAL) * HEIGHT);
          const height = Math.max(18, ((endMin - startMin) / TOTAL) * HEIGHT);
          const c = resolveColor(block.who);
          return (
            <div key={i} style={{
              position: "absolute", left: "36px", right: "6px",
              top: top + "px", height: height + "px",
              background: c.bg, borderLeft: `3px solid ${c.border}`,
              borderRadius: "0 6px 6px 0", padding: "3px 6px",
              overflow: "hidden", zIndex: 1,
            }} title={block.note || block.title}>
              <div style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", color: c.text, fontWeight: 500, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {block.title}
              </div>
              {height > 30 && (
                <div style={{ fontSize: "0.55rem", color: c.border + "99", fontFamily: "'DM Mono', monospace" }}>
                  {minToTime(startMin)} – {minToTime(endMin)}
                  {block.note ? ` · ${block.note}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CALENDAR OVERVIEW STRIP ─────────────────────────────────────────────────
function CalendarStrip({ events, startDate, eventLabels, onEventClick, onDayClick, selectedDay, partnerAName, partnerBName, scheduleDays }) {
  const days = getWeekDays(startDate);
  const scheduledDates = new Set(scheduleDays.map(d => d.date));

  const tagColor = (tag) => {
    if (!tag) return null;
    if (tag === partnerAName || tag === "nora") return "#7986CB";
    if (tag === partnerBName || tag === "patrick") return "#33B679";
    if (tag === "both") return "#8E24AA";
    if (tag === "kids") return "#E67C73";
    if (tag === "needs coverage") return "#F6BF26";
    return "#6B7280";
  };

  function WeekRow({ weekDays, label }) {
    return (
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", color: "#6B7280", marginBottom: "4px", textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px" }}>
          {weekDays.map((day, i) => {
            const dayStr = day.toISOString().split("T")[0];
            const dayEvents = getEventsForDay(events, day);
            const isToday = day.toDateString() === new Date().toDateString();
            const isSelected = selectedDay === dayStr;
            const hasSchedule = scheduledDates.has(dayStr);
            return (
              <div key={i} onClick={() => onDayClick(dayStr)} style={{
                background: isSelected ? "rgba(249,220,92,0.1)" : isToday ? "rgba(249,220,92,0.05)" : "rgba(255,255,255,0.03)",
                border: isSelected ? "1px solid rgba(249,220,92,0.5)" : isToday ? "1px solid rgba(249,220,92,0.2)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px", padding: "6px 5px", minHeight: "72px", cursor: "pointer",
                transition: "all 0.15s",
              }}
                onMouseEnter={e => !isSelected && (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => !isSelected && (e.currentTarget.style.background = isToday ? "rgba(249,220,92,0.05)" : "rgba(255,255,255,0.03)")}
              >
                <div style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: isSelected ? "#F9DC5C" : isToday ? "#F9DC5C99" : "#6B7280", marginBottom: "3px" }}>
                  {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<br />
                  <span style={{ fontSize: "0.9rem", fontFamily: "'Playfair Display', serif", color: isSelected ? "#F9DC5C" : "#E5E7EB" }}>{day.getDate()}</span>
                </div>
                {hasSchedule && <div style={{ width: "6px", height: "2px", background: "#F9DC5C", borderRadius: "99px", marginBottom: "3px" }} />}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {dayEvents.slice(0, 2).map((ev, j) => {
                    const tag = eventLabels[ev.id];
                    const tc = tagColor(tag) || "#4B5563";
                    return (
                      <div key={j} onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                        style={{ fontSize: "0.55rem", background: tc + "20", borderLeft: `2px solid ${tc}`, color: tc, borderRadius: "2px", padding: "1px 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                        title={ev.summary}>
                        {ev.summary}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && <div style={{ fontSize: "0.5rem", color: "#4B5563" }}>+{dayEvents.length - 2}</div>}
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
      <WeekRow weekDays={days.slice(0, 7)} label="Week 1" />
      <WeekRow weekDays={days.slice(7, 14)} label="Week 2" />
    </div>
  );
}

// ─── EVENT LABEL POPUP ────────────────────────────────────────────────────────
function EventLabelPopup({ event, currentTag, onSelect, onClose, a, b }) {
  const tags = [
    { id: a, label: `${a}'s`, color: "#7986CB" },
    { id: b, label: `${b}'s`, color: "#33B679" },
    { id: "both", label: "Both", color: "#8E24AA" },
    { id: "kids", label: "Kids activity", color: "#E67C73" },
    { id: "needs coverage", label: "Needs coverage", color: "#F6BF26" },
    { id: "ignore", label: "Ignore", color: "#6B7280" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#1A1D24", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "20px", minWidth: "260px" }} onClick={e => e.stopPropagation()}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", color: "#F3F4F6", marginBottom: "4px", fontStyle: "italic" }}>{event.summary}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", color: "#6B7280", marginBottom: "14px" }}>Who does this belong to?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {tags.map(tag => (
            <button key={tag.id} onClick={() => onSelect(event.id, tag.id)} style={{ padding: "7px 12px", borderRadius: "7px", border: "none", cursor: "pointer", background: currentTag === tag.id ? tag.color + "25" : "rgba(255,255,255,0.04)", borderLeft: `3px solid ${tag.color}`, color: currentTag === tag.id ? tag.color : "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.75rem", textAlign: "left" }}>
              {currentTag === tag.id ? "✓ " : ""}{tag.label}
            </button>
          ))}
          {currentTag && <button onClick={() => onSelect(event.id, null)} style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", cursor: "pointer", marginTop: "4px" }}>Remove tag</button>}
        </div>
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
      {!isUser && <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", flexShrink: 0, marginRight: "7px", marginTop: "2px" }}>✦</div>}
      <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isUser ? "rgba(249,220,92,0.1)" : "rgba(255,255,255,0.05)", border: isUser ? "1px solid rgba(249,220,92,0.18)" : "1px solid rgba(255,255,255,0.07)", fontSize: "0.82rem", lineHeight: 1.65, color: "#E5E7EB", fontFamily: "'Lora', serif", whiteSpace: "pre-wrap" }}>
        {display}
        {msg.gcalEvents && <div style={{ marginTop: "8px", padding: "7px 10px", background: "rgba(51,182,121,0.1)", border: "1px solid rgba(51,182,121,0.3)", borderRadius: "7px", fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✓ {msg.gcalEvents.length} events ready to push</div>}
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
  const [scheduleDays, setScheduleDays] = useState(() => load("fs_schedule", [])); // [{date, label, blocks}]
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [leftTab, setLeftTab] = useState("overview"); // overview | day
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
    if (!gcalToken) { alert("Demo mode — no token."); return; }
    let pushed = 0;
    for (const ev of evs) {
      try {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          { method: "POST", headers: { Authorization: `Bearer ${gcalToken}`, "Content-Type": "application/json" }, body: JSON.stringify(ev) });
        pushed++;
      } catch {}
    }
    alert(`✓ Pushed ${pushed}/${evs.length} events to Google Calendar.`);
    setPendingGcalEvents(null);
  }

  function handleEventTag(id, tag) {
    setEventLabels(prev => { const u = { ...prev }; if (tag === null) delete u[id]; else u[id] = tag; return u; });
    setSelectedEvent(null);
  }

  function handleDayClick(dayStr) {
    const daySchedule = scheduleDays.find(d => d.date === dayStr);
    if (daySchedule) {
      setSelectedDay(dayStr);
      setLeftTab("day");
    } else {
      setSelectedDay(dayStr);
    }
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
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          system: buildSystemPrompt(partnerAName, partnerBName, events, eventLabels),
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "Something went wrong.";

      // Parse SCHEDULE blocks
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
          // Auto-select first day and switch to day view
          if (parsed.length > 0) {
            setSelectedDay(parsed[0].date);
            setLeftTab("day");
          }
        } catch (e) { console.error("Schedule parse failed", e); }
      }

      // Parse GCAL_EVENTS
      let gcalEvents = null;
      const gcalMatch = raw.match(/<GCAL_EVENTS>([\s\S]*?)<\/GCAL_EVENTS>/);
      if (gcalMatch) {
        try { gcalEvents = JSON.parse(gcalMatch[1].trim()); setPendingGcalEvents(gcalEvents); } catch {}
      }

      // Strip XML tags from display
      const displayText = raw
        .replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g, "")
        .replace(/<GCAL_EVENTS>[\s\S]*?<\/GCAL_EVENTS>/g, "")
        .trim();

      setMessages(prev => [...prev, { role: "assistant", content: displayText, gcalEvents }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong — please try again." }]);
    }
    setLoading(false);
  }

  const tagCount = Object.keys(eventLabels).length;
  const selectedDayData = scheduleDays.find(d => d.date === selectedDay);
  const quickPrompts = [
    `Analyze our calendar and suggest a fair two-week schedule`,
    `Who's taking on more right now?`,
    `${partnerBName} is traveling — how should we adjust?`,
    `Map out a typical weekday for us`,
    `Push the schedule to Google Calendar`,
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
                <p style={{ fontSize: "0.72rem", color: "#4B5563", marginTop: "6px", lineHeight: 1.5 }}>Get one at <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" style={{ color: "#7986CB" }}>Google OAuth Playground</a> — expires ~1 hour.</p>
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital@0;1&family=DM+Mono:wght@400;500&display=swap'); *{box-sizing:border-box;margin:0;padding:0} body{background:#0D0F14;overflow:hidden} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:99px} textarea{outline:none;resize:none} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}}`}</style>

      {selectedEvent && <EventLabelPopup event={selectedEvent} currentTag={eventLabels[selectedEvent.id]} onSelect={handleEventTag} onClose={() => setSelectedEvent(null)} a={partnerAName} b={partnerBName} />}

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0D0F14", fontFamily: "'Lora', serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>◎</div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", color: "#F3F4F6" }}>Family Scheduler</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", color: "#4B5563", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", padding: "2px 6px" }}>{gcalToken ? "● Live" : "◌ Demo"}</span>
            {tagCount > 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", color: "#F6BF26", background: "rgba(246,191,38,0.08)", border: "1px solid rgba(246,191,38,0.2)", borderRadius: "4px", padding: "2px 6px" }}>✦ {tagCount} tagged</span>}
            {scheduleDays.length > 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", color: "#33B679", background: "rgba(51,182,121,0.08)", border: "1px solid rgba(51,182,121,0.2)", borderRadius: "4px", padding: "2px 6px" }}>◈ {scheduleDays.length} days planned</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {[{ name: partnerAName, c: "#7986CB" }, { name: partnerBName, c: "#33B679" }].map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: p.c }} />
                <span style={{ fontSize: "0.72rem", color: "#9CA3AF", fontFamily: "'DM Mono', monospace" }}>{p.name}</span>
              </div>
            ))}
            <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
            <button onClick={() => { save("fs_setup_done", false); setView("setup"); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#6B7280", padding: "3px 8px", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>⚙</button>
            <button onClick={() => { if (window.confirm("Clear chat + schedule?")) { setMessages([]); setScheduleDays([]); save("fs_messages", []); save("fs_schedule", []); }}} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#6B7280", padding: "3px 8px", fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>↺</button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT PANEL */}
          <div style={{ width: "52%", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Left tabs */}
            <div style={{ display: "flex", padding: "10px 14px 0", gap: "4px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <button onClick={() => setLeftTab("overview")} style={{ padding: "5px 12px", borderRadius: "7px 7px 0 0", border: "none", background: leftTab === "overview" ? "rgba(255,255,255,0.07)" : "transparent", color: leftTab === "overview" ? "#E5E7EB" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>Overview</button>
              {scheduleDays.length > 0 && (
                <button onClick={() => setLeftTab("day")} style={{ padding: "5px 12px", borderRadius: "7px 7px 0 0", border: "none", background: leftTab === "day" ? "rgba(255,255,255,0.07)" : "transparent", color: leftTab === "day" ? "#F9DC5C" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                  Day View {selectedDayData ? `· ${selectedDayData.label}` : ""}
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "14px" }}>
              {/* OVERVIEW TAB */}
              {leftTab === "overview" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", color: "#F3F4F6", fontStyle: "italic" }}>Two-Week View</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", color: "#4B5563" }}>Click event to tag · Click day to see schedule</span>
                  </div>
                  {/* Color legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                    {[{ l: partnerAName, c: "#7986CB" }, { l: partnerBName, c: "#33B679" }, { l: "Both", c: "#8E24AA" }, { l: "Kids", c: "#E67C73" }, { l: "Coverage", c: "#F6BF26" }].map(t => (
                      <div key={t.l} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.c }} />
                        <span style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#6B7280" }}>{t.l}</span>
                      </div>
                    ))}
                  </div>
                  <CalendarStrip events={events} startDate={startDate} eventLabels={eventLabels} onEventClick={setSelectedEvent} onDayClick={handleDayClick} selectedDay={selectedDay} partnerAName={partnerAName} partnerBName={partnerBName} scheduleDays={scheduleDays} />
                  {pendingGcalEvents && (
                    <div style={{ marginTop: "12px", padding: "12px 14px", background: "rgba(51,182,121,0.08)", border: "1px solid rgba(51,182,121,0.25)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.78rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✦ {pendingGcalEvents.length} events ready</span>
                      <button onClick={() => pushToGCal(pendingGcalEvents)} style={{ padding: "5px 12px", background: "#33B679", border: "none", borderRadius: "7px", color: "#0D0F14", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer" }}>Push to GCal →</button>
                    </div>
                  )}
                </div>
              )}

              {/* DAY VIEW TAB */}
              {leftTab === "day" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", color: "#F3F4F6", fontStyle: "italic" }}>Daily Schedule</span>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {scheduleDays.map(d => (
                        <button key={d.date} onClick={() => setSelectedDay(d.date)} style={{ padding: "3px 8px", borderRadius: "5px", border: "none", background: selectedDay === d.date ? "rgba(249,220,92,0.15)" : "rgba(255,255,255,0.05)", color: selectedDay === d.date ? "#F9DC5C" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", cursor: "pointer" }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Color legend for timeline */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    {Object.entries(BLOCK_COLORS).slice(0, 6).map(([key, c]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <div style={{ width: "8px", height: "3px", background: c.border, borderRadius: "99px" }} />
                        <span style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: "#4B5563" }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                  {selectedDayData ? (
                    <DayTimeline day={selectedDayData} blocks={selectedDayData.blocks} partnerAName={partnerAName} partnerBName={partnerBName} />
                  ) : (
                    <div style={{ textAlign: "center", padding: "3rem 0", color: "#4B5563", fontFamily: "'DM Mono', monospace", fontSize: "0.75rem" }}>
                      Select a day from above or ask the AI to suggest a schedule
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: CHAT */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "0.95rem", color: "#F3F4F6", fontStyle: "italic" }}>Schedule with AI</p>
              <p style={{ fontSize: "0.68rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "2px" }}>Suggestions appear as visual timelines on the left · Chat auto-saved</p>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "14px" }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: "2rem" }}>
                  <div style={{ fontSize: "1.8rem", marginBottom: "1rem", opacity: 0.3 }}>◎</div>
                  <p style={{ color: "#6B7280", fontSize: "0.82rem", lineHeight: 1.65, maxWidth: "260px", margin: "0 auto 1.5rem" }}>
                    Tag events on the left, then ask me to suggest a schedule. I'll show it as a visual timeline.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxWidth: "300px", margin: "0 auto" }}>
                    {quickPrompts.map((p, i) => (
                      <button key={i} onClick={() => sendMessage(p)} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "7px", color: "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.07)"}
                        onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.04)"}
                      >→ {p}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 0" }}>
                  <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem" }}>✦</div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F9DC5C", animation: `pulse 1.2s ease ${i * 0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "7px", alignItems: "flex-end", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "9px 11px" }}>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Ask to suggest a schedule, adjust fairness, or describe what you need…" rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontFamily: "'Lora', serif", fontSize: "0.82rem", lineHeight: 1.5, maxHeight: "110px", overflowY: "auto" }} />
                <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{ width: "30px", height: "30px", borderRadius: "7px", background: input.trim() && !loading ? "linear-gradient(135deg, #F9DC5C, #F4844C)" : "rgba(255,255,255,0.06)", border: "none", color: input.trim() && !loading ? "#0D0F14" : "#4B5563", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.85rem" }}>↑</button>
              </div>
              <p style={{ fontSize: "0.58rem", fontFamily: "'DM Mono', monospace", color: "#374151", marginTop: "5px", textAlign: "center" }}>↵ Send · Shift+↵ New line · Schedule auto-saved</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
