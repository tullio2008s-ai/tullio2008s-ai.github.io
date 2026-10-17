"use strict";
window.SMART = (() => {
  const $ = id => document.getElementById(id);
  const tabs = ["SCADENZE","RICORRENZE","PAGAMENTI","CONFIG","AUDIT"];
  const widths = {SCADENZE:27,RICORRENZE:29,PAGAMENTI:12,CONFIG:19,AUDIT:10};
  const state = {token:null,expires:0,clientId:localStorage.getItem("smart_client_id")||"",sheetId:localStorage.getItem("smart_sheet_id")||"",meta:null,data:{},mode:"standard",editId:null,selectedId:null,payId:null,busy:false};
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const euro = n => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
  const today = () => new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Rome"});
  const serial = d => Math.round((Date.parse(d+"T00:00:00Z")-Date.UTC(1899,11,30))/86400000);
  const iso = v => {
    if(typeof v==="number") return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return String(v);
    const m=String(v||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m?m[3]+"-"+m[2]+"-"+m[1]:"";
  };
  const dateText = d => iso(d)?new Date(iso(d)+"T12:00:00").toLocaleDateString("it-IT"):"Da definire";
  const days = d => iso(d)?Math.round((Date.parse(iso(d)+"T12:00:00")-Date.parse(today()+"T12:00:00"))/86400000):null;
  const amount = v => {
    if(v===null||v===undefined||String(v).trim()==="")return null;
    let s=String(v).replace(/[€\s]/g,"");
    if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");
    const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;
  };
  const rows = tab => state.data[tab]||[];
  const get = (tab,id) => rows(tab).find(r=>String(r.cells[0])===String(id))||null;
  const config = () => rows("CONFIG").map(r=>r.cells);
  const categories = () => config().filter(r=>r[0]&&r[1]).map(r=>({id:String(r[0]),name:String(r[1])}));
  const subjects = () => config().filter(r=>r[5]&&r[6]).map(r=>({id:String(r[5]),name:String(r[6])}));
  const banks = () => config().filter(r=>r[15]&&r[16]).map(r=>({id:String(r[15]),name:String(r[16]),subject:String(r[17]||"")}));
  const lookup = (list,id) => list.find(x=>x.id===id)?.name||String(id||"Da definire");
  const col = n => {let s="";while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s};
  function notify(message,error=false){const el=$("message");el.textContent=message;el.className="message"+(error?" error":"");el.hidden=false;window.scrollTo({top:0,behavior:"smooth"})}
  function busy(on){state.busy=on;["entry-save","pay-save","new-btn","new-f24-btn"].forEach(id=>{if($(id))$(id).disabled=on})}
  function requireAuth(){if(!state.token||Date.now()>=state.expires){state.token=null;throw Error("Sessione Google scaduta. Accedi nuovamente dalle Impostazioni.")}if(!state.sheetId)throw Error("Configura l'ID del foglio Google.")}
  async function api(path,options={}) {
    requireAuth();
    const response=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(state.sheetId)+path,{
      ...options,headers:{Authorization:"Bearer "+state.token,"Content-Type":"application/json"}
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(json.error?.message||"Errore Google Sheets: "+response.status);
    return json;
  }
  function connection(online){$("connection-dot").classList.toggle("online",online);$("connection-label").textContent=online?"Connesso a Google":"Non connesso";$("sync-label").textContent=online?"Archivio Google collegato":"Dati non caricati"}
  function setupView() {
    $("client-id").value=state.clientId;$("sheet-id").value=state.sheetId;
    $("setup-status").textContent=state.token?"Accesso attivo. I dati vengono letti direttamente da Google Sheets.":state.clientId&&state.sheetId?"Configurazione salvata. Premi Accedi con Google.":"Inserisci il Client ID OAuth e l'ID del foglio Google, poi autorizza l'accesso.";
  }
  function connect() {
    if(!state.clientId||!state.sheetId)return notify("Completa prima le Impostazioni Google.",true);
    if(!window.google?.accounts?.oauth2)return notify("Libreria Google non caricata. Controlla la connessione Internet.",true);
    const client=google.accounts.oauth2.initTokenClient({
      client_id:state.clientId,scope:"https://www.googleapis.com/auth/spreadsheets",
      callback:async result=>{
        if(!result.access_token)return notify("Autenticazione Google non riuscita: "+String(result.error||"accesso negato"),true);
        state.token=result.access_token;state.expires=Date.now()+(Math.max(60,Number(result.expires_in||3500)-90)*1000);
        try{await refresh();notify("Archivio Google collegato. Dati aggiornati.");navigate("dashboard")}
        catch(e){connection(false);notify("Connessione non riuscita: "+e.message,true)}
      }
    });
    client.requestAccessToken({prompt:"consent"});
  }
  function disconnect() {
    if(state.token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(state.token,()=>{});
    state.token=null;state.expires=0;state.data={};connection(false);renderAll();setupView();notify("Sessione Google disconnessa.");
  }
  async function refresh() {
    const meta=await api("?fields=sheets(properties(sheetId,title,gridProperties)),properties(title)");
    state.meta=meta;
    const names=new Set(meta.sheets.map(s=>s.properties.title));
    for(const tab of tabs)if(!names.has(tab))throw Error("Scheda mancante nell'archivio: "+tab);
    const query=tabs.map(t=>"ranges="+encodeURIComponent(t+"!A4:"+col(widths[t])+"500")).join("&");
    const data=await api("/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&"+query);
    tabs.forEach((t,i)=>{
      state.data[t]=[];
      (data.valueRanges[i]?.values||[]).slice(1).forEach((cells,index)=>{
        if(cells[0]!==undefined&&cells[0]!=="")state.data[t].push({cells,index:4+index});
      });
    });
    connection(true);renderAll();setupView();
  }
  const sheetId = tab => {
    const sheet=state.meta?.sheets?.find(s=>s.properties.title===tab);
    if(!sheet)throw Error("Scheda non trovata: "+tab);
    return sheet.properties.sheetId;
  };
  const cell = v => v===undefined||v===null||v===""?{}:
    typeof v==="number"?{userEnteredValue:{numberValue:v}}:
    typeof v==="object"&&v.date?{userEnteredValue:{numberValue:serial(v.date)}}:
    {userEnteredValue:{stringValue:String(v)}};
  function updateRow(tab,cells,index) {
    return {updateCells:{
      range:{sheetId:sheetId(tab),startRowIndex:index,endRowIndex:index+1,startColumnIndex:0,endColumnIndex:widths[tab]},
      rows:[{values:Array.from({length:widths[tab]},(_,i)=>cell(cells[i]))}],fields:"userEnteredValue"
    }};
  }
  function formatDate(tab,index,column) {
    return {repeatCell:{range:{sheetId:sheetId(tab),startRowIndex:index,endRowIndex:index+1,startColumnIndex:column,endColumnIndex:column+1},
      cell:{userEnteredFormat:{numberFormat:{type:"DATE",pattern:"dd/mm/yyyy"}}},fields:"userEnteredFormat.numberFormat"}};
  }
  const nextRow=tab=>Math.max(4,...rows(tab).map(r=>r.index))+1;
  const nextId=(tab,prefix)=>prefix+String(Math.max(0,...rows(tab).map(r=>Number(String(r.cells[0]).match(/\d+$/)?.[0]||0)))+1).padStart(6,"0");
  function audit(entity,id,action,description) {
    return [nextId("AUDIT","AUD-"),entity,id,action,"",description,{date:today()},"Gestionale SMART","Operazione approvata dall'utente","GitHub Pages"];
  }
  async function write(requests,checks=[]) {
    const result=await api(":batchUpdate",{method:"POST",body:JSON.stringify({requests})});
    if(!result.spreadsheetId)throw Error("Google non ha confermato la scrittura.");
    await refresh();
    for(const check of checks)if(!get(check.tab,check.id))throw Error("Scrittura effettuata ma verifica incompleta per "+check.id);
  }
  function navigate(view){
    document.querySelectorAll(".view").forEach(el=>el.hidden=el.id!==view+"-view");
    document.querySelectorAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    $("current-view-title").textContent={dashboard:"Panoramica",scadenze:"Scadenze",rapporti:"Rapporti ricorrenti",pagamenti:"Pagamenti",impostazioni:"Impostazioni"}[view]||view;
    $("sidebar").classList.remove("open");history.replaceState(null,"","#"+view);
  }
  return {$,state,esc,euro,today,serial,iso,dateText,days,amount,rows,get,config,categories,subjects,banks,lookup,notify,busy,requireAuth,api,connection,setupView,connect,disconnect,refresh,sheetId,updateRow,formatDate,nextRow,nextId,audit,write,navigate};
})();
