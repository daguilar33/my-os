import { supabase } from './supabaseClient';
import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MAIN_ACCOUNTS  = ["Drumstick", "Oreo"];
const ALL_ACCOUNTS   = ["Drumstick", "Oreo", "Haagen Dasz", "Outshine", "Shops", "Frollies", "Thermador"];
const CAL_BRANDS     = ["Drumstick", "Oreo"];
const ACCOUNT_COLORS = {
  Drumstick: "#f472b6", Oreo: "#a78bfa", "Haagen Dasz": "#fb923c",
  Outshine: "#34d399", Shops: "#38bdf8", Frollies: "#fbbf24", Thermador: "#f87171",
};
const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CUR_MONTH = new Date().getMonth();
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', sans-serif";
const C = {
  bg:"#141416", surface:"#1c1c1f", surfaceHigh:"#242428",
  border:"#2e2e33", borderHigh:"#3a3a40",
  text:"#e8e8ed", textDim:"#8e8e99", textFaint:"#4a4a52",
  green:"#34d399", amber:"#fbbf24", purple:"#a78bfa", red:"#f87171",
};
const PLATFORMS = ["Meta","TikTok","Meta + TikTok","YouTube","Google","Other"];
const MANUAL_STATUSES = ["Pending","In progress","Live"];
const PLATFORM_COLORS = {
  Meta:"#1877f2", TikTok:"#ee1d52", "Meta + TikTok":"#a855f7",
  YouTube:"#ff0000", Google:"#34a853", Other:"#8e8e99",
};
const STATUS_COLORS = {
  Pending:       { bg:"#3f3f4620", text:"#8e8e99", border:"#3f3f46" },
  "In progress": { bg:"#fbbf2420", text:"#fbbf24", border:"#fbbf2460" },
  Live:          { bg:"#34d39920", text:"#34d399", border:"#34d39960" },
  Completed:     { bg:"#4a4a5220", text:"#4a4a52", border:"#4a4a5240" },
};

// ─── DEFAULT DATA ─────────────────────────────────────────────────────────────

const makeChecklist = (items) => items.map((label, i) => ({ id: i+1, label, done: false }));

const DEFAULT_PGD = MAIN_ACCOUNTS.reduce((acc, name) => {
  acc[name] = {
    lanzamiento: name === "Drumstick" ? "Mar 15" : "Mar 20",
    prelaunch: makeChecklist(["Study approved (BLS/SLS)", "Creatives in WL TWB", "Campaign set up", "QA done"]),
    boostPending: false, otherNotes: "",
    reporting: MONTHS.reduce((m, mo, idx) => {
      m[mo] = { active: idx === CUR_MONTH, reportDone: false, dueDate: "", note: "" };
      return m;
    }, {}),
  };
  return acc;
}, {});

const DEFAULT_BILLING_TASKS = [
  "Actualize Prisma",
  "Send IRI usage report",
  "Update Audit Doc",
  "Put invoices in LionBox",
  "Update Budget Tracker",
];
const DEFAULT_BILLING = MONTHS.reduce((acc, m) => {
  acc[m] = { tasks: DEFAULT_BILLING_TASKS.map((label, i) => ({ id: i+1, label, done: false })), note: "" };
  return acc;
}, {});

const DEFAULT_PACING = ALL_ACCOUNTS.reduce((acc, n) => {
  acc[n] = { updated: false, emailSent: false, note: "" };
  return acc;
}, {});

const makeJCCampaign = (id, name="", start="", end="") => ({
  id, name, start, end,
  checks: makeChecklist(["Piezas montadas", "Reporte enviado"]),
  pagado: false, nota: "",
});
const makeTTCampaign = (id, label="") => ({ id, label, pagado: false, nota: "" });

const DEFAULT_FREELANCE = {
  japancakes:    { name: "JapanCakes",    color: "#f472b6", aon: false, aonLabel: "Campaña AON extendida", campaigns: [makeJCCampaign(1,"Campaña Feb-Mar","2026-02-16","2026-03-16")] },
  technotickets: { name: "Techno Tickets",color: "#38bdf8", campaigns: [makeTTCampaign(1,"28 Feb"),makeTTCampaign(2,"3 Marzo"),makeTTCampaign(3,"2 Marzo")] },
};

const makeCalRow = (id, brand="Drumstick", campaign="", platform="Meta", start="", end="", manualStatus="Pending", note="") =>
  ({ id, brand, campaign, platform, start, end, manualStatus, note });

const DEFAULT_CALENDAR = [
  makeCalRow(1,"Drumstick","Q1 English","Meta","2026-01-01","2026-03-31","Live",""),
  makeCalRow(2,"Drumstick","Q1 TikTok","TikTok","2026-01-01","2026-03-31","Live",""),
  makeCalRow(3,"Oreo","Q2 Launch","Meta + TikTok","2026-04-01","2026-06-30","Pending","BLS pending"),
];

// ─── STORAGE (Supabase + LocalStorage) ────────────────────────────────────────

function usePersisted(key, defaultVal) {
  const [state, setState] = useState(defaultVal);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. CARGAR DATOS AL INICIAR (Desde Nube o Local)
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('os_settings')
          .select('config')
          .eq('user_id', 'mi_usuario_global')
          .single();

        if (data && data.config && data.config[key]) {
          setState(data.config[key]);
        } else {
          const stored = localStorage.getItem(key);
          if (stored) setState(JSON.parse(stored));
        }
      } catch (err) {
        console.warn("Iniciando con datos locales/default");
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, [key]);

  // 2. GUARDAR DATOS (Sincronización)
  const set = useCallback((updater) => {
    setState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      if (isLoaded) {
        localStorage.setItem(key, JSON.stringify(next));
        
        const syncToCloud = async (newData) => {
          // Primero obtenemos el objeto completo de la nube para no borrar otras pestañas
          const { data } = await supabase.from('os_settings').select('config').eq('user_id', 'mi_usuario_global').single();
          const currentConfig = data?.config || {};
          
          await supabase.from('os_settings').upsert({ 
            user_id: 'mi_usuario_global', 
            config: { ...currentConfig, [key]: newData }, 
            updated_at: new Date() 
          });
        };
        syncToCloud(next);
      }
      return next;
    });
  }, [key, isLoaded]);

  return [state, set];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
}

function getWednesdays() {
  const today = new Date(), day = today.getDay();
  const diff = day >= 3 ? day-3 : day+4;
  const last = new Date(today); last.setDate(today.getDate()-diff);
  const next = new Date(last); next.setDate(last.getDate()+7);
  const fmt = d => d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  return { last: fmt(last), next: fmt(next) };
}

function daysLeft(s) {
  if (!s) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((new Date(s+"T12:00:00") - today) / 86400000);
}

function resolveStatus(row) {
  if (!row.end) return row.manualStatus;
  return daysLeft(row.end) < 0 ? "Completed" : row.manualStatus;
}

// ─── BASE UI ─────────────────────────────────────────────────────────────────

const Check = ({ checked, onChange, label, onLabelChange, color=C.purple }) => {
  const [ed, setEd] = useState(false);
  const [v, setV]   = useState(label);
  useEffect(() => setV(label), [label]);
  return (
    <div style={{display:"flex",alignItems:"center",gap:9}}>
      <div onClick={onChange} style={{width:18,height:18,borderRadius:5,flexShrink:0,border:checked?"none":`2px solid ${C.borderHigh}`,background:checked?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.15s"}}>
        {checked && <span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}
      </div>
      {ed && onLabelChange
        ? <input autoFocus value={v} onChange={e=>setV(e.target.value)} onBlur={()=>{onLabelChange(v);setEd(false);}} onKeyDown={e=>{if(e.key==="Enter"){onLabelChange(v);setEd(false);}}} style={{background:C.surfaceHigh,border:`1px solid ${color}`,borderRadius:5,color:C.text,padding:"2px 8px",fontSize:12,fontFamily:MONO,outline:"none",flex:1}} />
        : <span onClick={()=>onLabelChange&&setEd(true)} title={onLabelChange?"Click to rename":""} style={{fontSize:12,fontFamily:MONO,color:checked?C.textFaint:C.textDim,textDecoration:checked?"line-through":"none",cursor:onLabelChange?"text":"default",flex:1}}>{label}</span>
      }
    </div>
  );
};

const Inline = ({ value, onChange, placeholder, bold, color, fontSize=13, mono=true }) => {
  const [ed, setEd] = useState(false);
  const [v, setV]   = useState(value);
  useEffect(() => setV(value), [value]);
  return ed
    ? <input autoFocus value={v} onChange={e=>setV(e.target.value)} onBlur={()=>{onChange(v);setEd(false);}} onKeyDown={e=>{if(e.key==="Enter"){onChange(v);setEd(false);}}} placeholder={placeholder} style={{background:C.surfaceHigh,border:`1px solid ${C.borderHigh}`,borderRadius:6,color:C.text,padding:"3px 8px",fontSize,fontFamily:mono?MONO:SANS,fontWeight:bold?700:400,outline:"none",minWidth:80,width:"100%"}} />
    : <span onClick={()=>setEd(true)} style={{fontSize,fontFamily:mono?MONO:SANS,fontWeight:bold?700:400,color:v?(color||C.text):C.textFaint,cursor:"text",borderBottom:`1px dashed ${C.borderHigh}`,paddingBottom:1,display:"inline-block"}}>{v||placeholder}</span>;
};

const NoteArea = ({ value, onChange, placeholder }) => {
  const [ed, setEd] = useState(false);
  const [v, setV]   = useState(value);
  useEffect(() => setV(value), [value]);
  return ed
    ? <textarea autoFocus value={v} onChange={e=>setV(e.target.value)} onBlur={()=>{onChange(v);setEd(false);}} placeholder={placeholder} rows={3} style={{background:C.surfaceHigh,border:`1px solid ${C.purple}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:12,fontFamily:MONO,outline:"none",width:"100%",lineHeight:1.5,resize:"vertical"}} />
    : <div onClick={()=>setEd(true)} style={{fontSize:12,fontFamily:MONO,color:v?C.textDim:C.textFaint,cursor:"text",background:C.bg,borderRadius:8,padding:"8px 10px",border:`1px solid ${C.border}`,minHeight:36,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{v||placeholder}</div>;
};

const Pill = ({children, color, small}) =>
  <span style={{background:color+"18",color,border:`1px solid ${color}35`,borderRadius:5,fontSize:small?10:11,fontWeight:700,padding:small?"1px 7px":"3px 9px",fontFamily:MONO,letterSpacing:0.2,whiteSpace:"nowrap"}}>{children}</span>;

const Dots = ({items}) => {
  const done = items.filter(Boolean).length;
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      {items.map((v,i) => <div key={i} style={{width:7,height:7,borderRadius:"50%",background:v?C.green:C.border,transition:"background 0.2s"}} />)}
      <span style={{fontSize:10,color:C.textFaint,fontFamily:MONO,fontWeight:600}}>{done}/{items.length}</span>
    </div>
  );
};

const Lbl = ({children}) =>
  <span style={{fontSize:10,fontWeight:700,color:C.textFaint,textTransform:"uppercase",letterSpacing:1,fontFamily:MONO,display:"block",marginBottom:8}}>{children}</span>;

const Card = ({children, accent, style:s={}}) =>
  <div style={{background:C.surface,borderRadius:14,border:`1px solid ${accent?accent+"40":C.border}`,padding:22,transition:"border-color 0.3s",...s}}>{children}</div>;

const Sec = ({children, style:s={}}) =>
  <div style={{background:C.surfaceHigh,borderRadius:10,padding:14,...s}}>{children}</div>;

const CollapseBlock = ({icon, title, badge, progressItems, children}) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          <span>{icon}</span>
          <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:MONO}}>{title}</span>
          {badge && <Pill color={C.textFaint}>{badge}</Pill>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          {progressItems && <Dots items={progressItems} />}
          <span style={{color:C.textFaint,fontSize:12,fontFamily:MONO}}>{open?"▲":"▼"}</span>
        </div>
      </button>
      {open && <div style={{borderTop:`1px solid ${C.border}`}}>{children}</div>}
    </div>
  );
};

const ChecklistEditor = ({items, onChange, color}) => {
  const toggle = id => onChange(items.map(i => i.id===id ? {...i,done:!i.done} : i));
  const rename = (id, l) => onChange(items.map(i => i.id===id ? {...i,label:l} : i));
  const add    = () => onChange([...items, {id:Date.now(), label:"New task", done:false}]);
  const remove = id => onChange(items.filter(i => i.id!==id));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      {items.map(item => (
        <div key={item.id} style={{display:"flex",alignItems:"center",gap:6}}>
          <Check checked={item.done} onChange={()=>toggle(item.id)} label={item.label} onLabelChange={v=>rename(item.id,v)} color={color} />
          <button onClick={()=>remove(item.id)} style={{background:"none",border:"none",color:C.textFaint,cursor:"pointer",fontSize:14,padding:"0 3px",flexShrink:0}}>×</button>
        </div>
      ))}
      <button onClick={add} style={{background:"none",border:`1px dashed ${C.borderHigh}`,borderRadius:6,color:C.textFaint,cursor:"pointer",fontFamily:MONO,fontSize:11,padding:"5px 10px",textAlign:"left",marginTop:2}}>+ add task</button>
    </div>
  );
};

// ─── DROPDOWN ─────────────────────────────────────────────────────────────────

const DropMenu = ({trigger, children}) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{position:"relative"}}>
      <div onClick={()=>setOpen(!open)}>{trigger}</div>
      {open && (
        <>
          <div style={{position:"fixed",inset:0,zIndex:199}} onClick={()=>setOpen(false)} />
          <div style={{position:"absolute",top:"110%",left:0,zIndex:200,background:C.surface,border:`1px solid ${C.borderHigh}`,borderRadius:10,padding:5,minWidth:140,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}} onClick={()=>setOpen(false)}>{children}</div>
        </>
      )}
    </div>
  );
};

const DropBtn = ({color, label, children}) => (
  <DropMenu trigger={<button style={{background:color+"18",color,border:`1px solid ${color}35`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:MONO,cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>}>{children}</DropMenu>
);

function MenuItem({color, onClick, children}) {
  return (
    <button onClick={onClick} style={{display:"block",width:"100%",background:"none",border:"none",padding:"7px 10px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,color,fontFamily:MONO,textAlign:"left"}}
      onMouseEnter={e=>e.currentTarget.style.background=color+"20"}
      onMouseLeave={e=>e.currentTarget.style.background="none"}>{children}</button>
  );
}

// ─── BILLING ─────────────────────────────────────────────────────────────────

function BillingBlock({billing, setBilling}) {
  const [activeMon, setActiveMon] = useState(MONTHS[CUR_MONTH]);
  const mon       = billing[activeMon];
  const updTasks  = tasks => setBilling(b => ({...b, [activeMon]:{...b[activeMon], tasks}}));
  const updNote   = note  => setBilling(b => ({...b, [activeMon]:{...b[activeMon], note}}));
  const allDone   = mon.tasks.every(t=>t.done);
  const doneCount = mon.tasks.filter(t=>t.done).length;
  const monthProgress = MONTHS.map(m => billing[m].tasks.every(t=>t.done));

  return (
    <CollapseBlock icon="💳" title="Billing" badge={`${doneCount}/${mon.tasks.length} this month`} progressItems={monthProgress}>
      <div style={{padding:"12px 22px",background:C.bg,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:700,color:C.textFaint,fontFamily:MONO,textTransform:"uppercase",letterSpacing:1,marginRight:4}}>Month</span>
        {MONTHS.map(m => {
          const mDone = billing[m].tasks.every(t=>t.done);
          return (
            <button key={m} onClick={()=>setActiveMon(m)} style={{background:activeMon===m?C.purple+"22":mDone?C.green+"10":"transparent",border:`1px solid ${activeMon===m?C.purple:mDone?C.green+"40":C.border}`,color:activeMon===m?C.purple:mDone?C.green:C.textFaint,borderRadius:7,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO,transition:"all 0.15s"}}>{m}</button>
          );
        })}
      </div>
      <div style={{padding:"20px 22px",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:15,fontWeight:800,color:C.text,fontFamily:MONO}}>{activeMon} — Billing</span>
            {allDone && <Pill color={C.green}>✓ Complete</Pill>}
          </div>
          <Dots items={mon.tasks.map(t=>t.done)} />
        </div>
        <Sec><ChecklistEditor items={mon.tasks} onChange={updTasks} color={C.purple} /></Sec>
        <div>
          <Lbl>Notes & clarifications</Lbl>
          <NoteArea value={mon.note} onChange={updNote} placeholder="e.g. TikTok invoices still pending, Meta arrived. Invoice #1234 waiting for approval…" />
        </div>
      </div>
    </CollapseBlock>
  );
}

// ─── REPORTING ────────────────────────────────────────────────────────────────

function ReportingBlock({name, color, reporting, onChange}) {
  const activeMonths = MONTHS.filter(m => reporting[m].active);
  return (
    <CollapseBlock icon="📈" title="Reporting" badge={`${activeMonths.length} active months`} progressItems={activeMonths.map(m=>reporting[m].reportDone)}>
      <div style={{padding:"14px 22px"}}>
        <p style={{fontSize:11,color:C.textFaint,fontFamily:MONO,marginBottom:14}}>Toggle the months this account runs ads.</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
          {MONTHS.map(m => {
            const active = reporting[m].active;
            return <button key={m} onClick={()=>onChange(m,"active",!active)} style={{background:active?color+"22":"transparent",border:`1px solid ${active?color:C.border}`,color:active?color:C.textFaint,borderRadius:7,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO,transition:"all 0.15s"}}>{m}</button>;
          })}
        </div>
        {activeMonths.length===0 && <p style={{fontSize:12,color:C.textFaint,fontFamily:MONO}}>No active months selected.</p>}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {activeMonths.map(m => {
            const r = reporting[m];
            return (
              <div key={m} style={{background:C.bg,borderRadius:10,padding:"14px 16px",border:`1px solid ${r.reportDone?color+"40":C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:800,fontFamily:MONO,color,width:36}}>{m}</span>
                  <Check checked={r.reportDone} onChange={()=>onChange(m,"reportDone",!r.reportDone)} label="Report sent" color={color} />
                  <div style={{display:"inline-flex",alignItems:"center",gap:8,background:C.surfaceHigh,borderRadius:7,padding:"5px 12px",marginLeft:"auto"}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.textFaint,fontFamily:MONO,textTransform:"uppercase",letterSpacing:1,whiteSpace:"nowrap"}}>Due</span>
                    <Inline value={r.dueDate} onChange={v=>onChange(m,"dueDate",v)} placeholder="e.g. Mar 5" bold color={r.reportDone?C.textFaint:C.amber} fontSize={12} />
                  </div>
                </div>
                <Inline value={r.note} onChange={v=>onChange(m,"note",v)} placeholder="Note…" fontSize={12} color={C.textDim} />
              </div>
            );
          })}
        </div>
      </div>
    </CollapseBlock>
  );
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────

function SocialCalendarTab({calendar, setCalendar}) {
  const mobile = useIsMobile();
  const [filter, setFilter] = useState("All");

  const update = (id,f,v) => setCalendar(rows => rows.map(r => r.id===id ? {...r,[f]:v} : r));
  const remove = (id)      => setCalendar(rows => rows.filter(r => r.id!==id));
  const add    = ()        => setCalendar(rows => [...rows, makeCalRow(Date.now(),"Drumstick")]);

  const filtered = filter==="All" ? calendar : calendar.filter(r=>r.brand===filter);
  const counts = {Pending:0,"In progress":0,Live:0,Completed:0};
  calendar.forEach(r => { const s=resolveStatus(r); if(counts[s]!==undefined) counts[s]++; });

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {Object.entries(counts).map(([s,n]) => {
          const sc = STATUS_COLORS[s];
          return <div key={s} style={{background:sc.bg,border:`1px solid ${sc.border}`,borderRadius:8,padding:"6px 12px",display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:16,fontWeight:800,color:sc.text,fontFamily:MONO}}>{n}</span><span style={{fontSize:11,fontWeight:700,color:sc.text,fontFamily:MONO}}>{s}</span></div>;
        })}
        <div style={{marginLeft:"auto",display:"flex",gap:4,flexWrap:"wrap"}}>
          {["All",...CAL_BRANDS].map(f => {
            const isAll = f==="All";
            const color = isAll ? C.textDim : ACCOUNT_COLORS[f];
            return <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?(isAll?C.surfaceHigh:color+"22"):"transparent",color:filter===f?(isAll?C.text:color):C.textFaint,border:`1px solid ${filter===f?(isAll?C.borderHigh:color+"60"):C.border}`,borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO,transition:"all 0.15s"}}>{f}</button>;
          })}
        </div>
      </div>

      <div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        {!mobile && (
          <div style={{display:"grid",gridTemplateColumns:"2fr 110px 120px 195px 110px 1fr 24px",padding:"10px 18px",background:C.bg,borderBottom:`1px solid ${C.border}`,gap:10,alignItems:"center"}}>
            {["Campaign","Brand","Platform","Flight","Status","Notes",""].map(h=><span key={h} style={{fontSize:10,fontWeight:700,color:C.textFaint,textTransform:"uppercase",letterSpacing:1,fontFamily:MONO}}>{h}</span>)}
          </div>
        )}

        {filtered.length===0 && <div style={{padding:32,textAlign:"center",color:C.textFaint,fontFamily:MONO,fontSize:13}}>No campaigns yet.</div>}

        {filtered.map((row,i) => {
          const status = resolveStatus(row);
          const isAuto = status==="Completed";
          const days   = daysLeft(row.end);
          const isExpiring = days!==null && days>=0 && days<=7 && !isAuto;
          const rowColor   = ACCOUNT_COLORS[row.brand]||C.textDim;
          const sc         = STATUS_COLORS[status]||STATUS_COLORS.Pending;

          if (mobile) return (
            <div key={row.id} style={{padding:"14px 18px",borderTop:i>0?`1px solid ${C.border}`:"none",opacity:isAuto?0.5:1,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <Inline value={row.campaign} onChange={v=>update(row.id,"campaign",v)} placeholder="Campaign name" bold fontSize={13} color={rowColor} />
                <button onClick={()=>remove(row.id)} style={{background:"none",border:"none",color:C.textFaint,cursor:"pointer",fontSize:16,padding:0,flexShrink:0}}>×</button>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <DropBtn color={rowColor} label={row.brand||"—"}>{CAL_BRANDS.map(a=><MenuItem key={a} color={ACCOUNT_COLORS[a]} onClick={()=>update(row.id,"brand",a)}>{a}</MenuItem>)}</DropBtn>
                <DropBtn color={PLATFORM_COLORS[row.platform]||"#8e8e99"} label={row.platform}>{PLATFORMS.map(p=><MenuItem key={p} color={PLATFORM_COLORS[p]||"#8e8e99"} onClick={()=>update(row.id,"platform",p)}>{p}</MenuItem>)}</DropBtn>
                <DropMenu trigger={<button style={{background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:MONO,cursor:isAuto?"default":"pointer",whiteSpace:"nowrap"}}>{status}{isAuto&&<span style={{fontSize:9,opacity:0.5}}> auto</span>}</button>}>
                  {!isAuto&&MANUAL_STATUSES.map(s=><MenuItem key={s} color={STATUS_COLORS[s].text} onClick={()=>update(row.id,"manualStatus",s)}>{s}</MenuItem>)}
                </DropMenu>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,fontFamily:MONO,color:C.textDim}}>
                <input type="date" value={row.start} onChange={e=>update(row.id,"start",e.target.value)} style={{background:"transparent",border:"none",color:C.textDim,fontSize:11,fontFamily:MONO,outline:"none",cursor:"pointer"}} />
                <span style={{color:C.textFaint}}>→</span>
                <input type="date" value={row.end} onChange={e=>update(row.id,"end",e.target.value)} style={{background:"transparent",border:"none",color:isExpiring?C.amber?C.textDim:C.textDim,fontSize:11,fontFamily:MONO,outline:"none",cursor:"pointer"}} />
                {isExpiring&&<span style={{color:C.amber,fontWeight:700}}>{days}d</span>}
              </div>
              <Inline value={row.note} onChange={v=>update(row.id,"note",v)} placeholder="Note…" fontSize={12} color={C.textDim} />
            </div>
          );

          return (
            <div key={row.id} style={{display:"grid",gridTemplateColumns:"2fr 110px 120px 195px 110px 1fr 24px",padding:"12px 18px",gap:10,alignItems:"center",borderTop:i>0?`1px solid ${C.border}`:"none",opacity:isAuto?0.5:1,transition:"opacity 0.2s"}}
              onMouseEnter={e=>{if(!isAuto)e.currentTarget.style.background="#ffffff05";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
              <Inline value={row.campaign} onChange={v=>update(row.id,"campaign",v)} placeholder="Campaign name" bold fontSize={13} color={rowColor} />
              <DropBtn color={rowColor} label={row.brand||"—"}>{CAL_BRANDS.map(a=><MenuItem key={a} color={ACCOUNT_COLORS[a]} onClick={()=>update(row.id,"brand",a)}>{a}</MenuItem>)}</DropBtn>
              <DropBtn color={PLATFORM_COLORS[row.platform]||"#8e8e99"} label={row.platform}>{PLATFORMS.map(p=><MenuItem key={p} color={PLATFORM_COLORS[p]||"#8e8e99"} onClick={()=>update(row.id,"platform",p)}>{p}</MenuItem>)}</DropBtn>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <input type="date" value={row.start} onChange={e=>update(row.id,"start",e.target.value)} style={{background:"transparent",border:"none",color:C.textDim,fontSize:11,fontFamily:MONO,outline:"none",cursor:"pointer",width:88}} />
                <span style={{color:C.textFaint,fontSize:10}}>→</span>
                <input type="date" value={row.end} onChange={e=>update(row.id,"end",e.target.value)} style={{background:"transparent",border:"none",color:isExpiring?C.amber:C.textDim,fontSize:11,fontFamily:MONO,outline:"none",cursor:"pointer",width:88}} />
                {isExpiring&&<span style={{fontSize:10,color:C.amber,fontFamily:MONO,fontWeight:700}}>{days}d</span>}
              </div>
              <DropMenu trigger={<button style={{background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:MONO,cursor:isAuto?"default":"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>{status==="Live"&&<span style={{width:6,height:6,borderRadius:"50%",background:sc.text,boxShadow:`0 0 6px ${sc.text}`}} />}{status}{isAuto&&<span style={{fontSize:9,opacity:0.5}}>auto</span>}</button>}>
                {!isAuto&&MANUAL_STATUSES.map(s=><MenuItem key={s} color={STATUS_COLORS[s].text} onClick={()=>update(row.id,"manualStatus",s)}>{s}</MenuItem>)}
              </DropMenu>
              <Inline value={row.note} onChange={v=>update(row.id,"note",v)} placeholder="Note…" fontSize={12} color={C.textDim} />
              <button onClick={()=>remove(row.id)} style={{background:"none",border:"none",color:C.textFaint,cursor:"pointer",fontSize:14,padding:0}}>×</button>
            </div>
          );
        })}

        <div style={{borderTop:`1px solid ${C.border}`}}>
          <button onClick={add} style={{width:"100%",background:"none",border:"none",padding:"13px 18px",color:C.textFaint,cursor:"pointer",fontFamily:MONO,fontSize:12,fontWeight:700,textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background="#ffffff05"}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>+ Add campaign</button>
        </div>
      </div>
      <p style={{fontSize:11,color:C.textFaint,fontFamily:MONO,marginTop:10}}>
        💡 Status auto-switches to <span style={{color:STATUS_COLORS.Completed.text}}>Completed</span> when end date passes · Click any field to edit
      </p>
    </div>
  );
}

// ─── FREELANCE ────────────────────────────────────────────────────────────────

function JapanCakesCard({data, onChange}) {
  const {name, color, aon, aonLabel, campaigns} = data;
  const allDone = campaigns.length>0 && campaigns.every(c=>c.checks.every(ch=>ch.done)&&c.pagado);
  const updCamp = (id, upd) => onChange({...data, campaigns: campaigns.map(c=>c.id===id?upd(c):c)});
  const remCamp = (id)      => onChange({...data, campaigns: campaigns.filter(c=>c.id!==id)});
  const addCamp = ()        => onChange({...data, campaigns: [...campaigns, makeJCCampaign(Date.now())]});
  return (
    <Card accent={allDone?color:null}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:color}} />
          <span style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:MONO}}>{name}</span>
          <Pill color={color} small>Trafficker</Pill>
        </div>
        {allDone&&<Pill color={color}>✓ Al día</Pill>}
      </div>
      <div style={{marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${C.border}`}}>
        <Check checked={aon} onChange={()=>onChange({...data,aon:!aon})} label={aonLabel} onLabelChange={v=>onChange({...data,aonLabel:v})} color={color} />
      </div>
      <Lbl>Campañas activas</Lbl>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {campaigns.map(camp => {
          const days = daysLeft(camp.end);
          const isExpired = days!==null&&days<0;
          const isUrgent  = days!==null&&days>=0&&days<=5;
          const campDone  = camp.checks.every(c=>c.done)&&camp.pagado;
          return (
            <div key={camp.id} style={{background:C.bg,borderRadius:12,border:`1px solid ${campDone?color+"40":isExpired?"#f8717140":C.border}`,padding:16}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:140}}>
                  <Lbl>Campaign name</Lbl>
                  <Inline value={camp.name} onChange={v=>updCamp(camp.id,c=>({...c,name:v}))} placeholder="e.g. Feb-Mar Campaign" bold color={color} fontSize={13} />
                </div>
                <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                  <div><Lbl>Start</Lbl><input type="date" value={camp.start} onChange={e=>updCamp(camp.id,c=>({...c,start:e.target.value}))} style={{background:C.surfaceHigh,border:`1px solid ${C.borderHigh}`,borderRadius:6,color:C.text,padding:"4px 8px",fontSize:11,fontFamily:MONO,outline:"none",cursor:"pointer"}} /></div>
                  <div><Lbl>End</Lbl><input type="date" value={camp.end} onChange={e=>updCamp(camp.id,c=>({...c,end:e.target.value}))} style={{background:C.surfaceHigh,border:`1px solid ${C.borderHigh}`,borderRadius:6,color:C.text,padding:"4px 8px",fontSize:11,fontFamily:MONO,outline:"none",cursor:"pointer"}} /></div>
                  {camp.end&&<span style={{fontSize:11,fontFamily:MONO,fontWeight:700,padding:"4px 10px",borderRadius:6,background:isExpired?"#f8717120":isUrgent?C.amber+"20":C.green+"15",color:isExpired?"#f87171":isUrgent?C.amber:C.green}}>{isExpired?`Venció hace ${Math.abs(days)}d`:days===0?"Hoy vence":`${days}d restantes`}</span>}
                </div>
                <button onClick={()=>remCamp(camp.id)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.textFaint,cursor:"pointer",fontSize:12,padding:"4px 8px",fontFamily:MONO,flexShrink:0}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"start"}}>
                <ChecklistEditor items={camp.checks} onChange={checks=>updCamp(camp.id,c=>({...c,checks}))} color={color} />
                <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:130}}>
                  <Check checked={camp.pagado} onChange={()=>updCamp(camp.id,c=>({...c,pagado:!c.pagado}))} label="Pago recibido" color={C.green} />
                  <Inline value={camp.nota} onChange={v=>updCamp(camp.id,c=>({...c,nota:v}))} placeholder="Nota…" fontSize={11} />
                </div>
              </div>
            </div>
          );
        })}
        <button onClick={addCamp} style={{background:"none",border:`2px dashed ${color+"40"}`,borderRadius:10,color,cursor:"pointer",fontFamily:MONO,fontSize:12,fontWeight:700,padding:10,textAlign:"center"}}
          onMouseEnter={e=>e.currentTarget.style.background=color+"10"}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>+ Nueva campaña</button>
      </div>
    </Card>
  );
}

function TechnoTicketsCard({data, onChange}) {
  const {name, color, campaigns} = data;
  const pending = campaigns.filter(c=>!c.pagado).length;
  const updCamp = (id,f,v) => onChange({...data, campaigns: campaigns.map(c=>c.id===id?{...c,[f]:v}:c)});
  const remCamp = (id)     => onChange({...data, campaigns: campaigns.filter(c=>c.id!==id)});
  const addCamp = ()       => onChange({...data, campaigns: [...campaigns, makeTTCampaign(Date.now())]});
  return (
    <Card>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:color}} />
          <span style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:MONO}}>{name}</span>
          <Pill color={color} small>Trafficker</Pill>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {pending>0&&<Pill color={C.amber}>{pending} pago{pending>1?"s":""} pendiente{pending>1?"s":""}</Pill>}
          {pending===0&&campaigns.length>0&&<Pill color={C.green}>✓ Todo pagado</Pill>}
        </div>
      </div>
      <Lbl>Campañas — pago por campaña</Lbl>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {campaigns.map(camp => (
          <div key={camp.id} style={{display:"flex",alignItems:"center",gap:10,background:C.bg,borderRadius:10,padding:"12px 16px",border:`1px solid ${camp.pagado?C.green+"30":C.border}`,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:120}}><Inline value={camp.label} onChange={v=>updCamp(camp.id,"label",v)} placeholder="Campaign name / date" bold fontSize={13} color={camp.pagado?C.textFaint:C.text} /></div>
            <Inline value={camp.nota} onChange={v=>updCamp(camp.id,"nota",v)} placeholder="Note…" fontSize={11} />
            <Check checked={camp.pagado} onChange={()=>updCamp(camp.id,"pagado",!camp.pagado)} label="Pagado" color={C.green} />
            <button onClick={()=>remCamp(camp.id)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.textFaint,cursor:"pointer",fontSize:12,padding:"3px 7px",fontFamily:MONO}}>✕</button>
          </div>
        ))}
        <button onClick={addCamp} style={{background:"none",border:`2px dashed ${color+"40"}`,borderRadius:10,color,cursor:"pointer",fontFamily:MONO,fontSize:12,fontWeight:700,padding:10,textAlign:"center"}}
          onMouseEnter={e=>e.currentTarget.style.background=color+"10"}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>+ Nueva campaña</button>
      </div>
    </Card>
  );
}

function FreelanceTab({freelance, setFreelance}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <JapanCakesCard data={freelance.japancakes} onChange={d=>setFreelance(f=>({...f,japancakes:d}))} />
      <TechnoTicketsCard data={freelance.technotickets} onChange={d=>setFreelance(f=>({...f,technotickets:d}))} />
    </div>
  );
}

// ─── PGD ─────────────────────────────────────────────────────────────────────

function AccountCard({name, data, onChange, mobile}) {
  const color = ACCOUNT_COLORS[name];
  const readyToLaunch = data.prelaunch.every(i=>i.done);
  const updReporting  = (month,field,value) => onChange({...data, reporting:{...data.reporting,[month]:{...data.reporting[month],[field]:value}}});
  return (
    <Card accent={readyToLaunch?color:null} style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:color}} />
          <span style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:MONO}}>{name}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {readyToLaunch&&<Pill color={color}>🚀 READY TO LAUNCH</Pill>}
          <Dots items={data.prelaunch.map(i=>i.done)} />
        </div>
      </div>
      <div style={{display:"inline-flex",alignItems:"center",gap:10,background:C.bg,borderRadius:9,padding:"8px 14px",alignSelf:"flex-start"}}>
        <span style={{fontSize:10,fontWeight:700,color:C.textFaint,fontFamily:MONO,textTransform:"uppercase",letterSpacing:1}}>Next launch</span>
        <Inline value={data.lanzamiento} onChange={v=>onChange({...data,lanzamiento:v})} placeholder="e.g. Mar 15" bold color={color} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:12}}>
        <Sec>
          <Lbl>Pre-launch checklist</Lbl>
          <ChecklistEditor items={data.prelaunch} onChange={items=>onChange({...data,prelaunch:items})} color={color} />
        </Sec>
        <Sec style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <Lbl>Post / Additional</Lbl>
            <Check checked={data.boostPending} onChange={()=>onChange({...data,boostPending:!data.boostPending})} label="Organic boost pending" color={C.amber} />
          </div>
          <div>
            <Lbl>Other pending</Lbl>
            <Inline value={data.otherNotes} onChange={v=>onChange({...data,otherNotes:v})} placeholder="Add note…" fontSize={12} />
          </div>
        </Sec>
      </div>
      <ReportingBlock name={name} color={color} reporting={data.reporting} onChange={updReporting} />
    </Card>
  );
}

function PGDTab({pgd, setPGD, billing, setBilling, pacing, setPacing}) {
  const mobile = useIsMobile();
  const wed    = getWednesdays();
  const updPacing    = (name,f,v) => setPacing(p=>({...p,[name]:{...p[name],[f]:v}}));
  const pacingProg   = ALL_ACCOUNTS.map(n=>pacing[n].updated&&pacing[n].emailSent);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {MAIN_ACCOUNTS.map(name => (
        <AccountCard key={name} name={name} data={pgd[name]} onChange={d=>setPGD(a=>({...a,[name]:d}))} mobile={mobile} />
      ))}

      <CollapseBlock icon="📊" title="Pacing" badge={`${ALL_ACCOUNTS.length} accounts`} progressItems={pacingProg}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 22px",background:C.bg,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
            <div><Lbl>Last Wednesday</Lbl><span style={{fontSize:13,fontWeight:700,color:C.textDim,fontFamily:MONO}}>{wed.last}</span></div>
            <div><Lbl>Next Wednesday</Lbl><span style={{fontSize:13,fontWeight:700,color:C.amber,fontFamily:MONO}}>{wed.next}</span></div>
          </div>
          <button onClick={()=>setPacing(DEFAULT_PACING)} style={{background:C.surfaceHigh,color:C.textDim,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>↺ Reset week</button>
        </div>
        {!mobile&&<div style={{display:"grid",gridTemplateColumns:"150px 1fr 1fr 1fr",padding:"9px 22px",background:C.bg,gap:12,borderBottom:`1px solid ${C.border}`}}>{["Account","Pacing updated","Email sent","Notes"].map(h=><span key={h} style={{fontSize:10,fontWeight:700,color:C.textFaint,textTransform:"uppercase",letterSpacing:1,fontFamily:MONO}}>{h}</span>)}</div>}
        {ALL_ACCOUNTS.map((name,i) => {
          const p = pacing[name]; const done = p.updated&&p.emailSent;
          if (mobile) return (
            <div key={name} style={{padding:"14px 22px",borderTop:i>0?`1px solid ${C.border}`:"none",background:done?"#34d39908":"transparent",display:"flex",flexDirection:"column",gap:10}}>
              <span style={{fontSize:13,fontWeight:700,color:ACCOUNT_COLORS[name],fontFamily:MONO}}>{name}</span>
              <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                <Check checked={p.updated} onChange={()=>updPacing(name,"updated",!p.updated)} label="Pacing updated" color={C.green} />
                <Check checked={p.emailSent} onChange={()=>updPacing(name,"emailSent",!p.emailSent)} label="Email sent" color={C.purple} />
              </div>
              <Inline value={p.note} onChange={v=>updPacing(name,"note",v)} placeholder="Note…" fontSize={12} />
            </div>
          );
          return (
            <div key={name} style={{display:"grid",gridTemplateColumns:"150px 1fr 1fr 1fr",padding:"13px 22px",gap:12,alignItems:"center",borderTop:i>0?`1px solid ${C.border}`:"none",background:done?"#34d39908":"transparent"}}>
              <span style={{fontSize:13,fontWeight:700,color:ACCOUNT_COLORS[name],fontFamily:MONO}}>{name}</span>
              <Check checked={p.updated} onChange={()=>updPacing(name,"updated",!p.updated)} label="Updated" color={C.green} />
              <Check checked={p.emailSent} onChange={()=>updPacing(name,"emailSent",!p.emailSent)} label="Sent" color={C.purple} />
              <Inline value={p.note} onChange={v=>updPacing(name,"note",v)} placeholder="Note…" fontSize={12} />
            </div>
          );
        })}
      </CollapseBlock>

      <BillingBlock billing={billing} setBilling={setBilling} />
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("pgd");
  const mobile = useIsMobile();

  const [pgd,       setPGD]       = usePersisted("myos:pgd",       DEFAULT_PGD);
  const [billing,   setBilling]   = usePersisted("myos:billing",   DEFAULT_BILLING);
  const [pacing,    setPacing]    = usePersisted("myos:pacing",    DEFAULT_PACING);
  const [freelance, setFreelance] = usePersisted("myos:freelance", DEFAULT_FREELANCE);
  const [calendar,  setCalendar]  = usePersisted("myos:calendar",  DEFAULT_CALENDAR);

  const TABS = [["pgd","🏢 PGD"],["calendar","📅 CAL"],["freelance","⚡ FL"]];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #1c1c1e; }
        ::-webkit-scrollbar-thumb { background: #3a3a3c; border-radius: 3px; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        textarea { resize: vertical; }
      `}</style>

      <div style={{fontFamily:SANS, minHeight:"100vh", background:C.bg, color:C.text}}>
        <div style={{background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 16px", display:"flex", alignItems:"center", gap:12, height:50, position:"sticky", top:0, zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:24,height:24,background:`linear-gradient(135deg,${C.purple},${C.green})`,borderRadius:6}} />
            {!mobile&&<span style={{fontWeight:800,fontSize:13,letterSpacing:-0.3,color:C.text,fontFamily:MONO}}>MY_OS<span style={{color:C.green}}>_</span></span>}
          </div>
          <div style={{display:"flex",gap:2,background:C.bg,borderRadius:9,padding:3,border:`1px solid ${C.border}`}}>
            {TABS.map(([v,label])=>(
              <button key={v} onClick={()=>setTab(v)} style={{padding:mobile?"6px 14px":"5px 16px",borderRadius:7,border:"none",background:tab===v?C.surfaceHigh:"transparent",color:tab===v?C.text:C.textFaint,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:MONO,transition:"all 0.15s",letterSpacing:0.3}}>{label}</button>
            ))}
          </div>
          <div style={{marginLeft:"auto"}}>
            <span style={{fontSize:mobile?10:11,color:C.textFaint,fontFamily:MONO}}>
              {new Date().toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short"}).toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{maxWidth:tab==="calendar"&&!mobile?1100:900, margin:"0 auto", padding:mobile?"16px 12px":"28px 20px", transition:"max-width 0.2s"}}>
          <div style={{marginBottom:20}}>
            <h1 style={{fontSize:mobile?18:22,fontWeight:800,color:C.text,fontFamily:MONO,letterSpacing:-0.5,marginBottom:4}}>
              {tab==="pgd"?"PGD — Account Overview":tab==="calendar"?"Social Calendar":"Freelance — Clientes"}
            </h1>
            <p style={{fontSize:11,color:C.textFaint,fontFamily:MONO}}>
              {tab==="pgd"?"Drumstick · Oreo · Pacing · Billing":tab==="calendar"?"Drumstick & Oreo upcoming campaigns":"JapanCakes · Techno Tickets"}
            </p>
          </div>

          {tab==="pgd"
            ? <PGDTab pgd={pgd} setPGD={setPGD} billing={billing} setBilling={setBilling} pacing={pacing} setPacing={setPacing} />
            : tab==="calendar"
            ? <SocialCalendarTab calendar={calendar} setCalendar={setCalendar} />
            : <FreelanceTab freelance={freelance} setFreelance={setFreelance} />
          }
        </div>
      </div>
    </>
  );
}