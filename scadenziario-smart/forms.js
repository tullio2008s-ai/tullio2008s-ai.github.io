"use strict";
(() => {
  const s=window.SMART,{state,rows,esc,euro,iso,amount,subjects,categories,banks,lookup}=s,$=s.$;
  function fillBanks(id,subject,selected="") {
    const available=banks().filter(b=>!subject||b.subject===subject);
    s.renderOptions(id,available,id==="pay-bank"?"Non specificato":"Da definire");
    if(selected&&available.some(b=>b.id===selected))$(id).value=selected;
  }
  function setMode(mode) {
    state.mode=mode;
    document.querySelectorAll("[data-mode]").forEach(el=>el.classList.toggle("selected",el.dataset.mode===mode));
    $("standard-fields").hidden=mode==="f24";
    $("relation-field").hidden=mode!=="relation";
    $("extra-fields").hidden=mode==="f24";
    $("entry-title").textContent=mode==="f24"?(state.editId?"Modifica F24":"Nuovo F24"):(state.editId?"Modifica scadenza":"Nuova scadenza");
    $("entry-description").required=mode!=="f24";
    $("entry-amount").required=mode==="f24";
    if(mode==="f24"){$("entry-category").value="F24";$("entry-description").value="Versamento F24"}
  }
  function openEntry(mode="standard",relationId="") {
    s.requireAuth();
    state.editId=null;
    $("entry-form").reset();
    s.renderOptions("entry-subject",subjects(),"Seleziona soggetto");
    s.renderOptions("entry-category",categories(),"Seleziona categoria");
    s.renderOptions("entry-relation",rows("RICORRENZE").map(r=>({id:String(r.cells[0]),name:String(r.cells[3]||r.cells[4])})),"Seleziona rapporto");
    fillBanks("entry-bank","");
    setMode(mode);
    if(relationId){$("entry-relation").value=relationId;applyRelation()}
    $("entry-dialog").showModal();
  }
  function applyRelation() {
    const r=s.get("RICORRENZE",$("entry-relation").value)?.cells;
    if(!r)return;
    $("entry-subject").value=r[1]||"";
    $("entry-category").value=r[2]||"";
    $("entry-description").value=r[3]||"";
    const prior=amount(r[20])??amount(r[26]);
    $("entry-amount").value=prior===null?"":String(prior).replace(".",",");
    fillBanks("entry-bank",r[1]||"");
    s.notify("Importo precompilato dal rapporto: verifica che sia ancora valido prima di salvare.");
  }
  function editEntry(id) {
    s.requireAuth();
    const x=s.due().find(d=>d.id===id);
    if(!x)return;
    openEntry(x.category==="F24"?"f24":"standard");
    state.editId=id;
    setMode(x.category==="F24"?"f24":"standard");
    $("entry-subject").value=x.subject||"";
    $("entry-category").value=x.category||"";
    $("entry-description").value=x.description||"";
    $("entry-date").value=x.date||"";
    $("entry-amount").value=x.amount===null?"":String(x.amount).replace(".",",");
    $("entry-notes").value=x.notes||"";
    fillBanks("entry-bank",x.subject,x.bank);
  }
  function detail(id) {
    const x=s.due().find(d=>d.id===id);if(!x)return;
    state.selectedId=id;
    $("detail-title").textContent=x.description;
    const entries=[["Soggetto",lookup(subjects(),x.subject)],["Categoria",lookup(categories(),x.category)],["Scadenza",s.dateText(x.date)],["Importo",x.amount===null?"Da definire":euro(x.amount)],["Pagato",euro(x.paid)],["Residuo",s.remaining(x)===null?"—":euro(s.remaining(x))],["Stato",s.status(x)],["Conto previsto",lookup(banks(),x.bank)]];
    $("detail-content").innerHTML='<div class="detail-grid">'+entries.map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join("")+'</div><p class="detail-notes">'+esc(x.notes||"")+'</p>';
    $("pay-due-btn").disabled=s.isEvent(x)||s.closed(x)||s.remaining(x)===null||s.remaining(x)===0;
    $("cancel-due-btn").disabled=s.closed(x)||x.paid>0;
    $("detail-dialog").showModal();
  }
  async function saveEntry(event) {
    event.preventDefault();if(state.busy)return;
    try{
      s.requireAuth();
      const mode=state.mode,subject=$("entry-subject").value,cat=mode==="f24"?"F24":$("entry-category").value,
        d=$("entry-date").value,amt=amount($("entry-amount").value),bank=$("entry-bank").value,
        desc=mode==="f24"?"Versamento F24":$("entry-description").value.trim(),
        notes=mode==="f24"?"":$("entry-notes").value.trim();
      if(!subject||!cat||!d||!desc)throw Error("Completa soggetto, categoria, descrizione e scadenza.");
      if(mode==="f24"&&(amt===null||amt<=0))throw Error("L'importo F24 deve essere maggiore di zero.");
      if($("entry-amount").value.trim()&&amt===null)throw Error("Importo non valido.");
      const relation=mode==="relation"?$("entry-relation").value:"";
      if(mode==="relation"&&!relation)throw Error("Seleziona il rapporto esistente.");
      if(!confirm("Confermi il salvataggio "+(state.editId?"della modifica":"della nuova scadenza")+" su Google Sheets?\n"+desc+"\n"+d+"\n"+(amt===null?"Importo da definire":euro(amt))))return;
      s.busy(true);
      await s.refresh();
      const prior=state.editId?s.get("SCADENZE",state.editId):null;
      if(state.editId&&!prior)throw Error("La scadenza da modificare non è più presente.");
      if(prior&&amt!==null&&amt<(amount(prior.cells[14])||0))throw Error("L'importo non può essere inferiore a quanto già pagato.");
      const duplicate=s.due().find(x=>x.id!==state.editId&&x.subject===subject&&x.category===cat&&x.date===d&&x.amount===amt&&(mode==="f24"||x.description.toLowerCase()===desc.toLowerCase()));
      if(duplicate&&!confirm("Possibile duplicato ("+duplicate.id+"). Vuoi comunque inserire una seconda registrazione?"))return;
      const id=state.editId||s.nextId("SCADENZE","SC-"),r=prior?[...prior.cells]:Array(27).fill("");
      r[0]=id;r[1]=relation||(prior?.cells[1]||"");r[2]=subject;r[3]=cat;r[4]=mode==="f24"?"Versamento fiscale":(prior?.cells[4]||"");
      r[5]=desc;r[6]=prior?.cells[6]||"";r[7]=prior?.cells[7]||"";r[8]=s.serial(d);
      r[11]=amt===null?"":amt;r[13]="EUR";r[14]=amount(prior?.cells[14])||0;
      r[15]=amt===null?"":Math.max(0,Math.round((amt-r[14])*100)/100);
      r[16]=amt===null?"DA_DEFINIRE":r[15]===0?"PAGATO":r[14]>0?"PARZIALE":"DA_PAGARE";
      r[19]=prior?.cells[19]||"ATTIVO";r[20]=notes;r[21]=prior?.cells[21]||s.serial(s.today());r[22]=s.serial(s.today());
      r[23]=prior?.cells[23]||"Inserimento manuale nel gestionale";r[24]=subject+"|"+cat+"|"+d+"|"+desc.toLowerCase();r[25]=(Number(prior?.cells[25])||0)+1;r[26]=bank;
      const index=prior?prior.index:s.nextRow("SCADENZE");
      const audit=s.audit("SCADENZE",id,prior?"MODIFICA":"CREA",desc+"; "+d+"; "+(amt===null?"importo non definito":euro(amt)));
      const requests=[s.updateRow("SCADENZE",r,index),s.formatDate("SCADENZE",index,8),s.updateRow("AUDIT",audit,s.nextRow("AUDIT")),s.formatDate("AUDIT",s.nextRow("AUDIT"),6)];
      await s.write(requests,[{tab:"SCADENZE",id}]);
      const verified=s.get("SCADENZE",id)?.cells;
      if(!verified||Number(verified[11]||0)!==Number(amt||0)||iso(verified[8])!==d)throw Error("Dati salvati, ma verifica dei valori incompleta. Controlla l'archivio prima di riprovare.");
      $("entry-dialog").close();s.notify("Scadenza "+id+" salvata e verificata su Google Sheets.");s.navigate("scadenze");
    }catch(e){s.notify(e.message,true)}finally{s.busy(false)}
  }
  function openPay(id) {
    s.requireAuth();
    const x=s.due().find(d=>d.id===id);if(!x||s.isEvent(x)||s.closed(x)||s.remaining(x)===null||s.remaining(x)===0)return;
    state.payId=id;$("pay-form").reset();$("pay-title").textContent=x.description;
    $("pay-date").value=s.today();$("pay-amount").value=String(s.remaining(x)).replace(".",",");
    fillBanks("pay-bank",x.subject);
    $("pay-dialog").showModal();
  }
  async function savePay(event) {
    event.preventDefault();if(state.busy)return;
    try{
      s.requireAuth();
      const d=$("pay-date").value,paid=amount($("pay-amount").value),bank=$("pay-bank").value,notes=$("pay-notes").value.trim();
      if(!d||paid===null||paid<=0)throw Error("Inserisci data e importo del pagamento.");
      if(!confirm("Confermi il pagamento effettivamente eseguito?\n"+d+" · "+euro(paid)+"\nConto: "+lookup(banks(),bank)))return;
      s.busy(true);await s.refresh();
      const x=s.due().find(y=>y.id===state.payId);
      if(!x)throw Error("Scadenza non trovata.");
      if(s.isEvent(x)||s.closed(x)||s.remaining(x)===null||paid>s.remaining(x))throw Error("Pagamento non valido o superiore al residuo.");
      const paymentId=s.nextId("PAGAMENTI","PAY-");
      const r=[...x.raw],newPaid=Math.round((x.paid+paid)*100)/100,residual=Math.max(0,Math.round((x.amount-newPaid)*100)/100);
      r[14]=newPaid;r[15]=residual;r[16]=residual===0?"PAGATO":"PARZIALE";r[22]=s.serial(s.today());r[25]=(Number(r[25])||0)+1;
      const payment=[paymentId,x.id,s.serial(d),paid,"EUR","Addebito / pagamento confermato","", "",notes,s.serial(s.today()),"Gestionale SMART",bank];
      const payIndex=s.nextRow("PAGAMENTI"),auditIndex=s.nextRow("AUDIT");
      const audit=s.audit("PAGAMENTI",paymentId,"CREA","Pagamento "+euro(paid)+" per "+x.id+" in data "+d);
      await s.write([s.updateRow("SCADENZE",r,x.index),s.updateRow("PAGAMENTI",payment,payIndex),s.formatDate("PAGAMENTI",payIndex,2),s.formatDate("PAGAMENTI",payIndex,9),s.updateRow("AUDIT",audit,auditIndex),s.formatDate("AUDIT",auditIndex,6)],[{tab:"PAGAMENTI",id:paymentId}]);
      if(amount(s.get("SCADENZE",x.id)?.cells[14])!==newPaid)throw Error("Pagamento salvato, ma verifica del totale incompleta. Controlla prima di riprovare.");
      $("pay-dialog").close();$("detail-dialog").close();s.notify("Pagamento "+paymentId+" registrato e verificato.");s.navigate("pagamenti");
    }catch(e){s.notify(e.message,true)}finally{s.busy(false)}
  }
  async function cancelDue() {
    const id=state.selectedId;
    if(!confirm("Annullare la scadenza "+id+"? Rimarrà nello storico."))return;
    try{
      s.busy(true);await s.refresh();
      const x=s.due().find(y=>y.id===id);if(!x)throw Error("Scadenza non trovata.");
      if(x.paid>0)throw Error("Una scadenza con pagamenti non può essere annullata da questa funzione.");
      const r=[...x.raw];r[19]="ANNULLATO";r[22]=s.serial(s.today());r[25]=(Number(r[25])||0)+1;
      const auditIndex=s.nextRow("AUDIT");
      await s.write([s.updateRow("SCADENZE",r,x.index),s.updateRow("AUDIT",s.audit("SCADENZE",id,"ANNULLA","Scadenza annullata senza cancellazione"),auditIndex),s.formatDate("AUDIT",auditIndex,6)],[{tab:"SCADENZE",id}]);
      if(String(s.get("SCADENZE",id)?.cells[19])!=="ANNULLATO")throw Error("Annullamento non verificato.");
      $("detail-dialog").close();s.notify("Scadenza annullata e conservata nello storico.");
    }catch(e){s.notify(e.message,true)}finally{s.busy(false)}
  }
  Object.assign(s,{openEntry,editEntry,detail,openPay,saveEntry,savePay,cancelDue,applyRelation,fillBanks});
})();
