/* Kanonická vrstva presnej terminológie, scenárových výnimiek a klientského vysvetlenia. */
(()=>{
  "use strict";
  const q=new URLSearchParams(location.search);
  const fmt=n=>new Intl.NumberFormat("sk-SK",{maximumFractionDigits:0}).format(Number(n))+" €";

  function staticCopy(){
    const h1=document.querySelector(".hero h1"),lead=document.querySelector(".hero .lead");
    if(h1)h1.textContent="Váš plán privátnej renty v jednom prehľade";
    if(lead){
      const start=Number(q.get("start"));
      const maHistorickyTest=Number(q.get("now"))<start&&q.get("pension")!=="perpetuity"&&q.get("goal")!=="duration";
      /* Prvú vetu preberáme z už vypočítaného cieľa. Tak ostane pravdivá aj pri
         hotovom majetku, okamžitom čerpaní, rente bez konca a odvodenom horizonte. */
      const ciel=document.getElementById("ciel")?.textContent.trim()||"Váš plán privátnej renty je pripravený.";
      const historickyDovetok=q.get("sit")==="have"
        ? "Nižšie uvidíte hlavné čísla plánu a ako obstál v modelovaných simuláciách založených na historických dátach."
        : "Nižšie uvidíte, aký majetok si tento plán vyžaduje a ako obstál v modelovaných simuláciách založených na historických dátach.";
      lead.textContent=maHistorickyTest
        ? `${ciel} ${historickyDovetok}`
        : `${ciel} Nižšie uvidíte hlavné čísla plánu a predpoklady, z ktorých výpočet vychádza.`;
    }
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
    /* Number("") je NULA, nie NaN. Master píše do splnenej méty text „už spĺňa"
       a bez tejto poistky z neho vzniklo „0 €" - klient čítal, že na tú úroveň
       nepotrebuje nič, hoci ju spĺňa práve svojou dnešnou investíciou. */
    const jeSuma=v=>/[0-9]/.test(String(v));
    const približne=v=>{if(!jeSuma(v))return v;
      const n=Number(String(v).replace(/[^0-9-]/g,""));
      return Number.isFinite(n)?fmt(Math.round(n/1000)*1000):v;};
    /* Či je méta splnená, sa NEODVODZUJE z textu, ale z počtu úspešných
       simulácií - text sa dá kedykoľvek preformulovať, číslo nie. */
    const dosiahnute=Number(success);
    const splnena=h=>Number.isFinite(dosiahnute)&&dosiahnute>=h;
    /* `sentence` vzniká až o riadok nižšie, preto sa číta až pri volaní,
       nie pri definícii - inak by to padlo na dočasnej mŕtvej zóne. */
    const riadokCitlivosti=(hranica,hodnota,podiel)=>
      '<div class="citlivost-rad"><div class="co">'+(splnena(hranica)
        ?'<strong>Túto úroveň spĺňa už '+(sentence.charAt(0).toLowerCase()+sentence.slice(1))+' '+today+'</strong>'
         +'<small>Dosiahli ste '+success+'&nbsp;z&nbsp;800 simulácií.</small>'
        :'<strong>Približná modelová výška vstupu: '+približne(hodnota)+'</strong>'
         +'<small>Zaokrúhlená ilustračná hranica namiesto '+today+'.</small>')
      +'</div><div class="kolko"><strong>Majetok by pokryl všetky výplaty aspoň v '
      +hranica+'&nbsp;z&nbsp;800 simulácií</strong><span>Ilustračná úroveň '
      +podiel+'&nbsp;% simulácií v tomto modeli.</span></div></div>';
    const sentence=sit==="have"?"Váš dnešný majetok":mode==="lump"?"Vaša dnešná investícia":"Všetky vaše investície počas budovania";
    const label=document.getElementById("s1-k");if(label)label.textContent=sit==="have"?"Váš majetok dnes":mode==="lump"?"Koľko investujete dnes":"Koľko investujete spolu";
    odolnost.querySelector("h2").textContent="Obstál by váš plán aj pri rozdielnom vývoji trhov?";
    const intro=document.getElementById("odolnost-uvod");
    if(intro)intro.textContent="Základný prepočet počíta každý rok s rovnakým zhodnotením, ktoré ste zadali. V 800 modelovaných simuláciách meníme vývoj iba počas budovania majetku. Po začatí renty všetky simulácie používajú rovnaký plánovací výnos 4 % ročne po investičných nákladoch, pred infláciou.";
    let box=odolnost.querySelector(".odolnost-testuje");
    if(!box){box=document.createElement("div");box.className="odolnost-testuje";tbody.closest("table").before(box);}
    box.innerHTML='<p><strong>Čo presne testujeme?</strong></p><ul>'+
      '<li><strong>'+sentence+':</strong> '+today+'.</li>'+
      '<li><strong>Cieľ:</strong> renta '+fmt(rent)+' mesačne v dnešnej hodnote od '+start+' do '+end+' rokov; počas čerpania rastie so zadanou infláciou.</li>'+
      '<li><strong>Základný prepočet:</strong> pri rovnakom zhodnotení každý rok má táto suma do veku '+start+' rokov vyrásť na '+target+'.</li></ul>'+
      '<p class="poznamka">V modelovaných simuláciách sa zhodnotenie počas budovania každý rok mení. Preto sa mení aj majetok, ktorý je k dispozícii na začiatku renty.</p>';
    tbody.innerHTML='<tr class="vas"><td class="kolko" colspan="2"><span class="vysledok-label">Výsledok modelovaných simulácií</span><strong>Majetok pokryl všetky plánované výplaty v '+success+'&nbsp;z&nbsp;800 simulácií</strong><span>Teda rentu '+fmt(rent)+' mesačne v dnešnej hodnote od '+start+' do '+end+' rokov, počas čerpania zvyšovanú o infláciu. Ide o podiel úspešných simulácií v tomto modeli, nie odhad pravdepodobnosti budúceho úspechu.</span></td></tr>';
    let sensitivity=odolnost.querySelector(".odolnost-citlivost");
    if(!sensitivity){sensitivity=document.createElement("details");sensitivity.className="odolnost-citlivost";tbody.closest("table").after(sensitivity);}
    sensitivity.innerHTML='<summary>Doplňujúci detail: ako sa výsledok mení s vyššou rezervou</summary><p class="uvod">Dve ilustračné úrovne ukazujú, ako by sa výsledok menil pri vyššom vstupe. Jednu z nich váš dnešný vstup už dosahuje.</p>'+
      riadokCitlivosti(600,meta600,75)+riadokCitlivosti(720,meta720,90);
    let conclusion=odolnost.querySelector(".odolnost-zaver");
    if(!conclusion){conclusion=document.createElement("p");conclusion.className="odolnost-zaver";sensitivity.before(conclusion);}
    conclusion.innerHTML="<strong>Čo si z toho odniesť?</strong> Základný prepočet predpokladá rovnaké zhodnotenie každý rok. Modelované simulácie ukazujú citlivosť na poradie výnosov počas budovania majetku. Kolísanie výnosov počas čerpania renty tento test nemodeluje.";
    const method=document.getElementById("odolnost-pod");
    if(method&&!method.closest(".odolnost-metodika")){const detail=document.createElement("details"),summary=document.createElement("summary");detail.className="odolnost-metodika";summary.textContent="Ako sme modelované simulácie počítali";method.before(detail);detail.append(summary,method);}
    tbody.dataset.vysvetlene="1";
  }

  function summary(){
    if(q.get("pension")==="perpetuity")return;
    const s1=document.getElementById("s1-v"),s2=document.getElementById("s2-v"),s3=document.getElementById("s3-v"),k2=document.getElementById("s2-k"),k3=document.getElementById("s3-k"),pod=document.getElementById("suhrn-pod");
    const num=el=>Number((el?.textContent||"").replace(/[^0-9-]/g,""));
    if(k2)k2.textContent="Nominálny súčet vyplatenej renty";if(k3)k3.textContent="Rozdiel medzi nominálnou rentou a investíciami";
    if(s1&&s2&&s3&&Number.isFinite(num(s1))&&Number.isFinite(num(s2)))s3.textContent=fmt(num(s2)-num(s1));
    if(pod)pod.textContent="Ide o nominálny súčet mesačných rent, ktoré počas čerpania rastú so zadanou infláciou. Nie je to suma v dnešnej kúpnej sile; údaje sú pred zdanením.";
  }

  function assumptions(){
    const block=document.querySelector(".assumptions");if(!block||block.closest(".predpoklady-detail"))return;
    const detail=document.createElement("details"),summaryEl=document.createElement("summary");detail.className="predpoklady-detail";detail.open=matchMedia("(min-width:641px)").matches;summaryEl.textContent="Použité predpoklady a metodika";block.before(detail);detail.append(summaryEl,block);
  }
  function apply(){staticCopy();exceptions();explainHistory();summary();assumptions();}
  document.addEventListener("odolnost-hotova",apply);
  addEventListener("load",apply,{once:true});
  setTimeout(apply,2600);
})();
