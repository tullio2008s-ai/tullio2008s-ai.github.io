"use strict";
(() => {
  const s=window.SMART,{state,rows,esc,euro,iso,dateText,days,amount,subjects,categories,banks,lookup}=s,$=s.$;
  function due() {
    return rows("SCADENZE").map(o=>{
      const r=o.cells;
      return {id:String(r[0]),index:o.index,raw:r,relation:r[1],subject:r[2],category:r[3],description:r[5]||"",supplier:r[6]||"",reference:r[7]||"",date:iso(r[8]),amount:amount(r[11]),estimated:amount(r[12]),paid:amount(r[14])||0,paymentStatus:r[16]||"",management:r[19]||"",notes:r[20]||"",bank:r[26]||""};
    });
  }
  const isEvent=x=>x.paymentStatus==="NON_APPLICABILE";
  const closed=x=>["ANNULLATO","SOSPESO"].includes(String(x.management).toUpperCase());
  const remaining=x=>x.amount===null?null:Math.max(0,Math.round((x.amount-x.paid)*100)/100);
  function status(x) {
    if(closed(x))return String(x.management).toUpperCase()==="ANNULLATO"?"Annullato":"Sospeso";
    if(isEvent(x))return"Evento";
    if(x.amount!==null&&remaining(x)<=0)return"Pagato";
    if(x.paid>0)return"Parziale";
    if(x.amount===null)return"Da definire";
    const d=days(x.date);
    return d===null?"Da definire":d<0?"Scaduto":d<=5?"Urgente":d<=30?"In scadenza":"Regolare";
  }
  const tag=s=>({"Scaduto":"overdue","Urgente":"urgent","Pagato":"paid","Parziale":"partial","Evento":"event"}[s]||"");
  function renderDashboard() {
    const all=due(),payable=all.filter(x=>!closed(x)&&!isEvent(x)&&x.amount!==null&&remaining(x)>0);
    const total=(from,to)=>payable.filter(x=>{const d=days(x.date);return d!==null&&d>=from&&d<=to}).reduce((sum,x)=>sum+remaining(x),0);
    $("nav-count").textContent=all.length;
    $("kpi-30").textContent=euro(total(0,30));
    $("kpi-90").textContent=euro(total(0,90));
    $("kpi-overdue").textContent=euro(total(-100000,-1));
    $("kpi-paid").textContent=String(all.filter(x=>status(x)==="Pagato").length);
    const upcoming=all.filter(x=>x.date&&!closed(x)&&status(x)!=="Pagato").sort((a,b)=>a.date.localeCompare(b.date)).slice(0,7);
    $("upcoming-list").innerHTML=upcoming.length?upcoming.map(x=>{
      const d=new Date(x.date+"T12:00:00");
      return '<div class="upcoming-item"><span class="date-square">'+d.getDate()+'<small>'+d.toLocaleString("it-IT",{month:"short"}).toUpperCase()+'</small></span><span class="upcoming-info"><strong>'+esc(x.description)+'</strong><small>'+esc(lookup(subjects(),x.subject))+' · '+esc(lookup(categories(),x.category))+'</small></span><span class="upcoming-amount">'+(remaining(x)===null?"—":euro(remaining(x)))+'</span></div>';
    }).join(""):'<div class="empty">Nessuna scadenza calendarizzata.</div>';
    const ss=subjects().map(subject=>({name:subject.name,value:payable.filter(x=>x.subject===subject.id&&days(x.date)!==null&&days(x.date)>=0&&days(x.date)<=90).reduce((sum,x)=>sum+remaining(x),0)}));
    const max=Math.max(1,...ss.map(x=>x.value));
    $("subject-summary").innerHTML=ss.map((x,i)=>'<div class="subject-line"><div class="subject-header"><span>'+esc(x.name)+'</span><span>'+euro(x.value)+'</span></div><div class="bar"><div class="bar-fill '+(i?"alt":"")+'" style="width:'+Math.round(x.value/max*100)+'%"></div></div></div>').join("");
    const overdue=payable.filter(x=>days(x.date)!==null&&days(x.date)<0).length;
    $("alerts").hidden=!overdue;
    $("alerts").textContent=overdue+" scadenza/e superata/e non completamente saldata/e.";
  }
  function filtered() {
    const subject=$("filter-subject").value,category=$("filter-category").value,st=$("filter-status").value,period=$("filter-period").value,query=$("filter-search").value.toLowerCase(),sort=$("filter-sort").value;
    let list=due().filter(x=>(!subject||x.subject===subject)&&(!category||x.category===category)&&(!st||status(x)===st)&&(!query||[x.description,x.supplier,x.reference,x.notes].join(" ").toLowerCase().includes(query)));
    if(period)list=list.filter(x=>{const d=days(x.date);return d!==null&&(period==="overdue"?d<0:d>=0&&d<=Number(period))});
    list.sort((a,b)=>sort==="amount"?((remaining(a)??-1)-(remaining(b)??-1)):sort==="amount-desc"?((remaining(b)??-1)-(remaining(a)??-1)):sort==="date-desc"?String(b.date||"").localeCompare(String(a.date||"")):sort==="category"?String(a.category).localeCompare(String(b.category)):String(a.date||"9999").localeCompare(String(b.date||"9999")));
    return list;
  }
  function renderDues() {
    const list=filtered();
    $("due-table").innerHTML=list.map(x=>'<tr><td>'+esc(x.description)+'<span class="subline">'+esc(x.supplier||x.reference)+'</span></td><td>'+esc(lookup(subjects(),x.subject))+'</td><td>'+esc(lookup(categories(),x.category))+'</td><td>'+esc(dateText(x.date))+'</td><td><strong>'+(remaining(x)===null?"Da definire":euro(remaining(x)))+'</strong></td><td><span class="tag '+tag(status(x))+'">'+status(x)+'</span></td><td><button type="button" class="table-action" data-detail="'+esc(x.id)+'">Apri</button></td></tr>').join("");
    $("due-empty").hidden=!!list.length;
  }
  function renderRelations() {
    const list=rows("RICORRENZE");
    $("relations-grid").innerHTML=list.length?list.map(o=>{
      const r=o.cells,prior=amount(r[20])??amount(r[19])??amount(r[26]);
      return '<article class="relation-card"><span class="relation-label">'+esc(lookup(categories(),r[2]))+'</span><h3>'+esc(r[3]||r[4])+'</h3><p>'+esc(r[4]||"")+'<br>'+esc(r[5]?"Rif. "+r[5]:"")+'</p><strong>'+(prior===null?"Importo da definire":euro(prior))+'</strong><div class="relation-footer"><span class="tag">'+esc(r[14]||"Da completare")+'</span><button type="button" class="text-button" data-from-relation="'+esc(r[0])+'">Nuova scadenza →</button></div></article>';
    }).join(""):'<div class="empty">Nessun rapporto censito.</div>';
  }
  function renderPayments() {
    const list=rows("PAGAMENTI");
    $("payments-table").innerHTML=list.map(o=>{
      const r=o.cells,related=s.get("SCADENZE",r[1]);
      return '<tr><td>'+esc(dateText(r[2]))+'</td><td>'+esc(related?.cells[5]||r[1]||"")+'</td><td>'+euro(r[3])+'</td><td>'+esc(lookup(banks(),r[11]))+'</td><td>'+esc(r[8]||"")+'</td></tr>';
    }).join("");
    $("payments-empty").hidden=!!list.length;
  }
  function renderOptions(id,list,first) {
    const el=$(id),old=el.value;
    el.innerHTML='<option value="">'+esc(first)+'</option>'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");
    if(list.some(x=>x.id===old))el.value=old;
  }
  function renderAll() {
    renderOptions("filter-subject",subjects(),"Tutti");
    renderOptions("filter-category",categories(),"Tutte");
    renderDashboard();renderDues();renderRelations();renderPayments();
    s.setupView();
  }
  function exportCSV() {
    s.requireAuth();
    const fields=["ID","Soggetto","Categoria","Descrizione","Ente","Riferimento","Scadenza","Importo confermato","Pagato","Residuo","Stato","Conto previsto"];
    const records=filtered().map(x=>[x.id,lookup(subjects(),x.subject),lookup(categories(),x.category),x.description,x.supplier,x.reference,x.date,x.amount??"",x.paid,remaining(x)??"",status(x),lookup(banks(),x.bank)]);
    const csv="\ufeff"+[fields,...records].map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");
    a.href=url;a.download="Scadenziario_SMART_"+s.today()+".csv";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  Object.assign(s,{due,isEvent,closed,remaining,status,renderAll,renderDues,renderOptions,exportCSV});
})();
