#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const landing=fs.readFileSync(new URL('../cara-zivota-master.html',import.meta.url),'utf8');
const result=fs.readFileSync(new URL('../vysledok-10of10.js',import.meta.url),'utf8');
const resultMaster=fs.readFileSync(new URL('../vysledok-master.html',import.meta.url),'utf8');
const guide=fs.readFileSync(new URL('../sprievodca.js',import.meta.url),'utf8');
const footerInjection=fs.readFileSync(new URL('../squarespace-footer-injection.html',import.meta.url),'utf8');
const pageInjection=fs.readFileSync(new URL('../squarespace-injection.html',import.meta.url),'utf8');

function between(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  if(a<0||b<0)throw new Error(`Chýba testovací blok ${start}`);
  return source.slice(a+start.length,b);
}
function ok(value,label){if(!value)throw new Error(label)}
function close(a,b,label,rel=1e-10){
  const scale=Math.max(1,Math.abs(a),Math.abs(b));
  if(!Number.isFinite(a)||Math.abs(a-b)>scale*rel)throw new Error(`${label}: ${a} != ${b}`);
}

const coreStart=landing.indexOf('/* JADRO:ZAČIATOK');
const coreEnd=landing.indexOf('/* JADRO:KONIEC */',coreStart);
if(coreStart<0||coreEnd<0)throw new Error('Chýba finančné jadro.');
const core=landing.slice(coreStart,coreEnd+'/* JADRO:KONIEC */'.length);
function compute(params){
  const search='?'+new URLSearchParams(params).toString();
  const context=vm.createContext({URLSearchParams,location:{search,protocol:'https:',origin:'https://example.test',pathname:'/cara-zivota.html'},console});
  vm.runInContext(`${core};globalThis.__out={S,compute:compute()};`,context);
  return context.__out;
}
const base={
  now:35,start:55,end:90,rent:3000,existing:600000,combo:100000,monthlyKnown:5000,
  infl:3,vynos:5,vynosRent:5,sit:'have',mode:'lump',goal:'rent',comboDir:'needed',
  pension:'temporary',infl_on:1
};
const withInflation=compute(base).compute;
ok(withInflation.calculatesRent,'Hotový majetok musí označiť rentu ako vypočítaný výsledok.');
close(withInflation.Rtoday,withInflation.R/Math.pow(1.03,20),'Renta v dnešných cenách');
const withoutInflation=compute({...base,infl_on:0}).compute;
close(withoutInflation.Rtoday,withoutInflation.R,'Renta bez inflácie');

const acceptance={...base,now:45,start:62,end:90,existing:600000,vynos:5,vynosRent:5,infl:3};
const acceptanceInflation=compute(acceptance).compute;
ok(Math.abs(Math.round(acceptanceInflation.Rtoday)-2491)<=2,
  `Akceptačný scenár: hlavná renta ${Math.round(acceptanceInflation.Rtoday)} != 2491`);
ok(Math.abs(Math.round(acceptanceInflation.R)-4118)<=2,
  `Akceptačný scenár: prvá výplata ${Math.round(acceptanceInflation.R)} != 4118`);
const acceptanceFixed=compute({...acceptance,infl_on:0}).compute;
ok(Math.abs(Math.round(acceptanceFixed.Rtoday)-5951)<=2&&Math.abs(Math.round(acceptanceFixed.R)-5951)<=2,
  `Akceptačný scenár bez inflácie: ${Math.round(acceptanceFixed.Rtoday)} / ${Math.round(acceptanceFixed.R)}`);

const presentationSource=between(result,'/* HAVE_RENT_PRESENTATION:START */','/* HAVE_RENT_PRESENTATION:END */');
const presentationContext=vm.createContext({Intl});
vm.runInContext(`const fmt=n=>new Intl.NumberFormat('sk-SK',{maximumFractionDigits:0}).format(Number(n))+' €';${presentationSource};globalThis.fn=haveRentPresentation;`,presentationContext);
const presentInflation=presentationContext.fn({...base,rentToday:withInflation.Rtoday,
  firstPayment:Math.round(withInflation.R),inflOn:true});
close(presentInflation.firstPayment,Math.round(withInflation.R),'Výsledok a PDF: prvá nominálna výplata');
ok(presentInflation.label.includes('dnešných cenách'),'Primárna renta musí hovoriť o dnešných cenách.');
ok(presentInflation.sub.includes('Prvá výplata'),'Nominálna prvá výplata musí byť sekundárna informácia.');
const roundedToday=presentationContext.fn({...acceptance,rentToday:Math.round(acceptanceInflation.Rtoday),
  firstPayment:Math.round(acceptanceInflation.R),inflOn:true});
const roundedTodayText=roundedToday.sub.replace(/\u00a0/g,' ');
ok(roundedTodayText.includes('4 118')&&!roundedTodayText.includes('4 119'),
  'Výsledok musí prevziať presnú nominálnu výplatu z jadra, nie ju spätne prepočítať zo zaokrúhlenej URL.');
ok(result.includes('value.dataset.haveRentNominal')&&result.includes('value.dataset.haveRentNominal=String(firstPayment)')
  &&result.includes('value.dataset.haveRentToday')&&result.includes('value.dataset.haveRentToday=String(params.rentToday)'),
  'Opakované spustenie výsledkovej vrstvy musí zachovať obe vypočítané hodnoty.');
ok(!result.includes("rentToday:Number(q.get('rent'))"),
  'Legacy have+rent odkaz nesmie zameniť pôvodný parameter rent za vypočítanú rentu.');
ok(resultMaster.includes("$('s-value2').dataset.haveRentToday=String(o.Rtoday)")
  &&resultMaster.includes("$('s-value2').dataset.haveRentNominal=String(o.R)"),
  'Výsledková stránka musí prezentačnej vrstve odovzdať obe hodnoty priamo z jadra.');
const presentFixed=presentationContext.fn({...base,rentToday:withoutInflation.Rtoday,inflOn:false});
close(presentFixed.firstPayment,withoutInflation.R,'Výsledok bez inflácie');
ok(!presentFixed.label.includes('dnešných')&&!presentFixed.label.includes('nominálna'),'Bez inflácie nesmie zostať cenové slovné označenie.');
ok(presentFixed.sub==='mesačne'&&!presentFixed.goal.includes('Prvá výplata'),'Bez inflácie nesmie zostať sekundárna poznámka.');

const rentResolutionSource=between(result,'/* HAVE_RENT_RESOLUTION:START */','/* HAVE_RENT_RESOLUTION:END */');
const rentResolutionContext=vm.createContext({});
vm.runInContext(`${rentResolutionSource};globalThis.fn=resolvedHaveRentToday;`,rentResolutionContext);
close(rentResolutionContext.fn('have','rent',3000,acceptanceInflation.Rtoday),acceptanceInflation.Rtoday,
  'Legacy rent parameter nesmie preniknúť do PDF historického bloku');
close(rentResolutionContext.fn('build','rent',3000,acceptanceInflation.Rtoday),3000,
  'Build scenár musí zachovať zadanú rentu');

const scenarioPolicy=between(landing,'/* SCENARIO_PARAMS_POLICY:START */','/* SCENARIO_PARAMS_POLICY:END */');
const scenarioContext=vm.createContext({URLSearchParams});
vm.runInContext(`${scenarioPolicy};globalThis.entries=scenarioEntries;`,scenarioContext);
const fullAcceptance=compute(acceptance);
const compactAcceptance=scenarioContext.entries(fullAcceptance.S,fullAcceptance.compute);
const compactKeys=new Set(compactAcceptance.map(([key])=>key));
ok(compactKeys.has('existing')&&compactKeys.has('goal'),'Have scenár musí niesť existing a goal.');
ok(!compactKeys.has('combo')&&!compactKeys.has('monthlyKnown')&&!compactKeys.has('comboDir')&&!compactKeys.has('mode'),
  'Have scenár nesmie niesť nepoužité build hodnoty.');
const acceptanceRoundtrip=compute(compactAcceptance).compute;
for(const key of ['cap','R','Rtoday','avail'])close(acceptanceRoundtrip[key],acceptanceInflation[key],`Have round-trip ${key}`);

const durationState={...acceptance,goal:'duration',rent:4000};
const durationFull=compute(durationState);
ok(!durationFull.compute.calculatesRent&&Number.isFinite(durationFull.compute.months),
  'Duration režim sa nesmie prepnúť na výpočet renty.');
const durationCompact=scenarioContext.entries(durationFull.S,durationFull.compute);
const durationRoundtrip=compute(durationCompact).compute;
ok(durationRoundtrip.months===durationFull.compute.months,'Duration round-trip musí zachovať počet mesiacov.');
close(durationRoundtrip.R,durationFull.compute.R,'Duration round-trip renta');

const comboState={...base,sit:'build',mode:'combo',comboDir:'known',combo:10000000,
  monthlyKnown:100000,now:18,start:119,end:120,rent:50000,infl:10,vynos:50,vynosRent:10};
const comboFull=compute(comboState);
const comboCompact=scenarioContext.entries(comboFull.S,comboFull.compute);
const comboKeys=new Set(comboCompact.map(([key])=>key));
for(const key of ['combo','comboDir','monthlyKnown','mode'])ok(comboKeys.has(key),`Combo URL: chýba ${key}`);
ok(!comboKeys.has('existing')&&!comboKeys.has('goal'),'Build URL nesmie niesť have hodnoty.');
const compactUrl='https://hechtgit.github.io/strategia-renty/vysledok.html?'+new URLSearchParams(comboCompact);
ok(compactUrl.length<=255,`Kompaktná URL má ${compactUrl.length} znakov.`);
const comboRoundtrip=compute(comboCompact).compute;
for(const key of ['cap','R','Rtoday','P0','M'])close(comboRoundtrip[key],comboFull.compute[key],`Combo round-trip ${key}`);

const sensitivitySource=between(result,'/* SENSITIVITY_INTRO:START */','/* SENSITIVITY_INTRO:END */');
const sensitivityContext=vm.createContext({});
vm.runInContext(`globalThis.intro=dosiahnute=>{${sensitivitySource};return sensitivityIntro;};`,sensitivityContext);
ok(!sensitivityContext.intro(599).includes('už dosahuje'),'Nesplnená hranica nesmie tvrdiť, že ju vstup dosahuje.');
ok(sensitivityContext.intro(600).includes('už dosahuje'),'Splnená prvá hranica má zachovať pravdivú vetu.');
ok(sensitivityContext.intro(719).includes('Jednu z nich'),'Hodnota 719 musí zostať v jednotnom čísle.');
ok(sensitivityContext.intro(720).includes('Obe z nich váš dnešný vstup už dosahuje.')
  &&sensitivityContext.intro(800).includes('Obe z nich'),
  'Splnené obe hranice musia použiť množné číslo.');
ok(footerInjection.includes('e.origin !== POVOLENY_POVOD || e.source !== f.contentWindow'),
  'Globálny scroll poslucháč musí overiť pôvod aj konkrétny rám.');
ok(footerInjection.includes('window.scrollTo({ top: Math.max(0, Math.round(ciel)), behavior: "auto" })'),
  'Scroll sprievodcu musí dorovnávať polohu okamžite.');
ok(!footerInjection.includes('window.scrollTo({ top: Math.max(0, Math.round(ciel)), behavior: "smooth" })'),
  'Scroll sprievodcu nesmie pretekať s animáciou rodičovského odkazu.');
ok(footerInjection.includes('requestAnimationFrame(function () { stabilizuj(')
  &&footerInjection.includes('performance.now() + 900'),
  'Najnovší krok musí 900 ms odolávať dobiehajúcej JS animácii kotvy.');

const scrollBlock=between(footerInjection,'<!-- PH_SPRIEVODCA_SCROLL_V1_START -->',
  '<!-- PH_SPRIEVODCA_SCROLL_V1_END -->');
const scrollScript=scrollBlock.match(/<script>([\s\S]*?)<\/script>/)?.[1];
ok(scrollScript,'Chýba vykonateľný scroll poslucháč sprievodcu.');
function scrollHarness(){
  const handlers={},frames=[];
  const frameWindow={};
  let now=0;
  const win={
    scrollY:0,innerHeight:700,
    addEventListener(type,fn){handlers[type]=fn;},
    scrollTo({top}){this.scrollY=top;}
  };
  const frame={
    contentWindow:frameWindow,
    getBoundingClientRect(){return {top:1000-win.scrollY};}
  };
  const context=vm.createContext({
    window:win,
    document:{querySelector(selector){return selector.includes('cara-zivota')?frame:null;}},
    performance:{now(){return now;}},
    requestAnimationFrame(fn){frames.push(fn);return frames.length;}
  });
  vm.runInContext(scrollScript,context);
  return {
    handlers,frames,win,frameWindow,
    frame(ms=16){now+=ms;const fn=frames.shift();if(fn)fn(now);},
    drain(){while(frames.length&&now<=1000)this.frame();}
  };
}
function validScroll(h,data){
  h.handlers.message({data:{type:'ph-renta-scroll',...data},
    origin:'https://hechtgit.github.io',source:h.frameWindow});
}
const lateScroll=scrollHarness();
validScroll(lateScroll,{top:300,bottom:550});
close(lateScroll.win.scrollY,1075,'Počiatočné dorovnanie sprievodcu',0);
lateScroll.win.scrollY=1475;
lateScroll.frame();
close(lateScroll.win.scrollY,1075,'Neskorý scroll Squarespace musí byť dorovnaný v ďalšom snímku',0);
lateScroll.drain();
lateScroll.win.scrollY=1475;
lateScroll.frame();
close(lateScroll.win.scrollY,1475,'Po 900 ms už slučka nesmie držať starý krok',0);

const expiredFrame=scrollHarness();
validScroll(expiredFrame,{top:300,bottom:550});
expiredFrame.win.scrollY=1475;
expiredFrame.frame(901);
close(expiredFrame.win.scrollY,1475,'Oneskorený snímok nesmie obnoviť expirovaný krok',0);

const generations=scrollHarness();
validScroll(generations,{top:100,bottom:300});
validScroll(generations,{top:700,bottom:900});
generations.win.scrollY=2000;
generations.frame();
close(generations.win.scrollY,2000,'Staršia generácia nesmie dorovnať nový krok',0);
generations.frame();
close(generations.win.scrollY,1450,'Najnovší krok sa musí dorovnať',0);

const foreignScroll=scrollHarness();
foreignScroll.handlers.message({data:{type:'ph-renta-scroll',top:300,bottom:550},
  origin:'https://utocnik.example',source:foreignScroll.frameWindow});
ok(foreignScroll.frames.length===0,'Cudzí origin nesmie spustiť stabilizačnú slučku.');
close(foreignScroll.win.scrollY,0,'Cudzí origin nesmie meniť polohu stránky',0);

const ctaScrollSource=between(pageInjection,'/* CTA_SCROLL_POLICY:START */','/* CTA_SCROLL_POLICY:END */');
const ctaTarget={getBoundingClientRect(){return {top:400};}};
const ctaCalls={push:[],scroll:[]};
const ctaWindow={
  pageYOffset:1000,
  location:{hash:''},
  history:{pushState(...args){ctaCalls.push.push(args);ctaWindow.location.hash=args[2];}},
  scrollTo(options){ctaCalls.scroll.push(options);}
};
const ctaContext=vm.createContext({
  window:ctaWindow,
  document:{getElementById(id){return id==='ph-renta-calculator'?ctaTarget:null;}}
});
vm.runInContext(`${ctaScrollSource};globalThis.handle=obsluzSkokKApp;`,ctaContext);
function ctaEvent(overrides={}){
  return {
    button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,
    prevented:0,stopped:0,
    preventDefault(){this.prevented++;},
    stopImmediatePropagation(){this.stopped++;},
    ...overrides
  };
}
const normalClick=ctaEvent();
ctaContext.handle(normalClick);
ok(normalClick.prevented===1&&normalClick.stopped===1,
  'Bežný klik na CTA musí zastaviť Squarespace animáciu kotvy.');
ok(ctaCalls.push.length===1&&ctaWindow.location.hash==='#ph-renta-calculator',
  'Bežný klik na CTA musí zapísať cieľ do histórie.');
ok(ctaCalls.scroll.length===1&&ctaCalls.scroll[0].top===1400&&ctaCalls.scroll[0].behavior==='auto',
  'CTA musí skočiť k aplikácii jedným okamžitým scrollom.');
const repeatClick=ctaEvent();
ctaContext.handle(repeatClick);
ok(ctaCalls.push.length===1&&ctaCalls.scroll.length===2,
  'Opakovaný klik pri rovnakom hashi nesmie vytvoriť duplicitný záznam histórie.');
const modifiedClick=ctaEvent({metaKey:true});
ctaContext.handle(modifiedClick);
ok(modifiedClick.prevented===0&&modifiedClick.stopped===0&&ctaCalls.scroll.length===2,
  'Klik s modifikátorom musí zachovať natívne správanie odkazu.');

const guidePolicy=between(guide,'/* GUIDE_VIEWPORT_POLICY:START */','/* GUIDE_VIEWPORT_POLICY:END */');
const guideContext=vm.createContext({URL});
vm.runInContext(`${guidePolicy};globalThis.policy=doveryhodnaViewportSprava;`,guideContext);
ok(guideContext.policy('https://www.hechtberger.com',true),'Produkčný rodič musí zostať funkčný.');
ok(guideContext.policy('https://app.hechtberger.com',true),'Dôveryhodná subdoména musí zostať funkčná.');
ok(!guideContext.policy('https://utocnik.example',true),'Cudzí origin sa musí odmietnuť.');
ok(!guideContext.policy('https://www.hechtberger.com',false),'Správa z iného okna sa musí odmietnuť.');
ok(!guideContext.policy('http://www.hechtberger.com',true),'Nešifrovaný origin sa musí odmietnuť.');

const pointLayoutSource=between(landing,'/* MOBILE_POINT_LAYOUT:START */','/* MOBILE_POINT_LAYOUT:END */');
const pointContext=vm.createContext({});
vm.runInContext(`${pointLayoutSource};globalThis.layout=mobilePointLayout;`,pointContext);
const anchor=age=>118+((age-18)/82)*518;
const adjacent=pointContext.layout([anchor(54),anchor(55),anchor(90)]);
const distance=Math.hypot(adjacent[0].center-adjacent[1].center,adjacent[0].kotva-adjacent[1].kotva);
ok(distance>=(adjacent[0].size+adjacent[1].size)/2,'Krúžky vekov 54/55 sa nesmú prekrývať.');
ok(adjacent[2].center===32&&adjacent[2].size===38,'Vzdialený krúžok sa nesmie zmeniť.');
const triple=pointContext.layout([anchor(54),anchor(55),anchor(56)]);
for(let i=1;i<triple.length;i++){
  const d=Math.hypot(triple[i-1].center-triple[i].center,triple[i-1].kotva-triple[i].kotva);
  ok(d>=(triple[i-1].size+triple[i].size)/2,`Tri blízke veky sa prekrývajú na dvojici ${i-1}/${i}.`);
}
const duplicate=pointContext.layout([anchor(54),anchor(54),anchor(90)]);
ok(duplicate.filter(point=>point.visible).length===2,'Zhodný vek má používať jeden spoločný krúžok.');

ok(landing.includes("state.sit==='have'&&state.goal==='rent'&&vypocitana")
  &&landing.includes('?Math.round(vypocitana.Rtoday):state.rent'),
  'Odkaz na výsledok musí niesť dnešnú hodnotu vypočítanej renty.');
ok(landing.includes("S.sit==='have'?'Budem mať '"),'Mobilná sumarizácia musí hovoriť „Budem mať“.');
ok(landing.includes('Renta sa ďalej zvyšuje o ${pctTxt(o.infl)} % ročne.')
  &&landing.includes('calculatedRentNote.hidden=maHotovyMajetokRentu;'),
  'Nominálna prvá výplata má byť úplná a bez duplikácie v druhej karte.');
ok(landing.includes("if(k==='now')S.now=Math.max(18,Math.min(v,S.start,99));")
  &&landing.includes("aria-valuemax',Math.min(99,S.start)")
  &&landing.includes("now:[S.now>18,S.now<Math.min(S.start,99)]"),
  'Dnešný vek musí mať strop 99 vo všetkých interaktívnych cestách.');
ok(landing.includes("if(e.key!=='Enter'||e.isComposing||e.repeat)return;")
  &&landing.includes('if(!sendModel.disabled)sendModel.click();')
  &&landing.includes("sendModel.addEventListener('click',async()=>{\n    if(sendModel.disabled)return;"),
  'Enter musí mať poistku proti dvojitému odoslaniu.');
ok(landing.includes("bits.push(o.rast\n      ?`renta ${fmtEur(o.Rtoday)} / mes. v dnešných cenách`\n      :`renta ${fmtEur(o.Rtoday)} / mes.`)"),
  'CRM zhrnutie bez inflácie nesmie hovoriť o dnešných cenách.');
ok(landing.includes("+'\\u00a0€'")&&result.includes('+"\\u00a0€"'),
  'Formátovanie meny musí držať číslo a euro nezalomiteľnou medzerou.');

console.log('OK frontend semantics: renta, výsledok/PDF, Enter, citlivosť a viewport policy.');
