/* Kanonická obsahová a rozvrhová vrstva schválenej klientovej cesty. */
(()=>{
  "use strict";
  if(new URLSearchParams(location.search).has("legacy_preview"))return;
  const apply=()=>{
    const lp=document.getElementById("lp"),msg=document.getElementById("msg");
    if(!lp||!msg||lp.dataset.flow10of10==="1")return;
    lp.dataset.flow10of10="1";
    /* Nová kanonická stránka už obsahuje celý schválený desktopový aj mobilný
       tok. Staršia transformačná vrstva by z nej odstránila rozbaľovacie
       mobilné karty a vrátila prechodový text, ktorý bol zámerne zrušený. */
    if(document.querySelector(".mobile-life-map")){
      document.dispatchEvent(new Event("flow10of10-ready"));
      return;
    }

    let zone=document.querySelector(".calculator-preview-zone");
    if(!zone){
      zone=document.createElement("div");zone.className="calculator-preview-zone";
      lp.insertBefore(zone,lp.firstChild);
      while(zone.nextSibling){const node=zone.nextSibling;zone.appendChild(node);if(node===msg)break;}
    }
    document.querySelector(".assumptions-block")?.remove();

    const flowLead=document.querySelector(".flow-lead");
    if(flowLead){
      flowLead.hidden=false;
      const h=flowLead.querySelector(".lead-h"),p=flowLead.querySelector(".lead-p");
      if(h)h.textContent="Svoj plán už vidíte v číslach. Obstál by však aj v skutočnom svete?";
      if(p)p.textContent="Váš prepočet pracuje s rovnakým zhodnotením každý rok. Trhy sa však každý rok vyvíjajú inak.";
    }

    const flow=document.querySelector(".bottom-flow");
    if(flow)flow.classList.add("flow-10of10");
    const delivery=document.querySelector(".delivery-panel");
    if(delivery){
      const gate=document.getElementById("gate-form"),title=document.getElementById("delivery-title");
      const oldIntro=document.getElementById("gate-uvod"),oldBonus=document.getElementById("gate-bonus");
      oldIntro?.remove();oldBonus?.remove();
      if(title){title.textContent="Vezmite si svoj plán so sebou";title.className="flow-title";}
      const label=delivery.querySelector(".gate-label");
      if(label)label.innerHTML="Modeláciu vám spracujeme do <strong>prehľadného PDF</strong>, aby ste sa k nej mohli kedykoľvek vrátiť. Na otvorenej modelácii si PDF stiahnete jedným kliknutím.<br><br>Ak majetok najprv budujete a rentu chcete čerpať do konkrétneho veku, získate aj historický pohľad na to, ako by váš plán obstál, ak by bol majetok počas budovania investovaný do najväčších svetových spoločností zastúpených v globálnom akciovom indexe MSCI World. Pomocou metódy Monte Carlo vytvoríme 800 simulovaných priebehov založených na historických výnosoch indexu. Uvidíte, v koľkých z nich kapitál pokryl všetky zvolené výplaty renty. Výsledok nie je predpoveďou budúceho vývoja.";
      const names=delivery.querySelector(".gate-names");
      const prompt=document.createElement("p");prompt.className="flow-form-prompt";prompt.textContent="Kam vám máme poslať odkaz na modeláciu?";
      const note=document.createElement("p");note.className="flow-copy";note.textContent="Modelácia sa vám otvorí okamžite. Odkaz vám zároveň pošleme e-mailom, aby ste sa k nej mohli kedykoľvek vrátiť.";
      if(names){names.before(prompt);prompt.after(note);}
      const send=document.getElementById("send-model");if(send)send.textContent="Získať moju modeláciu";
      const privacy=delivery.querySelector(".privacy-note");
      if(privacy)privacy.innerHTML="Odoslaním formulára beriete na vedomie spracovanie osobných údajov na účely vytvorenia a doručenia modelácie podľa <a href='https://www.hechtberger.com/pravidla-ochrany-osobnych-udajov' target='_blank' rel='noopener'>Pravidiel ochrany osobných údajov</a>.";
      if(gate){
        const left=document.createElement("div"),right=document.createElement("div"),children=[...gate.children];
        left.className="flow-delivery-copy";right.className="flow-delivery-form";gate.classList.add("flow-delivery-layout");gate.append(left,right);
        for(const child of children)(child===title||child===label||child.classList?.contains("path-label")?left:right).appendChild(child);
      }
    }

    const consult=document.querySelector(".consult-panel");
    if(consult){
      consult.classList.add("flow-consult");
      consult.innerHTML=`
        <div class="consult-head">
          <span class="consult-portrait" role="img" aria-label="Petr Hechtberger"></span>
          <span class="path-label">Osobná konzultácia</span>
          <h3 id="consult-title" class="flow-title">Od modelácie k premyslenej stratégii</h3>
          <p class="consult-intro">Modelácia ukazuje, aký kapitál si váš plán vyžaduje a ako obstál v simuláciách založených na historických dátach.<br>Ak budete mať záujem, na osobnej konzultácii vieme modeláciu prepojiť s vaším celkovým majetkom a rozhodnutiami, ktoré máte pred sebou.<strong class="consult-gain">Čo tým získate:</strong></p>
        </div>
        <div class="consult-benefits">
          <section class="consult-benefit"><h4>Pohľad dopredu</h4><p>K historickému testu pridáme modelový pohľad založený na aktuálnych CMA<sup>*</sup> a spoločne posúdime, čo z nich môže vyplývať pre váš plán.</p><p class="consult-note">* CMA znamená Capital Market Assumptions - dlhodobé očakávania výnosov a rizík popredných svetových investičných inštitúcií.</p></section>
          <section class="consult-benefit"><h4>Audit portfólia</h4><p>Pozrieme sa na výnosový potenciál, riziko, náklady, likviditu a na to, ako jednotlivé investície spolu fungujú v kontexte vášho celkového majetku.</p></section>
          <section class="consult-benefit"><h4>Stratégia na mieru</h4><p>Ak nájdeme priestor na zlepšenie, navrhneme konkrétny ďalší postup podľa vašich cieľov, časového horizontu a potrebnej likvidity.</p></section>
        </div>
        <p class="consult-closing">Cieľom je, aby každá investícia plnila jasnú úlohu v jednej majetkovej stratégii, namiesto toho, aby zostala izolovaným produktom.</p>
        <a class="btn" href="https://hechtberger.com/rezervacia" target="_blank" rel="noopener">Rezervovať konzultáciu</a>`;
    }
    document.dispatchEvent(new Event("flow10of10-ready"));
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});else apply();
})();
