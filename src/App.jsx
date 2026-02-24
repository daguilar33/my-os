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

// ─── STORAGE (Sincronizado con Supabase) ──────────────────────────────────────

function usePersisted(key, defaultVal) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultVal;
    } catch { return defaultVal; }
  });

  // Efecto para cargar datos desde Supabase al iniciar
  useEffect(() => {
    const loadFromCloud = async () => {
      const { data, error } = await supabase
        .from('os_settings')
        .select('config')
        .eq('user_id', 'usuario_unico')
        .single();
      
      if (data && data.config && data.config[key]) {
        setState(data.config[key]);
      }
    };
    loadFromCloud();
  }, [key]);

  const set = useCallback((updater) => {
    setState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      // Guardar en LocalStorage (PC actual)
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      
      // Guardar en Supabase (Nube para móvil)
      const syncToCloud = async (newData) => {
        try {
          // Primero obtenemos el estado actual completo para no borrar otras pestañas
          const { data: current } = await supabase
            .from('os_settings')
            .select('config')
            .eq('user_id', 'usuario_unico')
            .single();

          const fullConfig = current?.config || {};
          fullConfig[key] = newData;

          await supabase
            .from('os_settings')
            .upsert({ 
              user_id: 'usuario_unico', 
              config: fullConfig, 
              updated_at: new Date() 
            });
        } catch (err) { console.error("Cloud sync error:", err); }
      };
      
      syncToCloud(next);
      return next;
    });
  }, [key]);

  return [state, set];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);
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

// ─── BASE UI (Igual que el original) ──────────────────────────────────────────

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
  const monthProgress = MONTHS.map(m => billing[m].tasks.every(t=>t.done));

  return (
    <CollapseBlock icon="💳" title="Billing" badge={`${mon.tasks.filter(t=>t.done).length}/${mon.tasks.length} this month`} progressItems={monthProgress}>
      <div style={{padding:"12px 22px",background:C.bg,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        {MONTHS.map(m => {
          const mDone = billing[m].tasks.every(t=>t.done);
          return (
            <button key={m} onClick={()=>setActiveMon(m)} style={{background:activeMon===m?C.purple+"22":mDone?C.green+"10":"transparent",border:`1px solid ${activeMon===m?C.purple:mDone?C.green+"40":C.border}`,color:activeMon===m?C.purple:mDone?C.green:C.textFaint,borderRadius:7,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>{m}</button>
          );
        })}
      </div>
      <div style={{padding:"20px 22px",display:"flex",flexDirection:"column",gap:16}}>
        <Sec><ChecklistEditor items={mon.tasks} onChange={updTasks} color={C.purple} /></Sec>
        <NoteArea value={mon.note} onChange={updNote} placeholder="Notes..." />
      </div>
    </CollapseBlock>
  );
}

// ─── REPORTING ────────────────────────────────────────────────────────────────

function ReportingBlock({name, color, reporting, onChange}) {
  const activeMonths = MONTHS.filter(m => reporting[m].active);
  return (
    <CollapseBlock icon="📈" title="Reporting" badge={`${activeMonths.length} active`} progressItems={activeMonths.map(m=>reporting[m].reportDone)}>
      <div style={{padding:"14px 22px"}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
          {MONTHS.map(m => (
            <button key={m} onClick={()=>onChange(m,"active",!reporting[m].active)} style={{background:reporting[m].active?color+"22":"transparent",border:`1px solid ${reporting[m].active?color:C.border}`,color:reporting[m].active?color:C.textFaint,borderRadius:7,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>{m}</button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {activeMonths.map(m => (
            <div key={m} style={{background:C.bg,borderRadius:10,padding:"14px 16px",border:`1px solid ${reporting[m].reportDone?color+"40":C.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:12,fontWeight:800,fontFamily:MONO,color,width:36}}>{m}</span>
                <Check checked={reporting[m].reportDone} onChange={()=>onChange(m,"reportDone",!reporting[m].reportDone)} label="Report sent" color={color} />
                <Inline value={reporting[m].dueDate} onChange={v=>onChange(m,"dueDate",v)} placeholder="Due date" fontSize={12} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapseBlock>
  );
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────

function SocialCalendarTab({calendar, setCalendar}) {
  const mobile = useIsMobile();
  const update = (id,f,v) => setCalendar(rows => rows.map(r => r.id===id ? {...r,[f]:v} : r));
  const remove = (id)      => setCalendar(rows => rows.filter(r => r.id!==id));
  const add    = ()        => setCalendar(rows => [...rows, makeCalRow(Date.now(),"Drumstick")]);

  return (
    <div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      {calendar.map((row,i) => {
        const status = resolveStatus(row);
        const sc = STATUS_COLORS[status] || STATUS_COLORS.Pending;
        return (
          <div key={row.id} style={{padding:"14px 18px",borderTop:i>0?`1px solid ${C.border}`:"none",display:"flex",flexDirection:mobile?"column":"row",gap:15,alignItems:mobile?"flex-start":"center"}}>
            <Inline value={row.campaign} onChange={v=>update(row.id,"campaign",v)} placeholder="Campaign" bold fontSize={13} color={ACCOUNT_COLORS[row.brand]} />
            <div style={{display:"flex",gap:8}}>
              <DropBtn color={ACCOUNT_COLORS[row.brand]} label={row.brand}>{CAL_BRANDS.map(a=><MenuItem key={a} color={ACCOUNT_COLORS[a]} onClick={()=>update(row.id,"brand",a)}>{a}</MenuItem>)}</DropBtn>
              <Pill color={sc.text}>{status}</Pill>
            </div>
            <Inline value={row.note} onChange={v=>update(row.id,"note",v)} placeholder="Note..." fontSize={12} color={C.textDim} />
            <button onClick={()=>remove(row.id)} style={{marginLeft:"auto",background:"none",border:"none",color:C.textFaint,cursor:"pointer"}}>×</button>
          </div>
        );
      })}
      <button onClick={add} style={{width:"100%",padding:15,background:"none",border:"none",color:C.textFaint,fontFamily:MONO,cursor:"pointer"}}>+ Add Campaign</button>
    </div>
  );
}

// ─── FREELANCE & PGD (Mantenidos igual) ──────────────────────────────────────

function JapanCakesCard({data, onChange}) {
  const {name, color, aon, aonLabel, campaigns} = data;
  const updCamp = (id, upd) => onChange({...data, campaigns: campaigns.map(c=>c.id===id?upd(c):c)});
  return (
    <Card accent={color}>
      <span style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:MONO}}>{name}</span>
      <div style={{marginTop:15}}>
        <CheckListEditor items={campaigns[0].checks} onChange={checks=>updCamp(campaigns[0].id, c=>({...c,checks}))} color={color} />
      </div>
    </Card>
  );
}

function TechnoTicketsCard({data, onChange}) {
  return (
    <Card>
      <span style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:MONO}}>{data.name}</span>
      <div style={{marginTop:15}}>
        {data.campaigns.map(c => (
          <div key={c.id} style={{display:"flex",gap:10,marginBottom:5}}>
            <Inline value={c.label} onChange={v=>onChange({...data, campaigns: data.campaigns.map(cp=>cp.id===c.id?{...cp,label:v}:cp)})} />
            <Check checked={c.pagado} onChange={()=>onChange({...data, campaigns: data.campaigns.map(cp=>cp.id===c.id?{...cp,pagado:!cp.pagado}:cp)})} color={C.green} />
          </div>
        ))}
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

function AccountCard({name, data, onChange, mobile}) {
  const color = ACCOUNT_COLORS[name];
  return (
    <Card accent={color}>
      <span style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:MONO}}>{name}</span>
      <Sec style={{marginTop:15}}>
        <ChecklistEditor items={data.prelaunch} onChange={items=>onChange({...data,prelaunch:items})} color={color} />
      </Sec>
      <ReportingBlock name={name} color={color} reporting={data.reporting} onChange={(m,f,v)=>onChange({...data, reporting:{...data.reporting,[m]:{...data.reporting[m],[f]:v}}})} />
    </Card>
  );
}

function PGDTab({pgd, setPGD, billing, setBilling, pacing, setPacing}) {
  const mobile = useIsMobile();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {MAIN_ACCOUNTS.map(name => (
        <AccountCard key={name} name={name} data={pgd[name]} onChange={d=>setPGD(a=>({...a,[name]:d}))} mobile={mobile} />
      ))}
      <BillingBlock billing={billing} setBilling={setBilling} />
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

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
      `}</style>

      <div style={{fontFamily:SANS, minHeight:"100vh", background:C.bg, color:C.text}}>
        <div style={{background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 16px", display:"flex", alignItems:"center", gap:12, height:50, position:"sticky", top:0, zIndex:50}}>
          <div style={{display:"flex",gap:2,background:C.bg,borderRadius:9,padding:3}}>
            {TABS.map(([v,label])=>(
              <button key={v} onClick={()=>setTab(v)} style={{padding:"6px 14px",borderRadius:7,border:"none",background:tab===v?C.surfaceHigh:"transparent",color:tab===v?C.text:C.textFaint,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:MONO}}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{maxWidth:900, margin:"0 auto", padding:20}}>
          {tab==="pgd" ? <PGDTab pgd={pgd} setPGD={setPGD} billing={billing} setBilling={setBilling} pacing={pacing} setPacing={setPacing} /> 
           : tab==="calendar" ? <SocialCalendarTab calendar={calendar} setCalendar={setCalendar} />
           : <FreelanceTab freelance={freelance} setFreelance={setFreelance} />}
        </div>
      </div>
    </>
  );
}