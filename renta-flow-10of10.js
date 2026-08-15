/* Kanonická obsahová a rozvrhová vrstva schválenej klientovej cesty. */
(()=>{
  "use strict";
  if(new URLSearchParams(location.search).has("legacy_preview"))return;
  const apply=()=>{
    const lp=document.getElementById("lp"),msg=document.getElementById("msg");
    if(!lp||!msg||lp.dataset.flow10of10==="1")return;
    lp.dataset.flow10of10="1";

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
      if(label)label.innerHTML="Modeláciu vám spracujeme do <strong>prehľadného PDF</strong>, aby ste sa k nej mohli kedykoľvek vrátiť. Na otvorenej modelácii si PDF stiahnete jedným kliknutím.<br><br>Ak má váš scenár obdobie budovania a <strong>vopred zvolený koniec čerpania</strong>, plán navyše preveríme v 800 modelovaných simuláciách založených na historických výnosoch indexu MSCI World z rokov 1970 až 2025. Uvidíte, v koľkých simuláciách kapitál pokryl všetky zvolené výplaty renty. Ide o podiel úspešných simulácií v tomto modeli, nie odhad pravdepodobnosti ani predpoveď budúceho vývoja.";
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
      const title=consult.querySelector("h3"),button=consult.querySelector(".btn");
      [...consult.querySelectorAll(":scope > p")].forEach(p=>p.remove());
      if(title){title.textContent="Čo môže váš plán znamenať pre váš skutočný majetok?";title.className="flow-title";}
      const intro=document.createElement("p");intro.className="flow-copy";
      intro.innerHTML="Na osobnej konzultácii — online alebo osobne — zasadíme váš plán do kontextu skutočného majetku a doplníme pohľad do budúcnosti. <strong>Ako to urobíme?</strong><br><br>Použijeme aktuálne dlhodobé očakávania výnosov a rizík popredných svetových investičných inštitúcií — <strong>CMA (Capital Market Assumptions)</strong>.";
      const body=document.createElement("p");body.className="flow-copy";
      body.innerHTML="Vďaka tomuto komplexnému pohľadu získate ucelenejší rozhodovací rámec pre svoje súčasné portfólio — jeho výnosový potenciál, riziko, likviditu a schopnosť financovať plánovanú rentu. Jednotlivé investičné produkty tak <strong>prestanú byť samotným cieľom a stanú sa nástrojmi vašej stratégie</strong>.";
      if(title)title.after(intro);
      const layout=document.createElement("div"),left=document.createElement("div"),right=document.createElement("div");
      layout.className="flow-consult-layout";left.className="flow-consult-copy";right.className="flow-consult-action";
      consult.append(layout);layout.append(left,right);
      const pathLabel=consult.querySelector(":scope > .path-label");if(pathLabel)left.append(pathLabel);
      if(title)left.append(title);left.append(intro);right.append(body);if(button)right.append(button);
    }
    document.dispatchEvent(new Event("flow10of10-ready"));
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});else apply();
})();
