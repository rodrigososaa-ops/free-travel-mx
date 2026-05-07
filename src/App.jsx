import { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
const SUPA_URL = "https://rqitpxealohypyletpps.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxaXRweGVhbG9oeXB5bGV0cHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDk1NjksImV4cCI6MjA4ODQ4NTU2OX0.CD1NHzcWAOYA1TBikMKzqibLR8wWJkObMYnYT5yASxo";

const C = { pink:"#FF0065", teal:"#0093A2", navy:"#1C2B35", navyL:"#253544", navyD:"#111D26", bg:"#0d1520", border:"#1e2f3d", muted:"#6b8a9e", text:"#d0e4ef" };

// Supabase JS client
let _sbClient = null;
function getSB() {
  if(_sbClient) return _sbClient;
  _sbClient = createClient(SUPA_URL, SUPA_KEY);
  return _sbClient;
}

// Hook for array tables
function useTable(table, init=[]) {
  const [data, setData] = useState(init);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSB().from(table).select("*").then(({data:rows,error}) => {
      if(error) console.error("Load error:",error);
      else if(rows) setData(rows.map(r=>r.data));
      setLoaded(true);
    });
  }, [table]);
  const save = useCallback(async (newData) => {
    const arr = typeof newData==="function" ? newData(data) : newData;
    setData(arr);
    const sb = getSB();
    const {data:existing} = await sb.from(table).select("id");
    const existingIds = new Set((existing||[]).map(r=>r.id));
    const newIds = new Set(arr.map(r=>r.id));
    for(const id of existingIds) {
      if(!newIds.has(id)) await sb.from(table).delete().eq("id",id);
    }
    if(arr.length>0) await sb.from(table).upsert(arr.map(r=>({id:r.id,data:r})));
  }, [data, table]);
  return [data, save, loaded];
}

// Hook for singleton config
function useConfig(key, init) {
  const [val, setVal] = useState(init);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSB().from("ftm_config").select("*").eq("id",key).then(({data:rows,error}) => {
      if(error) console.error("Config error:",error);
      else if(rows&&rows.length>0) setVal(rows[0].data);
      setLoaded(true);
    });
  }, [key]);
  const save = useCallback(async (newVal) => {
    const v = typeof newVal==="function" ? newVal(val) : newVal;
    setVal(v);
    await getSB().from("ftm_config").upsert([{id:key,data:v}]);
  }, [val, key]);
  return [val, save, loaded];
}

// PDF generation using jsPDF + html2canvas
async function generatePDF(elementId, filename) {
  const el = document.getElementById(elementId);
  if(!el) return;
  if(!window.html2canvas) {
    await new Promise((res,rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  if(!window.jspdf) {
    await new Promise((res,rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  // Clone element to a temporary full-size container outside the modal
  const clone = el.cloneNode(true);
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:-9999px;left:0;width:800px;background:white;z-index:-1;';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  try {
    const canvas = await window.html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      logging: false, width: 800, scrollY: 0
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = window.jspdf;
    const pdfW = 210; // A4 width in mm
    const imgW = canvas.width;
    const imgH = canvas.height;
    const scaledH = (imgH / imgW) * pdfW;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, scaledH] });
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, scaledH);
    pdf.save(filename);
  } finally {
    document.body.removeChild(wrapper);
  }
}

// Google Calendar integration
const GCAL_CLIENT_ID = "1003211929756-321kcgbcrmrtrg4jntlt10ecslksp0ov.apps.googleusercontent.com";
async function addToGoogleCalendar(cot) {
  return new Promise((resolve) => {
    // Load Google Identity Services
    if(!window.google?.accounts) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => doAuth(resolve, cot);
      document.head.appendChild(s);
    } else {
      doAuth(resolve, cot);
    }
  });
}
function doAuth(resolve, cot) {
  if(!GCAL_CLIENT_ID) {
    alert("Google Calendar no está configurado aún. Contacta al administrador.");
    resolve(false); return;
  }
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: async (resp) => {
      if(resp.error) { resolve(false); return; }
      // Get first service date from filas
      const firstDate = cot.filas?.find(f=>f.fecha)?.fecha || cot.fecha;
      const startDate = firstDate || new Date().toISOString().split('T')[0];
      const event = {
        summary: `${cot.clienteNombre} — ${cot.numero}`,
        description: `Cotización: ${cot.numero}\nCliente: ${cot.clienteNombre}${cot.clienteEmpresa?" ("+cot.clienteEmpresa+")":""}\nTotal: $${cot.total?.toLocaleString('es-MX')} MXN\nEjecutivo: Free Travel México`,
        start: { date: startDate },
        end: { date: startDate },
        colorId: "2"
      };
      try {
        const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer '+resp.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        });
        if(r.ok) { alert("✅ Evento agregado a Google Calendar"); resolve(true); }
        else { alert("Error al agregar evento"); resolve(false); }
      } catch(e) { alert("Error de conexión"); resolve(false); }
    }
  });
  client.requestAccessToken();
}

// Hook for singleton config (empresa, logo, vehiculos)

const MXN=n=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n||0);
const TODAY=()=>new Date().toISOString().slice(0,10);
const UID=()=>Math.random().toString(36).slice(2,9).toUpperCase();
const FOLIO=(p,l)=>`${p}-${String((l?.length||0)+1).padStart(4,"0")}`;
const DEF_EMP={nombre:"Free Travel México",rfc:"",telefono:"(999) 137-6649",email:"ventas.freetravel@hotmail.com",direccion:"Mérida, Yucatán.",ejecutivo:"Rodrigo Osorio",nota:"Vigencia: 10 días.",web:"www.freetravelmexico.com",bancoBanco:"BBVA",bancoTitular:"",bancoCuenta:"",bancoClabe:"",bancoTarjeta:""};
const DEF_CLI=[{id:"c1",nombre:"Cliente Ejemplo",empresa:"Empresa ABC",email:"cliente@abc.com",telefono:"+52 55 1111 2222"}];
const DEF_CAT=[{id:"p1",nombre:"Traslado aeropuerto Mérida",precio:1200,unidad:"servicio",categoria:"Traslados"},{id:"p2",nombre:"Traslado aeropuerto Cancún",precio:3500,unidad:"servicio",categoria:"Traslados"},{id:"p3",nombre:"Tour ciudad de Mérida",precio:950,unidad:"hora",categoria:"Tours"}];
const INCLUYE=["Operador","Combustible","Autopistas","Estacionamiento","Seguro de pasajeros"];
const NO_INCLUYE=["Alimentos y bebidas","Entradas y guías","Propinas","Lo no especificado"];
const CANCELACIONES=[{cargo:"20%",cuando:"15 días antes"},{cargo:"30%",cuando:"5 días antes"},{cargo:"50%",cuando:"1 día antes"},{cargo:"100%",cuando:"No show"}];
const POLITICAS=[
  "Este formato es únicamente cotización, no una confirmación de servicio.",
  "El espacio bloqueado se liberará automáticamente, sin previo aviso, si cualquiera de los depósitos no se recibe antes de las fechas límites ya estipuladas.",
  "El excederse del tiempo establecido el costo por hora extra será de $450 MXN.",
  "En caso de modificación del servicio, el ejecutivo de cuenta deberá autorizar el cambio de tarifa.",
  "Free Travel México no se hace responsable de objetos olvidados una vez liberado el servicio.",
  "Se prohíbe la transportación de objetos peligrosos o artículos prohibidos por la ley.",
  "Si el cliente presenta mal comportamiento, el operador podrá cancelar el servicio sin reembolso.",
];
const DEF_ASESORES=[{nombre:"Rodrigo Osorio"}];
const VEHICULOS=[{label:"Mercedes Benz Vito",cap:"7 pax"},{label:"Mercedes Benz Sprinter",cap:"15 pax"},{label:"Mercedes Benz Sprinter XL",cap:"20 pax"}];
const TDS={border:"1px solid #e0eaf0",padding:"6px 9px"};
const emptyRow=()=>({id:UID(),fecha:"",descripcion:"",unidades:"1",vehiculo:"",capacidad:"",tarifa:""});
function Logo({size=28,white=false}){
  const fs=size*0.55,w=white;
  return(<div style={{display:"flex",alignItems:"center",gap:6}}>
    <div style={{width:size,height:size,background:`radial-gradient(circle,${C.pink},#cc0050)`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.45}}>✦</div>
    <div style={{lineHeight:1.1,fontWeight:800,fontSize:fs}}>
      <span style={{color:w?"white":C.teal}}>FREE </span>
      <span style={{color:w?"rgba(255,255,255,.7)":C.navy}}>TRAVEL </span>
      <span style={{color:w?"white":C.pink}}>MÉXICO</span>
    </div>
  </div>);
}

function App(){
  const [vista,setVista]=useState("dashboard");
  const [isMobile,setIsMobile]=useState(()=>window.innerWidth<=768);
  useEffect(()=>{
    const fn=()=>setIsMobile(window.innerWidth<=768);
    window.addEventListener("resize",fn);
    return()=>window.removeEventListener("resize",fn);
  },[]);
  const [empresa,setEmpresa,empLoaded]=useConfig("empresa",DEF_EMP);
  const [logoUrl,setLogoUrl,logoLoaded]=useConfig("logo","");
  const [vehiculos,setVehiculos,vehLoaded]=useConfig("vehiculos",VEHICULOS);
  const [asesores,setAsesores,aseLoaded]=useConfig("asesores",DEF_ASESORES);
  const [clientes,setClientes,cliLoaded]=useTable("ftm_clientes",DEF_CLI);
  const [catalogo,setCatalogo,catLoaded]=useTable("ftm_catalogo",DEF_CAT);
  const [cotizaciones,setCotizaciones,cotLoaded]=useTable("ftm_cotizaciones",[]);
  const [recibos,setRecibos,recLoaded]=useTable("ftm_recibos",[]);
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const isLoading = !empLoaded||!cliLoaded||!catLoaded||!cotLoaded||!recLoaded||!aseLoaded;
  const notify=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3000);};
  const NAV=[{id:"dashboard",icon:"▦",label:"Inicio"},{id:"cotizaciones",icon:"📋",label:"Cotizaciones",badge:cotizaciones.length},{id:"recibos",icon:"💳",label:"Recibos",badge:recibos.length},{id:"clientes",icon:"👥",label:"Clientes",badge:clientes.length},{id:"catalogo",icon:"📦",label:"Catálogo"},{id:"empresa",icon:"🏢",label:"Mi Empresa"}];
  return(
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",width:"100%",overflowX:"hidden"}}>
      {isLoading&&<div style={{position:"fixed",inset:0,background:C.bg,zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><Logo size={36}/><div style={{color:C.muted,fontSize:13}}>Conectando con la base de datos...</div><div style={{width:200,height:3,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{width:"60%",height:"100%",background:C.teal,borderRadius:3,animation:"pulse 1.2s ease-in-out infinite"}}/></div></div>}
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{overflow-x:hidden;width:100%}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#111d26}::-webkit-scrollbar-thumb{background:#1e2f3d;border-radius:3px}
input,select,textarea{outline:none;font-family:inherit}button{cursor:pointer;font-family:inherit}
.inp{background:#111d26;border:1px solid #1e2f3d;border-radius:8px;padding:9px 12px;color:#d0e4ef;font-size:13px;width:100%;transition:border .15s}
.inp:focus{border-color:#0093A2}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;border:none;transition:all .15s;cursor:pointer}
.btn-pink{background:#FF0065;color:#fff}.btn-pink:hover{background:#d90055}
.btn-teal{background:#0093A2;color:#fff}.btn-teal:hover{background:#007a87}
.btn-ghost{background:#111d26;color:#6b8a9e;border:1px solid #1e2f3d}.btn-ghost:hover{background:#1c2f3e;color:#d0e4ef}
.btn-red{background:#2d1020;color:#ff6b9d;border:1px solid #3d1a2a}.btn-red:hover{background:#3d1a2a}
.btn-green{background:#0a2520;color:#00d9a0;border:1px solid #0a3530}.btn-green:hover{background:#0a3530}
.card{background:#111d26;border:1px solid #1e2f3d;border-radius:12px;padding:20px}
.nb{width:100%;display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;border:none;background:transparent;color:#6b8a9e;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;text-align:left}
.nb:hover{background:#1c2f3e;color:#d0e4ef}
.nb.active{background:linear-gradient(135deg,rgba(0,147,162,.18),rgba(0,147,162,.06));color:#0093A2;border:1px solid rgba(0,147,162,.3)}
.sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3a5568;margin-bottom:10px}
label{font-size:12px;color:#6b8a9e;font-weight:500;display:block;margin-bottom:5px}
.tag-p{background:#2d1a00;color:#ff9940;border:1px solid #3d2500;display:inline-flex;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
.tag-a{background:#0a2520;color:#00d9a0;border:1px solid #0a3530;display:inline-flex;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
.tag-r{background:#2d1020;color:#ff6b9d;border:1px solid #3d1a2a;display:inline-flex;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;padding:10px 12px;color:#3a5568;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #1a2d3a}
.tbl td{padding:11px 12px;border-bottom:1px solid transparent;color:#a8c4d4}
.tbl tr:hover td{background:#111d26}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
.mdl{background:#111d26;border:1px solid #1e2f3d;border-radius:16px;width:100%;max-width:720px;max-height:92vh;overflow-y:auto}
.mob-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#111d26;border-top:1px solid #1e2f3d;z-index:90;padding:5px 0;overflow-x:auto}
.mob-btn{flex:0 0 auto;min-width:56px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 6px;border:none;background:transparent;color:#3a5568;font-size:9px;cursor:pointer}
.mob-btn.active{color:#0093A2}
.resp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.srch{background:#111d26;border:1px solid #1e2f3d;border-radius:9px;padding:8px 12px;display:flex;align-items:center;gap:8px;margin-bottom:14px}
.srch input{background:transparent;border:none;outline:none;color:#d0e4ef;font-family:inherit;font-size:13px;flex:1}
.xbtn{background:none;border:none;color:#6b8a9e;font-size:20px;cursor:pointer}
.flx{display:flex;justify-content:space-between;align-items:center}
.sub{color:#6b8a9e;font-size:13px;margin-top:2px}
.mhdr{padding:12px 20px;border-bottom:1px solid #1e2f3d;display:flex;justify-content:space-between;align-items:center}
@media(max-width:768px){.sidebar{display:none!important}.mob-nav{display:flex!important}.main{margin-left:0!important;padding:12px 10px 80px!important}.card{padding:14px 12px!important}.tbl{font-size:11px!important}.tbl th,.tbl td{padding:7px 6px!important}.ov-content{max-width:100%!important;width:100%!important;max-height:100vh!important;height:100vh!important;border-radius:0!important;overflow-y:auto!important;margin:0!important}.mhdr{padding:14px 12px!important}.resp-grid{display:grid!important;grid-template-columns:1fr!important;gap:12px}.resp-table{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}.resp-hide{display:none!important}.resp-stack{flex-direction:column!important;gap:8px!important}.resp-full{width:100%!important}h1{font-size:17px!important}h2{font-size:15px!important}.btn{padding:8px 12px!important;font-size:12px!important}.flx{flex-wrap:wrap!important}.inp{font-size:14px!important}}
@media print{.no-print{display:none!important}body{background:white!important}}`}</style>
      {toast&&<div style={{position:"fixed",top:16,right:16,zIndex:300,background:toast.ok?C.teal:C.pink,color:"#fff",padding:"9px 16px",borderRadius:9,fontWeight:600,fontSize:13}}>{toast.msg}</div>}
      
      {!isMobile&&<aside style={{width:220,background:C.navyD,borderRight:`1px solid ${C.border}`,padding:"0 12px 20px",display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh",flexShrink:0}}>
      <div style={{padding:"18px 8px 20px",borderBottom:`1px solid ${C.border}`,marginBottom:10}}>
        <Logo size={22}/>
      </div>
      <nav style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
        {NAV.map(n=><button key={n.id} className={`nb ${vista===n.id?"active":""}`} onClick={()=>setVista(n.id)}>
            <span style={{fontSize:15}}>{n.icon}</span><span style={{flex:1}}>{n.label}</span>
            {n.badge>0&&<span style={{background:"rgba(0,147,162,.2)",color:C.teal,fontSize:10,padding:"1px 7px",borderRadius:10,fontWeight:700}}>{n.badge}</span>}
        </button>)}
      </nav>
      
      </aside>}
      
      {isMobile&&<div className="mob-nav no-print">
      {NAV.map(n=>(
        <button key={n.id} className={`mob-btn ${vista===n.id?"active":""}`} onClick={()=>setVista(n.id)}>
            <span style={{fontSize:17}}>{n.icon}</span><span>{n.label}</span>
        </button>
      ))}
      </div>}
      
      <main className="main" style={{flex:1,padding:isMobile?"12px 10px 80px":"28px 28px 80px",overflowY:"auto",minHeight:"100vh",width:0,minWidth:0,overflowX:"hidden"}}>
      {vista==="dashboard"&&<Dashboard cotizaciones={cotizaciones} recibos={recibos} clientes={clientes} setVista={setVista} MXN={MXN} isMobile={isMobile}/>}{vista==="cotizaciones"&&<Cotizaciones cotizaciones={cotizaciones} setCotizaciones={setCotizaciones} clientes={clientes} catalogo={catalogo} vehiculos={vehiculos} recibos={recibos} asesores={asesores} setModal={setModal} notify={notify} MXN={MXN}/>}{vista==="recibos"&&<Recibos recibos={recibos} setRecibos={setRecibos} cotizaciones={cotizaciones} clientes={clientes} asesores={asesores} setModal={setModal} notify={notify} MXN={MXN}/>}{vista==="clientes"&&<Clientes clientes={clientes} setClientes={setClientes} notify={notify}/>}{vista==="catalogo"&&<Catalogo catalogo={catalogo} setCatalogo={setCatalogo} notify={notify} MXN={MXN}/>}{vista==="empresa"&&<EmpresaView empresa={empresa} setEmpresa={setEmpresa} logoUrl={logoUrl} setLogoUrl={setLogoUrl} vehiculos={vehiculos} setVehiculos={setVehiculos} asesores={asesores} setAsesores={setAsesores} notify={notify}/>}
      </main>
      {modal&&(<div className="ov" onClick={e=>e.target===e.currentTarget&&setModal(null)}><div className="mdl">
      {modal.type==="cot-form"&&<CotForm {...modal.props} empresa={empresa} onClose={()=>setModal(null)} MXN={MXN}/>}{modal.type==="rec-form"&&<RecForm {...modal.props} onClose={()=>setModal(null)} MXN={MXN}/>}{modal.type==="cot-preview"&&<CotPreview {...modal.props} empresa={empresa} logoUrl={logoUrl} recibos={recibos} setRecibos={setRecibos} asesores={asesores} setModal={setModal} onClose={()=>setModal(null)} MXN={MXN}/>}{modal.type==="rec-preview"&&<RecPreview {...modal.props} empresa={empresa} recibos={recibos} onClose={()=>setModal(null)} MXN={MXN}/>}
      </div></div>)}
    </div>
  );
}
function Dashboard({cotizaciones,recibos,clientes,setVista,MXN,isMobile}){
  const totalCot=cotizaciones.reduce((s,c)=>s+(c.total||0),0);
  const totalRec=recibos.reduce((s,r)=>s+(r.total||0),0);
  const nPendientes=cotizaciones.filter(c=>c.estatus==="pendiente").length;
  const nAprobadas=cotizaciones.filter(c=>c.estatus==="aprobada").length;
  const nRechazadas=cotizaciones.filter(c=>c.estatus==="rechazada").length;
  const aprobadas=cotizaciones.filter(c=>c.estatus==="aprobada");
  const totalRestante=aprobadas.reduce((s,c)=>{
    const pagado=recibos.filter(r=>r.cotizacionRef===c.id).reduce((ss,r)=>ss+(r.total||0),0);
    return s+Math.max(0,(c.total||0)-pagado);
  },0);

  const recientes=[...cotizaciones].sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).slice(0,5);
  return(
    <div>
      <div style={{marginBottom:22}}>
      <h1 style={{fontSize:22,fontWeight:700}}>Panel principal</h1>
      <p style={{color:C.muted,fontSize:13,marginTop:3}}>Sistema de cotizaciones y recibos</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:22}}>
        
        <div className="card" style={{borderTop:`3px solid ${C.pink}`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:12}}>📋 Cotizaciones</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div style={{textAlign:"center",background:"rgba(255,0,101,.07)",borderRadius:7,padding:"10px 6px"}}>
              <div style={{fontSize:22,fontWeight:800,color:C.pink,fontFamily:"monospace"}}>{cotizaciones.length}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Total</div>
            </div>
            <div style={{textAlign:"center",background:"rgba(255,153,64,.07)",borderRadius:7,padding:"10px 6px"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#ff9940",fontFamily:"monospace"}}>{nPendientes}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Pendientes</div>
            </div>
            <div style={{textAlign:"center",background:"rgba(0,217,160,.07)",borderRadius:7,padding:"10px 6px"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#00d9a0",fontFamily:"monospace"}}>{nAprobadas}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Aprobadas</div>
            </div>
            <div style={{textAlign:"center",background:"rgba(107,138,158,.07)",borderRadius:7,padding:"10px 6px"}}>
              <div style={{fontSize:22,fontWeight:800,color:C.muted,fontFamily:"monospace"}}>{nRechazadas}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Rechazadas</div>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:C.muted}}>Total cotizado</span>
            <span style={{fontFamily:"monospace",fontWeight:700,color:C.pink,fontSize:14}}>{MXN(totalCot)}</span>
          </div>
        </div>
        
        <div className="card" style={{borderTop:`3px solid #00d9a0`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:12}}>💰 Finanzas</div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Total cobrado</div>
            <div style={{fontFamily:"monospace",fontSize:22,fontWeight:800,color:"#00d9a0"}}>{MXN(totalRec)}</div>
          </div>
          <div style={{marginBottom:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Por cobrar (aprobadas)</div>
            <div style={{fontFamily:"monospace",fontSize:22,fontWeight:800,color:"#ff9940"}}>{MXN(totalRestante)}</div>
          </div>
          <div style={{paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:C.muted}}>Clientes registrados</span>
            <span style={{fontFamily:"monospace",fontWeight:700,color:C.teal,fontSize:14}}>{clientes.length}</span>
          </div>
        </div>
      </div>
      <div className="card">
      <p className="sec">Cotizaciones recientes</p>
      {recientes.length===0?(
        <div style={{textAlign:"center",padding:"30px 20px",color:C.muted}}><div style={{fontSize:34,marginBottom:8,opacity:.3}}>📋</div><p>Sin cotizaciones</p><button className="btn btn-pink" style={{marginTop:10}} onClick={()=>setVista("cotizaciones")}>Crear cotización</button></div>
      ):(
        <div className="resp-table"><table className="tbl">
            <thead><tr><th>No.</th><th>Cliente</th><th className="resp-hide">Fecha</th><th>Total</th><th className="resp-hide" style={{color:"#00d9a0"}}>Pagado</th><th className="resp-hide" style={{color:C.pink}}>Restante</th><th>Estado</th></tr></thead>
            <tbody>
              {recientes.map(c=>(
                <tr key={c.id}>{(()=>{
                  const pagado=recibos.filter(r=>r.cotizacionRef===c.id).reduce((s,r)=>s+(r.total||0),0);
                  const restante=Math.max(0,(c.total||0)-pagado);
                  return(<>
                    <td style={{fontFamily:"monospace",color:C.pink,fontWeight:600}}>{c.numero}</td>
                    <td>{c.clienteNombre}</td>
                    <td className="resp-hide" style={{color:C.muted}}>{c.fecha}</td>
                    <td style={{fontFamily:"monospace",fontWeight:600}}>{MXN(c.total)}</td>
                    <td className="resp-hide" style={{fontFamily:"monospace",fontSize:11,color:"#00d9a0",fontWeight:600}}>{pagado>0?MXN(pagado):"—"}</td>
                    <td className="resp-hide" style={{fontFamily:"monospace",fontSize:11,color:restante>0?C.pink:"#00d9a0",fontWeight:600}}>{restante>0?MXN(restante):"✓ Saldado"}</td>
                    <td><STag s={c.estatus}/></td>
                  </>);
                })()}</tr>
              ))}
            </tbody>
        </table></div>
      )}
      <div style={{marginTop:16}}><button className="btn btn-ghost" onClick={()=>setVista("cotizaciones")}>Ver todas →</button></div>
      </div>
    </div>
  );
}
function STag({s}){return s==="aprobada"?<span className="tag-a">✓ aprobada</span>:s==="rechazada"?<span className="tag-r">✗ rechazada</span>:<span className="tag-p">● pendiente</span>;}
function Cotizaciones({cotizaciones,setCotizaciones,clientes,catalogo,vehiculos,recibos,setModal,notify,MXN}){
  const [q,setQ]=useState("");
  const fil=cotizaciones.filter(c=>(c.numero+c.clienteNombre).toLowerCase().includes(q.toLowerCase()));
  const nueva=()=>setModal({type:"cot-form",props:{cot:null,clientes,catalogo,vehiculos,onSave(d){setCotizaciones(p=>[{...d,id:UID(),numero:FOLIO("COT",p),fecha:TODAY(),estatus:"pendiente"},...p]);notify("✓ Guardada");}}});
  const editar=c=>setModal({type:"cot-form",props:{cot:c,clientes,catalogo,vehiculos,onSave(d){setCotizaciones(p=>p.map(x=>x.id===c.id?{...x,...d}:x));notify("✓ Actualizada");}}});
  const ver=c=>setModal({type:"cot-preview",props:{cot:c}});
  const eliminar=id=>setCotizaciones(p=>p.filter(c=>c.id!==id));
  const est=(id,e)=>setCotizaciones(p=>p.map(c=>c.id===id?{...c,estatus:e}:c));
  return(
    <div>
      <div className="flx resp-stack" style={{marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:20,fontWeight:700}}>Cotizaciones</h1><p className="sub">{cotizaciones.length} en total</p></div>
      <button className="btn btn-pink" onClick={nueva}>＋ Nueva cotización</button>
      </div>
      <div className="srch"><span style={{color:C.muted}}>🔍</span><input placeholder="Buscar..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      {fil.length===0?(
      <div className="card" style={{textAlign:"center",padding:"36px 20px",color:C.muted}}><div style={{fontSize:34,opacity:.3,marginBottom:8}}>📋</div><p>Sin cotizaciones</p><button className="btn btn-pink" style={{marginTop:10}} onClick={nueva}>＋ Crear</button></div>
      ):(
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>No.</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estatus</th><th/></tr></thead>
              <tbody>
                {fil.map(c=>(
                  <tr key={c.id}>{(()=>{const pagado=recibos.filter(r=>r.cotizacionRef===c.id).reduce((s,r)=>s+(r.total||0),0);const restante=Math.max(0,(c.total||0)-pagado);return(<><td style={{fontFamily:"monospace",color:C.pink,fontWeight:700}}>{c.numero}</td><td>{c.clienteNombre}</td><td className="resp-hide" style={{color:C.muted}}>{c.fecha}</td><td style={{fontFamily:"monospace",fontWeight:600}}>{MXN(c.total)}</td><td className="resp-hide" style={{fontFamily:"monospace",fontSize:11,color:"#00d9a0",fontWeight:600}}>{pagado>0?MXN(pagado):"—"}</td><td className="resp-hide" style={{fontFamily:"monospace",fontSize:11,color:restante>0?C.pink:"#00d9a0",fontWeight:600}}>{restante>0?MXN(restante):"✓ Saldado"}</td></>);})()}<td><select value={c.estatus} onChange={e=>est(c.id,e.target.value)} style={{background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,color:c.estatus==="aprobada"?"#00d9a0":c.estatus==="rechazada"?C.pink:"#ff9940"}}><option value="pendiente">pendiente</option><option value="aprobada">aprobada</option><option value="rechazada">rechazada</option></select></td><td><div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}><button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}} onClick={()=>ver(c)}>👁</button><button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}} onClick={()=>editar(c)}>✏️</button>{c.estatus==="aprobada"&&<button className="btn btn-teal" style={{padding:"4px 8px",fontSize:10}} onClick={()=>addToGoogleCalendar(c)}>📅</button>}<button className="btn btn-red" style={{padding:"4px 8px",fontSize:11}} onClick={()=>eliminar(c.id)}>🗑</button></div></td></tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
      )}
    </div>
  );
}
function ClientSearch({clientes,value,onChange}){
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const filtered=clientes.filter(c=>(c.nombre+c.empresa).toLowerCase().includes(q.toLowerCase())).slice(0,8);
  return(
    <div style={{position:"relative"}}>
      <div className="inp" style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"7px 10px"}} onClick={()=>{setOpen(o=>!o);setQ("");}}>
        <span style={{color:value?C.text:C.muted,fontSize:13}}>{value?`${value.nombre}${value.empresa?" — "+value.empresa:""}` :"Buscar cliente..."}</span>
        <span style={{fontSize:10,color:C.muted}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:C.navyL,border:`1px solid ${C.border}`,borderRadius:6,zIndex:100,maxHeight:220,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,.4)"}}>
        <input autoFocus className="inp" style={{margin:6,width:"calc(100% - 12px)",fontSize:12}} placeholder="Buscar por nombre o empresa..." value={q} onChange={e=>setQ(e.target.value)}/>
        {filtered.length===0&&<div style={{padding:"8px 12px",color:C.muted,fontSize:12}}>Sin resultados</div>}
        {filtered.map(c=>(
          <div key={c.id} style={{padding:"8px 12px",cursor:"pointer",fontSize:13,borderTop:`1px solid ${C.border}`}} onMouseDown={()=>{onChange({id:c.id,nombre:c.nombre,empresa:c.empresa||"",telefono:c.telefono||""});setOpen(false);setQ("");}}>
            <div style={{fontWeight:600}}>{c.nombre}</div>
            {c.empresa&&<div style={{fontSize:11,color:C.muted}}>{c.empresa}</div>}
          </div>
        ))}
      </div>}
    </div>
  );
}
function CotForm({cot,clientes,catalogo,vehiculos,onSave,onClose,MXN}){
  const [cli,setCli]=useState(cot?{id:cot.clienteId,nombre:cot.clienteNombre,empresa:cot.clienteEmpresa||""}:null);
  const [notas,setNotas]=useState(cot?.notas||"");
  const [filas,setFilas]=useState(cot?.filas||[emptyRow()]);
  const setF=(idx,field,val)=>setFilas(p=>p.map((r,i)=>{
    if(i!==idx)return r;
    if(field==="veh"){if(!val){return{...r,vehiculo:"",capacidad:""};} const v=vehiculos.find(x=>x.label+"|"+x.cap===val);return v?{...r,vehiculo:v.label,capacidad:v.cap}:r;}
    return{...r,[field]:val};
  }));
  const sub=filas.reduce((s,r)=>s+(parseFloat(r.tarifa)||0),0);
  const [conIva,setConIva]=useState(cot?.conIva!==false);
  const iva=conIva?sub*0.16:0;
  const total=sub+iva;
  const guardar=()=>{
    if(!cli)return alert("Selecciona un cliente");
    if(!filas.some(r=>r.descripcion))return alert("Agrega al menos un servicio");
    onSave({clienteId:cli.id,clienteNombre:cli.nombre,clienteEmpresa:cli.empresa,clienteTelefono:cli.telefono||"",notas,filas,subtotal:sub,iva,total,conIva});
    onClose();
  };
  return(
    <div>
      <div className="mhdr"><h2 style={{fontSize:15,fontWeight:700}}>{cot?"Editar":"Nueva"} cotización</h2><button className="xbtn" onClick={onClose}>✕</button></div>
      <div style={{padding:"18px 22px"}}>
      <div className="resp-grid" style={{gap:14,marginBottom:16}}>
        <div style={{position:"relative"}}>
            <label>Cliente *</label>
            <ClientSearch clientes={clientes} value={cli} onChange={setCli}/>
        </div>
      </div>
      {catalogo.length>0&&(
        <div style={{marginBottom:14}}>
            <p className="sec">Agregar desde catálogo</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {catalogo.map(p=><button key={p.id} className="btn btn-ghost" style={{fontSize:11,padding:"5px 12px"}} onClick={()=>setFilas(prev=>[...prev,{id:UID(),fecha:"",descripcion:p.nombre,unidades:"1",vehiculo:"",capacidad:"",tarifa:String(p.precio)}])}>＋ {p.nombre}</button>)}
            </div>
        </div>
      )}
      <p className="sec">Servicios</p>
      <div style={{overflowX:"auto",marginBottom:12}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.navyD}}>{["Fecha","Descripción","Unid.","Vehículo","Capacidad","Tarifa MXN",""].map((h,i)=><th key={i} style={{padding:"7px 8px",color:C.muted,fontWeight:600,fontSize:11,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>
              {filas.map((f,idx)=>{
                const p4="4px 5px",s={fontSize:11,padding:"5px 8px"};
                return(<tr key={f.id} style={{borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:p4}}><input className="inp" type="date" style={{...s,width:110}} value={f.fecha} onChange={e=>setF(idx,"fecha",e.target.value)}/></td>
                  <td style={{padding:p4}}><input className="inp" style={{...s,width:185}} placeholder="desc." value={f.descripcion} onChange={e=>setF(idx,"descripcion",e.target.value)}/></td>
                  <td style={{padding:p4}}><input className="inp" type="number" min="1" style={{...s,width:52}} value={f.unidades} onChange={e=>setF(idx,"unidades",e.target.value)}/></td>
                  <td style={{padding:p4}}><select className="inp" style={{...s,width:154}} value={f.vehiculo&&f.capacidad?f.vehiculo+"|"+f.capacidad:""} onChange={e=>setF(idx,"veh",e.target.value)}><option value="">—</option>{vehiculos.map(v=><option key={v.label+v.cap} value={v.label+"|"+v.cap}>{v.label} – {v.cap}</option>)}</select></td>
                  <td style={{padding:p4}}><input className="inp" style={{...s,width:74}} value={f.capacidad} onChange={e=>setF(idx,"capacidad",e.target.value)}/></td>
                  <td style={{padding:p4}}><input className="inp" type="number" min="0" style={{...s,width:98}} placeholder="0" value={f.tarifa} onChange={e=>setF(idx,"tarifa",e.target.value)}/></td><td style={{padding:p4}}><button className="btn btn-red" style={{padding:"3px 6px",fontSize:11}} onClick={()=>setFilas(p=>p.filter((_,i)=>i!==idx))}>✕</button></td></tr>);
              })}
            </tbody>
        </table>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}><button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setFilas(p=>[...p,emptyRow()])}>＋ Fila</button><label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:C.muted,cursor:"pointer"}}><input type="checkbox" checked={conIva} onChange={e=>setConIva(e.target.checked)} style={{accentColor:C.teal,width:14,height:14}}/> IVA 16%</label></div>
        <div style={{fontSize:13}}><span style={{color:C.muted}}>Sub: {MXN(sub)}{conIva?` · IVA: ${MXN(iva)}`:""} · </span><strong style={{color:C.pink,fontSize:15}}>Total: {MXN(total)}</strong></div>
      </div>
      <div style={{marginBottom:12}}><label>Notas</label><textarea className="inp" rows={2} value={notas} onChange={e=>setNotas(e.target.value)}/></div>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-pink" onClick={guardar}>Guardar cotización</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
      </div>
    </div>
  );
}
function DocHeader({numero,tipo,logoUrl}){return(<><div style={{background:"white",borderBottom:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px"}}>{logoUrl?<img src={logoUrl} style={{height:44,maxWidth:240,objectFit:"contain"}} alt="logo"/>:<Logo size={22}/>}<div style={{textAlign:"right"}}><div style={{color:"#9ca3af",fontSize:10,fontWeight:600}}>FOLIO</div><div style={{color:C.navy,fontSize:18,fontWeight:800,fontFamily:"monospace"}}>{numero}</div><div style={{color:C.teal,fontSize:11,fontWeight:700}}>{tipo}</div></div></div><div style={{height:4,background:`linear-gradient(90deg,${C.pink},${C.teal})`}}/></>);}
function DocFooter({empresa}){return(<div style={{background:C.navy,padding:"7px 22px",display:"flex",justifyContent:"flex-end",alignItems:"center"}}><div style={{textAlign:"right"}}><div style={{color:"rgba(255,255,255,.5)",fontSize:10}}>{empresa.email} · {empresa.telefono}</div>{empresa.web&&<div style={{color:C.teal,fontSize:10,fontWeight:600}}>{empresa.web}</div>}</div></div>);}
function CotPreview({cot,empresa,logoUrl,recibos,setRecibos,asesores,setModal,onClose,MXN}){
  const [genPDF,setGenPDF]=useState(false);
  return(
    <div>
      <div className="no-print mhdr"><div style={{fontWeight:600,fontSize:13}}>{cot.numero}</div><div style={{display:"flex",gap:8}}>
      <button className="btn btn-teal" onClick={()=>{
        const abonosExistentes=recibos.filter(r=>r.cotizacionRef===cot.id);
        const totalAbonado=abonosExistentes.reduce((s,r)=>s+(r.total||0),0);
        const pendiente=Math.max(0,(cot.total||0)-totalAbonado);
        if(pendiente===0){alert("Este servicio ya está liquidado.");return;}
        setModal({type:"rec-form",props:{
          cotPrellenada:cot,
          asesores,
          pendiente,
          onSave(d){setRecibos(p=>[{...d,id:UID(),numero:FOLIO("REC",p),fecha:TODAY()},...p]);onClose();}
        }});
      }}>💰 Agregar abono</button>
      <button className="btn btn-green" disabled={genPDF} onClick={async()=>{setGenPDF(true);await generatePDF("cot-print-area",`${cot.numero}.pdf`);setGenPDF(false);}}>{genPDF?"Generando...":"⬇️ PDF"}</button><button className="xbtn" onClick={onClose}>✕</button></div></div>
      <div id="cot-print-area" style={{background:"white",color:"#111",fontSize:12}}>
      <DocHeader numero={cot.numero} tipo="COTIZACIÓN" empresa={empresa} logoUrl={logoUrl}/>
      <div style={{padding:"10px 22px",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,borderBottom:`2px solid ${C.teal}`}}>
        <div><div style={{fontSize:9,color:"#999",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>COTIZACIÓN PARA</div>
          <div style={{fontWeight:700,fontSize:13,color:C.navy}}>{cot.clienteNombre}</div>
          {cot.clienteEmpresa&&<div style={{fontSize:11,color:"#555"}}>{cot.clienteEmpresa}</div>}
          {cot.clienteTelefono&&<div style={{fontSize:11,color:"#555"}}>📱 {cot.clienteTelefono}</div>}
        </div>
        <div style={{textAlign:"right",fontSize:11,color:"#777"}}><div>{empresa.direccion}</div>
          <div style={{fontWeight:700,color:C.navy}}>{cot.fecha}</div>
          {cot.vencimiento&&<div style={{color:"#e05000",fontWeight:600}}>Vigencia: {cot.vencimiento}</div>}
        </div>
      </div>
      <div style={{padding:"5px 22px 3px",color:"#555",fontSize:11}}>Estimado cliente, a continuación la cotización solicitada:</div>
      <div style={{padding:"0 24px 14px"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{["FECHA","DESCRIPCIÓN","UNIDADES","VEHÍCULO","CAPACIDAD","TARIFA"].map((h,i)=><th key={i} style={{background:C.navy,color:"white",border:"1px solid #2a3d50",padding:"7px 9px",textAlign:"center",fontWeight:700}}>{h}</th>)}</tr></thead>
            <tbody>
              {(cot.filas||[]).map((f,i)=>(
                <tr key={i} style={{background:i%2===0?"white":"#f4f8fb"}}>
                  {[f.fecha,f.descripcion,f.unidades,f.vehiculo,f.capacidad].map((v,ci)=>(
                    <td key={ci} style={{...TDS,textAlign:ci===1?"left":"center"}}>{v}</td>
                  ))}
                  <td style={{...TDS,textAlign:"right",fontFamily:"monospace",fontWeight:600,color:C.navy}}>{f.tarifa?MXN(parseFloat(f.tarifa)):""}</td>
                </tr>
              ))}
              {[["SUB TOTAL",MXN(cot.subtotal),false],...(cot.conIva!==false?[["IVA (16%)",MXN(cot.iva),false]]:[]),["TOTAL",MXN(cot.total),true]].map(([lbl,val,tot])=>(
                <tr key={lbl} style={{background:tot?"#f0fafc":""}}>
                  <td colSpan={5} style={{border:tot?`2px solid ${C.teal}`:"1px solid #e0eaf0",padding:"6px 9px",textAlign:"right",fontWeight:tot?800:600,fontSize:tot?13:12,color:tot?C.teal:"#555"}}>{lbl}</td>
                  <td style={{border:tot?`2px solid ${C.teal}`:"1px solid #e0eaf0",padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:tot?800:600,fontSize:tot?14:12,color:tot?C.teal:C.navy}}>{val}</td>
                </tr>
              ))}
            </tbody>
        </table>
        <div style={{fontSize:9,color:"#9ca3af",marginTop:4}}>Tarifas en MXN, netas y confidenciales.</div>
      </div>
      <div className="resp-grid" style={{gap:14}}>
        {[[INCLUYE,C.teal,"INCLUYE","✓"],[NO_INCLUYE,C.pink,"NO INCLUYE","✗"]].map(([lst,col,ttl,ico])=>(
            <div key={ttl}><div style={{fontWeight:700,fontSize:11,color:"white",background:col,padding:"5px 9px",marginBottom:5,textAlign:"center"}}>{ttl}</div>{lst.map((x,i)=><div key={i} style={{fontSize:11,padding:"2px 7px"}}><span style={{color:col,fontWeight:700}}>{ico}</span> {x}</div>)}</div>
        ))}
      </div>

      <div style={{padding:"0 24px 12px"}}>
        <div style={{fontWeight:700,fontSize:11,color:C.navy,marginBottom:5,borderBottom:`2px solid ${C.navy}`,paddingBottom:3}}>CONDICIONES DE PAGO</div>
        <div style={{fontSize:11,color:"#374151",lineHeight:1.55,marginBottom:6}}>Depósito inicial del <strong>20%</strong> bloquea fechas (no reembolsable). Liquidación máximo <strong>3 días antes</strong> del servicio.</div>
        {(empresa.bancoBanco||empresa.bancoTitular||empresa.bancoCuenta)&&(
            <div style={{background:"#f0fafc",border:`1px solid ${C.teal}`,borderRadius:7,padding:"9px 12px",marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:11,color:C.teal,marginBottom:5}}>💳 DEPÓSITO / TRANSFERENCIA — {empresa.bancoBanco}</div>
              <div className="resp-grid" style={{gap:16,marginBottom:0,fontSize:11}}>
                {[["Titular",empresa.bancoTitular,""],["No. Cuenta",empresa.bancoCuenta,"monospace"],["CLABE",empresa.bancoClabe,"monospace"],["Tarjeta",empresa.bancoTarjeta,"monospace"]].filter(([,v])=>v).map(([l,v,ff])=>(
                  <div key={l}><span style={{color:"#777"}}>{l}: </span><strong style={{fontFamily:ff||"inherit"}}>{v}</strong></div>
                ))}
              </div>
              <div style={{fontSize:10,color:"#e05000",marginTop:4}}>⚠️ Enviar comprobante de apartado a: {empresa.email} · {empresa.telefono}</div>
            </div>
        )}
        <table style={{borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{[["CARGO","14px"],["CANCELACIÓN","18px"]].map(([h,p])=><th key={h} style={{background:C.navy,color:"white",border:"1px solid #2a3d50",padding:`5px ${p}`}}>{h}</th>)}</tr></thead>
            <tbody>{CANCELACIONES.map((c,i)=><tr key={i}><td style={{...TDS,padding:"4px 14px",textAlign:"center",fontWeight:700,color:C.pink}}>{c.cargo}</td><td style={{...TDS,padding:"4px 18px"}}>{c.cuando}</td></tr>)}</tbody>
        </table>
      </div>
      <div style={{padding:"0 24px 14px"}}>
        <div style={{fontWeight:700,fontSize:11,color:C.navy,marginBottom:5,borderBottom:`2px solid ${C.navy}`,paddingBottom:2}}>POLÍTICAS Y CONDICIONES</div>
        {[...POLITICAS,...(cot.notas?[`Nota adicional: ${cot.notas}`]:[])].map((p,i)=><div key={i} style={{fontSize:10,color:"#4b5563",lineHeight:1.5,marginBottom:2,paddingLeft:8,borderLeft:`2px solid ${C.teal}`}}>{p}</div>)}
      </div>
      <div style={{padding:"8px 22px 14px",borderTop:"1px solid #e0eaf0",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:11,color:"#374151"}}>A sus órdenes para cualquier duda.<br/><strong>{empresa.email}</strong> · <strong>{empresa.telefono}</strong><br/><strong style={{color:C.navy}}>{empresa.ejecutivo}</strong></div>
        <div style={{textAlign:"right",fontSize:11}}>
            <div style={{color:"#9ca3af",marginBottom:3}}>{empresa.nota}</div>
            {empresa.web&&<a href={`https://${empresa.web}`} style={{color:C.teal,fontWeight:700,textDecoration:"none"}}>🌐 {empresa.web}</a>}
        </div>
      </div>
      <DocFooter empresa={empresa}/>
      </div>
    </div>
  );
}
function Recibos({recibos,setRecibos,cotizaciones,clientes,asesores,setModal,notify,MXN}){
  const [q,setQ]=useState("");
  const fil=recibos.filter(r=>(r.numero+r.clienteNombre+(r.cotizacionRef||"")).toLowerCase().includes(q.toLowerCase()));
  const ver=r=>setModal({type:"rec-preview",props:{rec:r}});
  const del=id=>setRecibos(p=>p.filter(r=>r.id!==id));
  const FMT=n=>n?.toLocaleString("es-MX",{style:"currency",currency:"MXN"})||"$0.00";
  return(
    <div>
      <div className="flx resp-stack" style={{marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>Recibos de pago</h1><p className="sub">{recibos.length} registrados</p></div>
      </div>
      <div style={{marginBottom:14}}><input className="inp" placeholder="Buscar recibo..." value={q} onChange={e=>setQ(e.target.value)} style={{maxWidth:320}}/></div>
      {fil.length===0?<div className="empty-state"><p>Sin recibos</p><p style={{fontSize:12,color:"#9ca3af",marginTop:4}}>Agrega abonos desde el detalle de una cotización</p></div>:(
        <div className="resp-table"><table className="tbl">
          <thead><tr>
            <th>No.</th><th>Cliente</th><th>Cotización</th>
            <th className="resp-hide">Fecha</th><th>Método</th>
            <th>Monto</th><th>Estatus</th><th></th>
          </tr></thead>
          <tbody>{fil.map(r=>{
            const cot=cotizaciones.find(c=>c.id===r.cotizacionRef);
            const todosAbonos=cot?recibos.filter(x=>x.cotizacionRef===cot.id):[];
            const totalPagado=todosAbonos.reduce((s,x)=>s+(x.total||0),0);
            const pendiente=Math.max(0,(cot?.total||0)-totalPagado);
            const pagado=cot&&pendiente===0;
            return(
            <tr key={r.id} onClick={()=>ver(r)} style={{cursor:"pointer"}}>
              <td style={{fontWeight:700,color:"#0093A2"}}>{r.numero}</td>
              <td>{r.clienteNombre}</td>
              <td style={{fontSize:11,color:"#0093A2"}}>{cot?.numero||"—"}</td>
              <td className="resp-hide" style={{fontSize:11}}>{r.fechaPago||r.fecha}</td>
              <td style={{fontSize:11}}>{r.metodoPago}</td>
              <td style={{fontFamily:"monospace",fontWeight:600}}>{FMT(r.total)}</td>
              <td><span style={{background:pagado?"#059669":pendiente>0?"#f59e0b":"#6b7280",color:"white",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{pagado?"PAGADO":cot?"ABONADO":"—"}</span></td>
              <td onClick={e=>e.stopPropagation()} style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                <button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}} onClick={()=>ver(r)}>👁</button>
                <button className="btn btn-red" style={{padding:"4px 8px",fontSize:11}} onClick={()=>del(r.id)}>✕</button>
              </td>
            </tr>);
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}

function RecForm({cotPrellenada,asesores,pendiente,clientes,cotizaciones,onSave,onClose}){
  const hoy=TODAY();
  const initState = cotPrellenada ? {
    clienteId:cotPrellenada.clienteId||"",
    clienteNombre:cotPrellenada.clienteNombre||"",
    clienteEmpresa:cotPrellenada.clienteEmpresa||"",
    clienteTelefono:cotPrellenada.clienteTelefono||"",
    clienteEmail:cotPrellenada.clienteEmail||"",
    concepto:"",
    total:"",
    metodoPago:"Transferencia",
    referencia:"",
    cotizacionRef:cotPrellenada.id,
    asesor:asesores?.[0]?.nombre||"",
    fechaPago:hoy,
    notas:""
  } : {
    clienteId:"",clienteNombre:"",clienteEmpresa:"",clienteTelefono:"",clienteEmail:"",
    concepto:"",total:"",metodoPago:"Transferencia",referencia:"",
    cotizacionRef:"",asesor:asesores?.[0]?.nombre||"",fechaPago:hoy,notas:""
  };
  const [d,setD]=useState(initState);
  const f=(k,v)=>setD(p=>({...p,[k]:v}));
  const guardar=()=>{
    if(!d.clienteNombre)return alert("Selecciona un cliente");
    if(!d.total||isNaN(parseFloat(d.total))||parseFloat(d.total)<=0)return alert("Ingresa un monto válido");
    onSave({...d,total:parseFloat(d.total)});onClose();
  };
  return(
    <div>
      <div className="mhdr">
        <div>
          <h2 style={{fontSize:15,fontWeight:700}}>Registrar abono</h2>
          {cotPrellenada&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{cotPrellenada.numero} — {cotPrellenada.clienteNombre}</div>}
        </div>
        <button className="xbtn" onClick={onClose}>✕</button>
      </div>
      <div style={{padding:"16px 20px"}}>
        {cotPrellenada ? (
          <div style={{background:"#f0f9ff",border:"1px solid #0093A2",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontSize:11,color:"#0093A2",fontWeight:700,marginBottom:4}}>Servicio vinculado</div>
            <div style={{fontSize:12,color:"#1C2B35",fontWeight:600}}>{cotPrellenada.numero} — {cotPrellenada.clienteNombre}</div>
            <div style={{fontSize:11,color:"#555",marginTop:3}}>Total: <strong>{cotPrellenada.total?.toLocaleString("es-MX",{style:"currency",currency:"MXN"})}</strong> · Pendiente: <strong style={{color:"#FF0065"}}>{pendiente?.toLocaleString("es-MX",{style:"currency",currency:"MXN"})}</strong></div>
          </div>
        ) : (
          <div style={{marginBottom:12}}>
            <label>Cotización relacionada</label>
            <select className="inp" value={d.cotizacionRef} onChange={e=>{
              const cot=cotizaciones?.find(x=>x.id===e.target.value);
              if(cot) setD(p=>({...p,cotizacionRef:e.target.value,clienteId:cot.clienteId||"",clienteNombre:cot.clienteNombre||"",clienteEmpresa:cot.clienteEmpresa||""}));
              else f("cotizacionRef","");
            }}>
              <option value="">Ninguna</option>
              {cotizaciones?.map(c=><option key={c.id} value={c.id}>{c.numero} – {c.clienteNombre}</option>)}
            </select>
          </div>
        )}
        <div style={{marginBottom:12}}>
          <label>Concepto del abono</label>
          <input className="inp" placeholder="Ej: Depósito inicial, Liquidación..." value={d.concepto} onChange={e=>f("concepto",e.target.value)}/>
        </div>
        <div className="resp-grid" style={{gap:12,marginBottom:12}}>
          <div>
            <label>Monto del abono MXN *</label>
            <input className="inp" type="number" min="0" max={pendiente||undefined} placeholder={pendiente?`Máx: ${pendiente}`:""} value={d.total} onChange={e=>f("total",e.target.value)}/>
          </div>
          <div>
            <label>Fecha de pago</label>
            <input className="inp" type="date" value={d.fechaPago} onChange={e=>f("fechaPago",e.target.value)}/>
          </div>
        </div>
        <div className="resp-grid" style={{gap:12,marginBottom:12}}>
          <div>
            <label>Método de pago</label>
            <select className="inp" value={d.metodoPago} onChange={e=>f("metodoPago",e.target.value)}>
              {["Transferencia","Efectivo","Tarjeta","Cheque","Otro"].map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label>Asesor de venta</label>
            <select className="inp" value={d.asesor} onChange={e=>f("asesor",e.target.value)}>
              {(asesores||[]).map(a=><option key={a.nombre} value={a.nombre}>{a.nombre}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginBottom:12}}><label>No. de operación / referencia</label><input className="inp" value={d.referencia} onChange={e=>f("referencia",e.target.value)}/></div>
        <div style={{marginBottom:16}}><label>Notas</label><textarea className="inp" rows={2} value={d.notas} onChange={e=>f("notas",e.target.value)}/></div>
        <div style={{display:"flex",gap:9}}>
          <button className="btn btn-teal" onClick={guardar}>💾 Guardar abono</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function RecPreview({rec,empresa,cotizaciones,recibos,onClose,MXN}){
  const [genPDF,setGenPDF]=useState(false);
  const cot=cotizaciones.find(c=>c.id===rec.cotizacionRef);
  const todosAbonos=cot
    ? recibos.filter(r=>r.cotizacionRef===cot.id).sort((a,b)=>(a.fechaPago||a.fecha).localeCompare(b.fechaPago||b.fecha))
    : [rec];
  const totalServicio=cot?.total||0;
  const totalPagado=todosAbonos.reduce((s,r)=>s+(r.total||0),0);
  const pendiente=Math.max(0,totalServicio-totalPagado);
  const pagado=totalServicio>0&&pendiente===0;
  const C2={navy:"#1C2B35",teal:"#0093A2",pink:"#FF0065"};
  const FMT=n=>n?.toLocaleString("es-MX",{style:"currency",currency:"MXN"})||"$0.00";
  const servicios=cot?.filas?.filter(f=>f.descripcion).map(f=>f.descripcion).join(" · ")||"—";
  return(
  <div>
    <div className="no-print mhdr">
      <div style={fontWeight:600,fontSize:13}>{rec.numero}</div>
      <div style={display:"flex",gap:8}>
        <button className="btn btn-green" disabled={genPDF} onClick={async()=>{setGenPDF(true);await generatePDF("rec-print-area",`${rec.numero}.pdf`);setGenPDF(false);}}>
          {genPDF?"Generando...":"⬇️ PDF"}
        </button>
        <button className="xbtn" onClick={onClose}>✕</button>
      </div>
    </div>
    <div id="rec-print-area" style={{background:"white",color:"#111",fontSize:12,fontFamily:"'Segoe UI',Arial,sans-serif",maxWidth:780,margin:"0 auto"}}>
      <DocHeader numero={rec.numero} tipo="COMPROBANTE DE PAGO" empresa={empresa}/>

      <div style={{display:"flex",borderBottom:"2px solid #0093A2"}}>
        <div style={{flex:1,padding:"12px 20px",borderRight:"1px solid #e0eaf0"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>Cliente</div>
          <div style={{fontWeight:700,fontSize:13,color:C2.navy,marginBottom:2}}>{rec.clienteNombre}</div>
          {rec.clienteEmpresa&&<div style={{fontSize:11,color:"#555",marginBottom:2}}>{rec.clienteEmpresa}</div>}
          {rec.clienteTelefono&&<div style={{fontSize:11,color:"#555",marginBottom:2}}>📱 {rec.clienteTelefono}</div>}
          {rec.clienteEmail&&<div style={{fontSize:11,color:"#555"}}>✉️ {rec.clienteEmail}</div>}
        </div>
        <div style={{flex:1,padding:"12px 20px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>Datos del abono</div>
          <div style={{fontSize:11,color:"#555",marginBottom:3}}>Fecha: <strong style={{color:C2.navy}}>{rec.fechaPago||rec.fecha}</strong></div>
          <div style={{fontSize:11,color:"#555",marginBottom:3}}>Asesor: <strong style={{color:C2.navy}}>{rec.asesor||empresa.ejecutivo||""}</strong></div>
          <div style={{fontSize:11,color:"#555",marginBottom:3}}>Método: <strong style={{color:C2.navy}}>{rec.metodoPago}</strong></div>
          {rec.referencia&&<div style={{fontSize:11,color:"#555"}}>Ref: <strong>{rec.referencia}</strong></div>}
        </div>
      </div>

      {cot&&<div style={{padding:"10px 20px",background:"#f0f9ff",borderBottom:"1px solid #e0eaf0"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:4}}>Servicio contratado — {cot.numero}</div>
        <div style={{fontSize:12,color:C2.navy,fontWeight:500}}>{servicios}</div>
        {rec.concepto&&<div style={{fontSize:11,color:"#555",marginTop:2}}>Concepto abono: {rec.concepto}</div>}
      </div>}

      <div style={{padding:"12px 20px",borderBottom:"1px solid #e0eaf0"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:10}}>Historial de pagos</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:8,borderBottom:"1px dashed #e0eaf0"}}>
          <span style={{fontSize:12,color:"#555"}}>Total del servicio</span>
          <span style={{fontWeight:700,color:C2.navy,fontFamily:"monospace",fontSize:13}}>{FMT(totalServicio)}</span>
        </div>
        {todosAbonos.map((r,i)=>(
          <div key={r.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,padding:"6px 10px",borderRadius:6,background:r.id===rec.id?"#f0fdf4":"#f9fafb",border:r.id===rec.id?"1px solid #00d9a0":"1px solid transparent"}}>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:C2.navy}}>Abono {i+1} {r.id===rec.id?"← este recibo":""}</div>
              <div style={{fontSize:10,color:"#777"}}>{r.fechaPago||r.fecha} · {r.metodoPago}{r.referencia?` · Ref: ${r.referencia}`:""}</div>
            </div>
            <span style={{fontWeight:700,color:"#059669",fontFamily:"monospace"}}>{FMT(r.total)}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:"2px solid #e0eaf0"}}>
          <span style={{fontSize:13,fontWeight:700}}>Importe pendiente</span>
          <span style={{fontSize:15,fontWeight:800,color:pendiente>0?C2.pink:"#059669",fontFamily:"monospace"}}>{FMT(pendiente)}</span>
        </div>
        <div style={{textAlign:"center",marginTop:12}}>
          <span style={{background:pagado?"#059669":"#f59e0b",color:"white",fontWeight:800,fontSize:13,padding:"5px 24px",borderRadius:20,letterSpacing:".05em"}}>
            {pagado?"✓ PAGADO":"● ABONADO"}
          </span>
        </div>
      </div>

      <div style={{padding:"10px 20px",background:"#f9fafb",borderBottom:"1px solid #e0eaf0"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:6}}>Términos y Condiciones</div>
        {["El depósito inicial recibido el día de hoy, garantiza el bloqueo de la(s) unidad(es) para su servicio.",
"La fecha límite para liquidar el servicio deberá ser como máximo una semana antes del servicio.",
"Se cancelará el servicio, sin previo aviso, si cualquiera de los depósitos no se recibe antes de la fecha límite.",
"En caso de modificación del servicio, el asesor de ventas deberá autorizar y establecer los cambios en la tarifa.",
"El excederse del tiempo establecido para el servicio tendrá un costo de $450 MXN por hora extra.",
"Free Travel México no se hace responsable por objetos olvidados.",
"Si el cliente presenta mal comportamiento, el operador tendrá la facultad de cancelar el servicio sin reembolso."].map((t,i)=>(
          <div key={i} style={{fontSize:9,color:"#555",marginBottom:3,lineHeight:1.4}}>{i+1}. {t}</div>
        ))}
      </div>

      <div style={{padding:"10px 20px",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,background:"#f4f8fb",borderBottom:"1px solid #e0eaf0"}}>
        <div style={{fontSize:10,color:"#555"}}>
          <div style={{fontWeight:700,color:C2.navy,marginBottom:3}}>{empresa.nombre}</div>
          <div>RFC: {empresa.rfc}</div>
          <div>{empresa.bancoBanco||"BBVA"}: {empresa.bancoCuenta||""}</div>
          <div>CLABE: {empresa.bancoClabe||""}</div>
        </div>
        <div style={{fontSize:10,color:"#555",textAlign:"right"}}>
          <div>{empresa.direccion}</div>
          <div>Tel: {empresa.telefono}</div>
          <div>{empresa.email}</div>
          <div>{empresa.web}</div>
        </div>
      </div>
      <div style={{background:C2.navy,padding:"8px 20px",textAlign:"center",color:"rgba(255,255,255,.75)",fontSize:11,fontWeight:600}}>¡Gracias por su preferencia!</div>
    </div>
  </div>
);\}

function Clientes({clientes,setClientes,notify}){
  const [q,setQ]=useState("");
  const [form,setForm]=useState(null);
  const fil=clientes.filter(c=>(c.nombre+(c.empresa||"")).toLowerCase().includes(q.toLowerCase()));
  const guardar=()=>{
    if(!form.nombre)return alert("Nombre requerido");
    if(form.id)setClientes(p=>p.map(c=>c.id===form.id?form:c));
    else setClientes(p=>[{...form,id:UID()},...p]);
    setForm(null);notify("✓ Cliente");
  };
  return(
    <div>
      <div className="flx" style={{marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:20,fontWeight:700}}>Clientes</h1><p className="sub">{clientes.length} clientes</p></div>
      <button className="btn btn-pink" onClick={()=>setForm({nombre:"",empresa:"",email:"",telefono:"",rfc:"",notas:""})}>＋ Nuevo cliente</button>
      </div>
      {form&&(
      <div className="card" style={{marginBottom:18,borderColor:"rgba(0,147,162,.4)"}}>
        <p className="sec">{form.id?"Editar":"Nuevo"} cliente</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:12}}>
            {[["nombre","Nombre *"],["empresa","Empresa"],["email","Email"],["telefono","Teléfono"],["rfc","RFC"],["notas","Notas"]].map(([k,l])=>(
              <div key={k}><label>{l}</label><input className="inp" type={k==="email"?"email":"text"} value={form[k]||""} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}/></div>
            ))}
        </div>
        <div style={{display:"flex",gap:9}}><button className="btn btn-teal" onClick={guardar}>Guardar</button><button className="btn btn-ghost" onClick={()=>setForm(null)}>Cancelar</button></div>
      </div>
      )}
      <div className="srch"><span style={{color:C.muted}}>🔍</span><input placeholder="Buscar clientes..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      {fil.length===0?(
      <div className="card" style={{textAlign:"center",padding:36,color:C.muted}}><div style={{fontSize:34,opacity:.3}}>👥</div><p style={{marginTop:8}}>Sin clientes</p></div>
      ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:14}}>
        {fil.map(c=>(
            <div key={c.id} className="card" style={{padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div><div style={{fontWeight:700,fontSize:13}}>{c.nombre}</div>{c.empresa&&<div style={{fontSize:11,color:C.muted}}>{c.empresa}</div>}</div>
                <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.pink},${C.teal})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13}}>{c.nombre[0]}</div>
              </div>
              {c.email&&<div style={{fontSize:11,color:C.muted}}>✉️ {c.email}</div>}
              {c.telefono&&<div style={{fontSize:11,color:C.muted}}>📱 {c.telefono}</div>}
              {c.rfc&&<div style={{fontSize:11,color:C.muted}}>🏷 {c.rfc}</div>}
              <div style={{display:"flex",gap:7,marginTop:10}}>
                <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>setForm({...c})}>Editar</button>
                <button className="btn btn-red" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>setClientes(p=>p.filter(x=>x.id!==c.id))}>✕</button>
              </div>
            </div>
        ))}
      </div>
      )}
    </div>
  );
}
function Catalogo({catalogo,setCatalogo,notify,MXN}){
  const [form,setForm]=useState(null);
  const guardar=()=>{
    if(!form.nombre||!form.precio)return alert("Nombre y precio requeridos");
    const item={...form,precio:parseFloat(form.precio)};
    if(form.id)setCatalogo(p=>p.map(x=>x.id===form.id?item:x));
    else setCatalogo(p=>[{...item,id:UID()},...p]);
    setForm(null);notify("✓ Item");
  };
  return(
    <div>
      <div className="flx" style={{marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:20,fontWeight:700}}>Catálogo de servicios</h1><p className="sub">{catalogo.length} items</p></div>
      <button className="btn btn-pink" onClick={()=>setForm({nombre:"",precio:"",unidad:"servicio",categoria:"General",descripcion:""})}>＋ Agregar servicio</button>
      </div>
      {form&&(
      <div className="card" style={{marginBottom:14,borderColor:"rgba(0,147,162,.4)"}}><p className="sec">{form.id?"Editar":"Nuevo"} servicio</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:12}}>
            <div><label>Nombre *</label><input className="inp" value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/></div>
            <div><label>Precio MXN *</label><input className="inp" type="number" min="0" value={form.precio} onChange={e=>setForm(p=>({...p,precio:e.target.value}))}/></div>
            <div><label>Unidad</label><select className="inp" value={form.unidad} onChange={e=>setForm(p=>({...p,unidad:e.target.value}))}>{["servicio","hora","proyecto","día","mes","pieza"].map(u=><option key={u}>{u}</option>)}</select></div>
            <div><label>Categoría</label><input className="inp" value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))}/></div>
            <div style={{gridColumn:"1/-1"}}><label>Descripción</label><input className="inp" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/></div>
        </div>
        <div style={{display:"flex",gap:10}}>
            <button className="btn btn-teal" onClick={guardar}>Guardar</button>
            <button className="btn btn-ghost" onClick={()=>setForm(null)}>Cancelar</button>
        </div>
      </div>
      )}
      {catalogo.length===0?(
      <div className="card" style={{textAlign:"center",padding:36,color:C.muted}}><div style={{fontSize:34,opacity:.3}}>📦</div><p style={{marginTop:8}}>Catálogo vacío</p></div>
      ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14}}>
        {catalogo.map(p=>(
            <div key={p.id} className="card" style={{borderLeft:`3px solid ${C.teal}`,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <div><div style={{fontWeight:600,fontSize:13}}>{p.nombre}</div><div style={{fontSize:11,color:C.muted}}>{p.categoria} · {p.unidad}</div></div>
                <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#00d9a0"}}>{MXN(p.precio)}</div>
              </div>
              {p.descripcion&&<div style={{fontSize:11,color:C.muted,marginTop:5}}>{p.descripcion}</div>}
              <div style={{display:"flex",gap:7,marginTop:10}}>
                <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>setForm({...p})}>Editar</button>
                <button className="btn btn-red" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>setCatalogo(p2=>p2.filter(x=>x.id!==p.id))}>✕</button>
              </div>
            </div>
        ))}
      </div>
      )}
    </div>
  );
}
function EmpresaView({empresa,setEmpresa,logoUrl,setLogoUrl,vehiculos,setVehiculos,asesores,setAsesores,notify}){
  const [form,setForm]=useState({...empresa});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  return(
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:16}}>Mi Empresa</h1>
      <div className="card">
      <p className="sec">Datos que aparecen en documentos</p>
      {[["nombre","Empresa"],["rfc","RFC"],["telefono","Tel/WhatsApp"],["email","Email"],["direccion","Ciudad"],["ejecutivo","Ejecutivo"],["web","Página web"]].map(([k,l])=><div key={k} style={{marginBottom:11}}><label>{l}</label><input className="inp" value={form[k]||""} onChange={e=>f(k,e.target.value)}/></div>)}
      <div style={{marginBottom:11}}><label>Nota al pie</label><input className="inp" value={form.nota||""} onChange={e=>f("nota",e.target.value)}/></div>
      <div style={{paddingTop:10,borderTop:`1px solid ${C.border}`}}>
        <p className="sec">💳 Datos bancarios BBVA</p>
        {[["bancoTitular","Titular"],["bancoCuenta","No. Cuenta"],["bancoClabe","CLABE"],["bancoTarjeta","Tarjeta (opcional)"]].map(([k,l])=>(
          <div key={k} style={{marginBottom:11}}><label>{l}</label><input className="inp" value={form[k]||""} onChange={e=>f(k,e.target.value)}/></div>
        ))}
      </div>
      <div style={{paddingTop:10,borderTop:`1px solid ${C.border}`}}>
        <p className="sec">🚐 Vehículos</p>
        {vehiculos.map((v,i)=><div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
          <input className="inp" style={{flex:2,fontSize:12}} placeholder="Vehículo" value={v.label} onChange={e=>setVehiculos(p=>p.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/>
          <input className="inp" style={{flex:1,fontSize:12}} placeholder="Capacidad" value={v.cap} onChange={e=>setVehiculos(p=>p.map((x,j)=>j===i?{...x,cap:e.target.value}:x))}/>
          <button className="btn btn-red" style={{padding:"5px 8px",fontSize:11}} onClick={()=>setVehiculos(p=>p.filter((_,j)=>j!==i))}>✕</button>
        </div>)}
        <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setVehiculos(p=>[...p,{label:"",cap:""}])}>＋</button>
      </div>
      <div style={{paddingTop:10,borderTop:`1px solid ${C.border}`,marginBottom:12}}>
        <p className="sec">👤 Asesores de venta</p>
        {asesores.map((a,i)=>(
          <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <input className="inp" style={{flex:1,fontSize:12}} placeholder="Nombre del asesor" value={a.nombre} onChange={e=>setAsesores(p=>p.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))}/>
            <button className="btn btn-red" style={{padding:"5px 8px",fontSize:11}} onClick={()=>setAsesores(p=>p.filter((_,j)=>j!==i))}>✕</button>
          </div>
        ))}
        <button className="btn btn-ghost" style={{fontSize:11,marginBottom:6}} onClick={()=>setAsesores(p=>[...p,{nombre:""}])}>＋ Agregar asesor</button>
      </div>
      <div style={{paddingTop:10,borderTop:`1px solid ${C.border}`,marginBottom:12}}>
        <p className="sec">🖼 Logo (PDF)</p>
        {logoUrl&&<img src={logoUrl} style={{height:32,maxWidth:180,objectFit:"contain",marginBottom:6,display:"block",background:"#fff",padding:3,borderRadius:4}} alt="logo"/>}
        <label className="btn btn-ghost" style={{fontSize:11,cursor:"pointer"}}>📁 {logoUrl?"Cambiar":"Subir"}
          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const r=new FileReader();r.onload=ev=>setLogoUrl(ev.target.result);if(e.target.files[0])r.readAsDataURL(e.target.files[0]);}}/>
        </label>
        {logoUrl&&<button className="btn btn-red" style={{fontSize:11,marginLeft:6}} onClick={()=>setLogoUrl("")}>✕</button>}
      </div>
      <button className="btn btn-teal" onClick={()=>{setEmpresa(form);notify("✓ Guardado");}}>💾 Guardar</button>
      </div>
    </div>
  );
}


ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
