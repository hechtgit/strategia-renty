/* Kanonická vrstva presnej terminológie, scenárových výnimiek a klientského vysvetlenia. */
(()=>{
  "use strict";
  const q=new URLSearchParams(location.search);
  const fmt=n=>new Intl.NumberFormat("sk-SK",{maximumFractionDigits:0}).format(Number(n))+" €";

  function staticCopy(){
    const h1=document.querySelector(".hero h1"),lead=document.querySelector(".hero .lead");
    if(h1)h1.textContent="Váš plán privátnej renty v jednom prehľade";
    if(lead)lead.textContent="Modelácia zachytáva scenár, ktorý ste si nastavili v kalkulačke. Ak má obdobie budovania a vopred zvolený koniec čerpania, dopĺňa ho o test založený na historických výnosoch. Je to orientačný rámec pre ďalšie rozhodovanie — nie úplný obraz vášho majetku, likvidity, rizika ani ďalších cieľov.";
    const consult=document.querySelector(".next"),title=consult?.querySelector("h2"),paragraphs=consult?.querySelectorAll("p");
    if(title)title.textContent="Váš plán v dnešnom kontexte";
    if(paragraphs?.[0])paragraphs[0].textContent="Na osobnej konzultácii zasadíme váš plán do kontextu skutočného majetku a doplníme pohľad založený na aktuálnych dlhodobých očakávaniach popredných svetových investičných inštitúcií.";
    if(paragraphs?.[1])paragraphs[1].textContent="Vychádzame pritom z aktuálnych dlhodobých očakávaní výnosov a rizík popredných svetových investičných inštitúcií (Capital Market Assumptions, CMA). Nejde o predpoveď ani garanciu.";
    if(paragraphs?.[2])paragraphs[2].textContent="Váš scenár zasadíme do štruktúry skutočného majetku, jeho likvidity, rizika a účelu. Spoločne posúdime, čo z dostupných údajov pre váš plán vyplýva a či potrebuje rezervu alebo úpravu.";
  }

  function exceptions(){
    const now=Number(q.get("now")),start=Number(q.get("start")),goal=q.get("goal"),pension=q.get("pension"),odolnost=document.getElementById("odolnost");
    if(start<=now&&odolnost){
      odolnost.hidden=true;
      const method=[...document.querySelectorAll(".assumptions .blok p")].find(p=>p.querySelector("strong"));
      if(method)method.innerHTML="<strong>Metodika scenára.</strong> Keďže čerpanie začína okamžite, neexistuje obdobie budovania, na ktorom by sa dal vykonať historický test. Výsledok preto používa iba váš zadaný predpoklad a historické porovnanie nezobrazuje.";
    }
    if(pension==="perpetuity"||goal==="duration"){
      if(odolnost)odolnost.hidden=true;
      const method=[...document.querySelectorAll(".assumptions .blok p")].find(p=>p.querySelector("strong"));
      if(method)method.innerHTML=pension==="perpetuity"
        ?"<strong>Metodika scenára.</strong> Váš vlastný scenár používa zadané zhodnotenie počas celého obdobia. Historické porovnanie sa pri rente bez časového obmedzenia nezobrazuje, pretože nemá vopred zvolený koniec čerpania."
        :"<strong>Metodika scenára.</strong> Váš vlastný scenár používa zadané zhodnotenie počas celého obdobia. Historické porovnanie sa pri otázke, ako dlho majetok vydrží, nezobrazuje, pretože výsledný horizont je sám predmetom výpočtu.";
    }
  }

  function explainHistory(){
    const odolnost=document.getElementById("odolnost"),tbody=document.getElementById("odolnost-riadky");
    if(!odolnost||odolnost.hidden||!tbody||tbody.dataset.vysvetlene==="1")return;
    const rows=[...tbody.querySelectorAll("tr")];if(rows.length<3)return;
    const value=i=>rows[i]?.querySelector(".kolko")?.textContent.trim()||"—";
    const now=Number(q.get("now")),start=Number(q.get("start")),end=Number(q.get("end")),rent=Number(q.get("rent"));
    const mode=q.get("mode")||"lump",sit=q.get("sit")||"build";
    const today=document.getElementById("s1-v")?.textContent.trim()||document.getElementById("t-value")?.textContent.trim()||"—";
    const target=document.getElementById("s-value1")?.textContent.trim()||"—";
    const success=(value(0).match(/[0-9]+/)||["—"])[0],meta600=value(1),meta720=value(2);
    const približne=v=>{const n=Number(String(v).replace(/[^0-9-]/g,""));return Number.isFinite(n)?fmt(Math.round(n/1000)*1000):v;};
    const sentence=sit==="have"?"Váš dnešný majetok":mode==="lump"?"Váš dnešný vklad":"Všetky vaše vklady počas budovania";
    const label=document.getElementById("s1-k");if(label)label.textContent=sit==="have"?"Váš majetok dnes":mode==="lump"?"Koľko vložíte dnes":"Koľko vložíte spolu";
    odolnost.querySelector("h2").textContent="Obstál by váš plán aj pri rozdielnom vývoji trhov?";
    const intro=document.getElementById("odolnost-uvod");
    if(intro)intro.textContent="Základný prepočet počíta každý rok s rovnakým zhodnotením, ktoré ste zadali. V 800 modelovaných skúškach meníme vývoj iba počas budovania majetku. Po začatí renty všetky skúšky používajú rovnaký plánovací výnos 4 % ročne po investičných nákladoch, pred infláciou.";
    let box=odolnost.querySelector(".odolnost-testuje");
    if(!box){box=document.createElement("div");box.className="odolnost-testuje";tbody.closest("table").before(box);}
    box.innerHTML='<p><strong>Čo presne testujeme?</strong></p><ul>'+
      '<li><strong>'+sentence+':</strong> '+today+'.</li>'+
      '<li><strong>Cieľ:</strong> renta '+fmt(rent)+' mesačne v dnešnej hodnote od '+start+' do '+end+' rokov; počas čerpania rastie so zadanou infláciou.</li>'+
      '<li><strong>Základný prepočet:</strong> pri rovnakom zhodnotení každý rok má táto suma do veku '+start+' rokov vyrásť na '+target+'.</li></ul>'+
      '<p class="poznamka">V modelovaných skúškach sa zhodnotenie počas budovania každý rok mení. Preto sa mení aj kapitál, ktorý je k dispozícii na začiatku renty.</p>';
    tbody.innerHTML='<tr class="vas"><td class="co"><strong>'+sentence+': '+today+'</strong><small>V každej skúške testujeme, či tento vstup dokáže financovať všetky zvolené renty.</small></td><td class="kolko"><strong>Kapitál pokryl všetky plánované výplaty v '+success+'&nbsp;z&nbsp;800 skúšok</strong><span>Teda rentu '+fmt(rent)+' mesačne v dnešnej hodnote od '+start+' do '+end+' rokov, počas čerpania zvyšovanú o infláciu. Ide o podiel úspešných skúšok v tomto modeli, nie odhad pravdepodobnosti budúceho úspechu.</span></td></tr>';
    let sensitivity=odolnost.querySelector(".odolnost-citlivost");
    if(!sensitivity){sensitivity=document.createElement("details");sensitivity.className="odolnost-citlivost";tbody.closest("table").after(sensitivity);}
    sensitivity.innerHTML='<summary>Ako sa výsledok mení s vyššou rezervou</summary><p class="uvod">Dve ilustračné úrovne ukazujú citlivosť výsledku na vyšší vstup. Nie sú odporúčanými cieľmi ani odhadom budúcej pravdepodobnosti.</p>'+
      '<div class="citlivost-rad"><div class="co"><strong>Približná modelová výška vstupu: '+približne(meta600)+'</strong><small>Zaokrúhlená ilustračná hranica namiesto '+today+'.</small></div><div class="kolko"><strong>Kapitál by pokryl všetky výplaty aspoň v 600&nbsp;z&nbsp;800 skúšok</strong><span>Ilustračná úroveň 75 % skúšok v tomto modeli.</span></div></div>'+
      '<div class="citlivost-rad"><div class="co"><strong>Približná modelová výška vstupu: '+približne(meta720)+'</strong><small>Zaokrúhlená ilustračná hranica namiesto '+today+'.</small></div><div class="kolko"><strong>Kapitál by pokryl všetky výplaty aspoň v 720&nbsp;z&nbsp;800 skúšok</strong><span>Ilustračná úroveň 90 % skúšok v tomto modeli.</span></div></div>';
    let conclusion=odolnost.querySelector(".odolnost-zaver");
    if(!conclusion){conclusion=document.createElement("p");conclusion.className="odolnost-zaver";sensitivity.before(conclusion);}
    conclusion.innerHTML="<strong>Čo si z toho odniesť?</strong> Základný prepočet predpokladá rovnaké zhodnotenie každý rok. Modelované skúšky ukazujú citlivosť na poradie výnosov počas budovania majetku. Kolísanie výnosov počas čerpania renty tento test nemodeluje.";
    const method=document.getElementById("odolnost-pod");
    if(method&&!method.closest(".odolnost-metodika")){const detail=document.createElement("details"),summary=document.createElement("summary");detail.className="odolnost-metodika";summary.textContent="Ako sme modelované skúšky počítali";method.before(detail);detail.append(summary,method);}
    tbody.dataset.vysvetlene="1";
  }

  function summary(){
    if(q.get("pension")==="perpetuity")return;
    const s1=document.getElementById("s1-v"),s2=document.getElementById("s2-v"),s3=document.getElementById("s3-v"),k2=document.getElementById("s2-k"),k3=document.getElementById("s3-k"),pod=document.getElementById("suhrn-pod");
    const num=el=>Number((el?.textContent||"").replace(/[^0-9-]/g,""));
    if(k2)k2.textContent="Nominálny súčet vyplatenej renty";if(k3)k3.textContent="Rozdiel medzi nominálnou rentou a vkladmi";
    if(s1&&s2&&s3&&Number.isFinite(num(s1))&&Number.isFinite(num(s2)))s3.textContent=fmt(num(s2)-num(s1));
    if(pod)pod.textContent="Ide o nominálny súčet mesačných rent, ktoré počas čerpania rastú so zadanou infláciou. Nie je to suma v dnešnej kúpnej sile; údaje sú pred zdanením.";
  }

  function assumptions(){
    const block=document.querySelector(".assumptions");if(!block||block.closest(".predpoklady-detail"))return;
    const detail=document.createElement("details"),summaryEl=document.createElement("summary");detail.className="predpoklady-detail";detail.open=matchMedia("(min-width:901px)").matches;summaryEl.textContent="Použité predpoklady a metodika";block.before(detail);detail.append(summaryEl,block);
  }
  function apply(){staticCopy();exceptions();explainHistory();summary();assumptions();}
  document.addEventListener("odolnost-hotova",apply);
  addEventListener("load",apply,{once:true});
  setTimeout(apply,2600);
})();
