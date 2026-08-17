export const MONTHS = 12;

/* Plánovací predpoklad pre fázu čerpania: 4 % ročne po investičných nákladoch,
   pred infláciou. Používa ho historický pohľad aj CMA pohľad — obidva od prvého
   mesiaca renty prepnú na toto číslo, aby sa výnosy nemiešali. Žije tu raz,
   aby sa nedalo posunúť len v jednom z nich. */
export const PLANNING_DRAWDOWN_RETURN = 4;

export const PUBLIC_HISTORICAL_PROFILE = Object.freeze({
  id: "public-history-v1",
  version: 1,
  runs: 800,
  blockYears: 5,
  seed: 1234,
  seedStride: 7919,
  drawReturnNet: PLANNING_DRAWDOWN_RETURN,
  thresholds: [600, 720],
});

export const ADVISER_SIMULATION_PROFILE = Object.freeze({
  id: "adviser-circular-bootstrap-v1",
  version: 1,
  runs: 800,
  blockYears: 5,
  seed: 1234,
  seedStride: 7919,
  circularBlocks: true,
  coverageQuantile: 0.90,
});

export function monthlyInflationRate(pa = 0) {
  return Math.pow(1 + pa / 100, 1 / MONTHS) - 1;
}

export function monthlyNetRate(pa = 0, managementFee = 0) {
  return Math.pow(1 + pa / 100, 1 / MONTHS) *
    (1 - managementFee / (100 * MONTHS)) - 1;
}

export function paymentEnd(capital, rent, months, rate, growth) {
  let balance = capital;
  let payment = rent;
  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + rate) - payment;
    payment *= 1 + growth;
  }
  return balance;
}

export function capitalForRent(rent, months, rate, growth, residual = 0) {
  let high = 1e6;
  while (paymentEnd(high, rent, months, rate, growth) < residual) {
    high *= 2;
    if (high > 1e15) return null;
  }
  let low = 0;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    if (paymentEnd(middle, rent, months, rate, growth) < residual) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function rentFromCapital(capital, months, rate, growth, residual = 0) {
  let low = 0;
  let high = capital;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    if (paymentEnd(capital, middle, months, rate, growth) > residual) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function monthsUntilDepleted(capital, rent, rate, growth, limit = 1200) {
  if (rent <= capital * (rate - growth)) return Infinity;
  let balance = capital;
  let payment = rent;
  let months = 0;
  while (balance > 0 && months < limit) {
    balance = balance * (1 + rate) - payment;
    payment *= 1 + growth;
    months += 1;
  }
  return months;
}
export function accumulationPath(initialNet, monthlyNet, months, annualReturn, managementFee) {
  const rate = monthlyNetRate(annualReturn, managementFee);
  let balance = initialNet;
  const path = [balance];
  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + rate) + monthlyNet;
    path.push(balance);
  }
  return path;
}

export function drawdownPath(capital, rent, months, annualReturn,
  managementFee, inflationRate, residual = 0) {
  const rate = monthlyNetRate(annualReturn, managementFee);
  const growth = monthlyInflationRate(inflationRate);
  let balance = capital;
  let payment = rent;
  let paid = 0;
  const path = [balance];
  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + rate) - payment;
    paid += payment;
    payment *= 1 + growth;
    path.push(balance);
  }
  return { path, end: balance, paid, residual };
}


export function normalizeScenario(input = {}) {
  return {
    nowAge: Number(input.nowAge ?? 50),
    startAge: Number(input.startAge ?? 65),
    endAge: Number(input.endAge ?? 90),
    rentToday: Number(input.rentToday ?? 3000),
    existingCapital: Number(input.existingCapital ?? 600000),
    initialCapital: Number(input.initialCapital ?? 100000),
    situation: input.situation === "have" ? "have" : "build",
    funding: ["lump", "monthly", "combo"].includes(input.funding) ? input.funding : "lump",
    goal: input.goal === "duration" ? "duration" : "rent",
    pension: input.pension === "perpetuity" ? "perpetuity" : "temporary",
    inflationOn: input.inflationOn !== false,
    inflationRate: Number(input.inflationRate ?? 3),
    buildReturn: Number(input.buildReturn ?? 8.3),
    drawReturn: Number(input.drawReturn ?? input.buildReturn ?? 8.3),
    entryFee: Number(input.entryFee ?? 1.5),
    managementFee: Number(input.managementFee ?? 0.9),
    residualCapital: Math.max(0, Number(input.residualCapital ?? 0)),
    serviceMode: input.serviceMode === true,
  };
}

export function computePlan(rawScenario) {
  const s = normalizeScenario(rawScenario);
  const yearsBuild = s.startAge - s.nowAge;
  const monthsBuild = yearsBuild * MONTHS;
  const yearsDraw = s.endAge - s.startAge;
  const monthsDraw = yearsDraw * MONTHS;
  const inflation = s.inflationOn ? s.inflationRate : 0;
  const growth = monthlyInflationRate(inflation);
  const rateBuild = monthlyNetRate(s.buildReturn, s.managementFee);
  const rateDraw = monthlyNetRate(s.drawReturn, s.managementFee);
  const entryFactor = 1 - s.entryFee / 100;
  const initialEntryFactor = s.serviceMode ? 1 : entryFactor;
  const perpetuity = s.pension === "perpetuity" &&
    !(s.situation === "have" && s.goal === "duration");
  const out = {
    scenario: s,
    N: yearsBuild,
    Nm: monthsBuild,
    T: yearsDraw,
    Tm: monthsDraw,
    infl: inflation,
    rast: s.inflationOn && inflation > 0,
    i: rateDraw,
    iA: rateBuild,
    g: growth,
    e: entryFactor,
    eP0: initialEntryFactor,
    nek: perpetuity,
    immediate: yearsBuild === 0,
    warn: null,
  };
  Object.assign(out, {
    rinv: s.buildReturn,
    rrent: s.drawReturn,
    feeIn: s.entryFee,
    feeM: s.managementFee,
    zost: s.residualCapital,
    servis: s.serviceMode,
  });

  if (s.entryFee >= 100) {
    out.warn = "Vstupný poplatok nemôže byť 100 % alebo viac.";
    return out;
  }
  if (perpetuity && rateDraw <= growth) {
    out.warn = inflation > 0
      ? "Inflačný rast renty je rovnaký alebo vyšší ako čisté zhodnotenie."
      : "Čisté zhodnotenie rentového účtu je nulové alebo záporné.";
    return out;
  }

  out.Rtoday = s.rentToday;
  out.R = out.rast
    ? s.rentToday * Math.pow(1 + inflation / 100, yearsBuild)
    : s.rentToday;

  if (s.situation === "build") {
    out.cap = perpetuity
      ? out.R / (rateDraw - growth)
      : capitalForRent(out.R, monthsDraw, rateDraw, growth, s.residualCapital);
    if (out.cap === null) {
      out.warn = "Zadanie vedie k nereálne vysokému potrebnému kapitálu.";
      return out;
    }
    const accumulatedFactor = Math.pow(1 + rateBuild, monthsBuild);
    if (out.immediate) {
      out.P0 = out.cap / initialEntryFactor;
      out.M = 0;
    } else if (s.funding === "lump") {
      out.P0 = out.cap / accumulatedFactor / initialEntryFactor;
      out.M = 0;
    } else if (s.funding === "monthly") {
      const annuity = rateBuild === 0
        ? monthsBuild
        : (Math.pow(1 + rateBuild, monthsBuild) - 1) / rateBuild;
      out.M = out.cap / (annuity * entryFactor);
      out.P0 = 0;
    } else {
      const fromInitial = s.initialCapital * initialEntryFactor * accumulatedFactor;
      const annuity = rateBuild === 0
        ? monthsBuild
        : (Math.pow(1 + rateBuild, monthsBuild) - 1) / rateBuild;
      out.M = Math.max(0, (out.cap - fromInitial) / (annuity * entryFactor));
      out.P0 = s.initialCapital;
      out.covers = fromInitial >= out.cap;
    }
    out.payM = perpetuity ? 360 : monthsDraw;
  } else {
    out.C0 = s.existingCapital;
    out.acc = accumulationPath(out.C0, 0, monthsBuild, s.buildReturn,
      s.managementFee);
    out.avail = out.acc[out.acc.length - 1];
    out.cap = out.avail;
    out.capGross = out.avail;
    out.capNet = out.avail;
    if (s.goal === "rent") {
      out.R = perpetuity
        ? out.avail * (rateDraw - growth)
        : rentFromCapital(out.avail, monthsDraw, rateDraw, growth, s.residualCapital);
      out.payM = perpetuity ? 360 : monthsDraw;
    } else {
      const months = monthsUntilDepleted(out.avail, out.R, rateDraw, growth);
      if (months === Infinity) {
        out.forever = true;
        out.payM = 360;
      } else {
        out.months = months;
        out.payM = Math.min(1200, Math.max(360, months + 120));
      }
    }
  }
  if (s.situation === "build") {
    out.capNet = out.cap;
    out.capGross = out.cap;
    out.acc = accumulationPath(
      (out.P0 || 0) * initialEntryFactor,
      (out.M || 0) * entryFactor,
      monthsBuild,
      s.buildReturn,
      s.managementFee);
    out.startMC = (out.P0 || 0) * initialEntryFactor;
    out.MnetMC = (out.M || 0) * entryFactor;
    out.vlozene = (out.P0 || 0) + (out.M || 0) * monthsBuild;
  } else {
    out.startMC = out.C0;
    out.MnetMC = 0;
    out.vlozene = out.C0;
  }
  out.transferF = 1;
  out.pay = drawdownPath(out.cap, out.R, out.payM, s.drawReturn,
    s.managementFee, inflation, s.residualCapital);
  out.vyplatene = out.pay.paid;
  return out;
}

export function summarizePlan(plan) {
  if (!plan || plan.warn) return null;
  const s = plan.scenario;
  const endless = Boolean(plan.nek || plan.forever);
  let contributions;
  if (s.situation === "have") contributions = s.existingCapital;
  else if (plan.immediate || s.funding === "lump") contributions = plan.P0;
  else if (s.funding === "monthly") contributions = plan.M * plan.Nm;
  else contributions = s.initialCapital + plan.M * plan.Nm;
  if (endless) return { endless: true, contributions, capital: plan.cap };
  /* Pri otázke „ako dlho vydrží" je dĺžka čerpania výsledkom výpočtu, nie
     nastavením jazdca — sčítať sa musia skutočne vyplatené mesiace. Klientske
     jadro to už robí takto; bez tejto opravy by sa obe strany rozišli. */
  const mesiacov = Number.isFinite(plan.months) ? plan.months : plan.Tm;
  const paid = Math.abs(plan.g) < 1e-12
    ? plan.R * mesiacov
    : plan.R * (Math.pow(1 + plan.g, mesiacov) - 1) / plan.g;
  return {
    endless: false,
    contributions,
    paid,
    growthContribution: Math.max(0, paid - contributions),
    months: plan.Tm,
  };
}

export function mulberry32(seed) {
  return function random() {
    let a = seed | 0;
    a = a + 0x6D2B79F5 | 0;
    seed = a;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function blockBootstrapPaths({
  seriesByAsset,
  years,
  runs = 800,
  blockYears = 5,
  seed = 1234,
  seedStride = 7919,
  circular = false,
}) {
  const entries = Object.entries(seriesByAsset);
  if (!entries.length) throw new Error("Chýbajú historické série.");
  const length = entries[0][1].length;
  if (!length || entries.some(([, values]) => values.length !== length)) {
    throw new Error("Historické série musia mať rovnakú neprázdnu dĺžku.");
  }
  if (blockYears < 1 || blockYears > length) throw new Error("Neplatná dĺžka bloku.");
  const starts = circular ? length : length - blockYears + 1;
  const paths = [];
  for (let run = 0; run < runs; run += 1) {
    const random = mulberry32(seed + run * seedStride);
    const path = Object.fromEntries(entries.map(([asset]) => [asset, []]));
    while (path[entries[0][0]].length < years) {
      const start = Math.floor(random() * starts);
      for (let offset = 0; offset < blockYears &&
          path[entries[0][0]].length < years; offset += 1) {
        const index = circular ? (start + offset) % length : start + offset;
        for (const [asset, values] of entries) path[asset].push(values[index]);
      }
    }
    paths.push(path);
  }
  return paths;
}

export function adviserSimulation(plan, {
  accumulationFactors,
  drawdownFactors = accumulationFactors,
  runs = ADVISER_SIMULATION_PROFILE.runs,
  blockYears = ADVISER_SIMULATION_PROFILE.blockYears,
  seed = ADVISER_SIMULATION_PROFILE.seed,
  seedStride = ADVISER_SIMULATION_PROFILE.seedStride,
  circularBlocks = ADVISER_SIMULATION_PROFILE.circularBlocks,
  coverageQuantile = ADVISER_SIMULATION_PROFILE.coverageQuantile,
} = {}) {
  if (!plan || plan.warn) return null;
  if (!Array.isArray(accumulationFactors) || !accumulationFactors.length ||
      !Array.isArray(drawdownFactors) ||
      drawdownFactors.length !== accumulationFactors.length) {
    throw new Error("Poradenská simulácia potrebuje zarovnané historické faktory.");
  }
  const yearsBuild = Math.ceil(plan.Nm / MONTHS);
  const yearsDraw = Math.ceil(plan.payM / MONTHS);
  const years = yearsBuild + yearsDraw;
  const paths = blockBootstrapPaths({
    seriesByAsset: {
      accumulation: accumulationFactors,
      drawdown: drawdownFactors,
    },
    years,
    runs,
    blockYears,
    seed,
    seedStride,
    circular: circularBlocks,
  });
  const total = plan.Nm + plan.payM;
  const byMonth = Array.from({ length: total + 1 }, () => new Float64Array(runs));
  const depletion = new Float64Array(runs);
  const feeMonthly = plan.feeM / 100 / MONTHS;
  for (let run = 0; run < runs; run += 1) {
    const path = paths[run];
    let balance = plan.startMC;
    byMonth[0][run] = balance;
    let month = 0;
    for (let year = 0; year < yearsBuild; year += 1) {
      const factor = Math.pow(path.accumulation[year], 1 / MONTHS) * (1 - feeMonthly);
      for (let within = 0; within < MONTHS && month < plan.Nm; within += 1, month += 1) {
        balance = balance * factor + plan.MnetMC;
        byMonth[month + 1][run] = balance;
      }
    }
    balance *= plan.transferF;
    let payment = plan.R;
    let depletedAt = Infinity;
    let drawMonth = 0;
    for (let year = 0; year < yearsDraw; year += 1) {
      const factor = Math.pow(path.drawdown[yearsBuild + year], 1 / MONTHS) *
        (1 - feeMonthly);
      for (let within = 0; within < MONTHS && drawMonth < plan.payM;
          within += 1, drawMonth += 1) {
        if (depletedAt === Infinity) {
          balance = balance * factor - payment;
          if (balance <= 0) {
            depletedAt = plan.Nm + drawMonth + 1;
            balance = 0;
          } else {
            payment *= 1 + plan.g;
          }
        }
        byMonth[plan.Nm + drawMonth + 1][run] = Math.max(0, balance);
      }
    }
    depletion[run] = depletedAt;
  }
  const percentile = (values, quantile) => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
  };
  const p10 = [];
  const p50 = [];
  const p90 = [];
  for (let index = 0; index <= total; index += 1) {
    p10.push(percentile(byMonth[index], 0.10));
    p50.push(percentile(byMonth[index], 0.50));
    p90.push(percentile(byMonth[index], 0.90));
  }
  const sortedDepletion = Array.from(depletion).sort((a, b) => a - b);
  // coverageCount nie je počet platných behov. Je to počet behov, ktoré musia
  // podľa zvoleného kvantilu vydržať aspoň po hranicu dep10 (90 % = 720/800).
  const lowerTailIndex = Math.round((1 - coverageQuantile) * runs);
  return {
    profileId: ADVISER_SIMULATION_PROFILE.id,
    profileVersion: ADVISER_SIMULATION_PROFILE.version,
    p10,
    p50,
    p90,
    /* Surové mesiace vyčerpania (Infinity = kapitál vydržal celé plánované
       čerpanie). Bez nich sa nedá zostaviť krivka prežitia a UI by muselo
       simuláciu počítať druhýkrát. */
    depletion: Array.from(depletion),
    dep10: sortedDepletion[lowerTailIndex],
    survivalShare: sortedDepletion.filter(value => value === Infinity).length / runs,
    total,
    runs,
    blockYears,
    seed,
    circularBlocks,
    coverageQuantile,
    coverageCount: runs - lowerTailIndex,
  };
}

export function survivesHistoricalPath(path, plan, multiplier, drawReturnNet) {
  const s = plan.scenario;
  const feeMonthly = s.managementFee / 100 / MONTHS;
  const initialFactor = s.serviceMode ? 1 : 1 - s.entryFee / 100;
  const newMoneyFactor = 1 - s.entryFee / 100;
  let balance = s.situation === "have"
    ? s.existingCapital * multiplier
    : (plan.P0 || 0) * multiplier * initialFactor;
  const monthly = s.situation === "have"
    ? 0
    : (plan.M || 0) * multiplier * newMoneyFactor;
  for (const annualReturn of path.accumulation) {
    const factor = Math.pow(1 + annualReturn, 1 / MONTHS) * (1 - feeMonthly);
    for (let month = 0; month < MONTHS; month += 1) balance = balance * factor + monthly;
  }
  let payment = plan.R;
  const drawFactor = Math.pow(1 + drawReturnNet / 100, 1 / MONTHS);
  for (let year = 0; year < Math.ceil(plan.Tm / MONTHS); year += 1) {
    for (let month = 0; month < MONTHS &&
        year * MONTHS + month < plan.Tm; month += 1) {
      balance = balance * drawFactor - payment;
      if (balance <= 0) return false;
      payment *= 1 + plan.g;
    }
  }
  return balance >= s.residualCapital;
}

export function historicalResilience(rawScenario, annualReturns, profile = PUBLIC_HISTORICAL_PROFILE) {
  const plan = computePlan(rawScenario);
  if (plan.warn || plan.nek || plan.forever || plan.scenario.goal === "duration" ||
      !plan.Tm || plan.Tm < MONTHS) return null;
  const yearsBuild = Math.max(0, Math.ceil(plan.Nm / MONTHS));
  const paths = blockBootstrapPaths({
    seriesByAsset: { accumulation: annualReturns },
    years: yearsBuild,
    runs: profile.runs,
    blockYears: profile.blockYears,
    seed: profile.seed,
    seedStride: profile.seedStride,
  });
  const survived = multiplier => paths.reduce((count, path) =>
    count + (survivesHistoricalPath(path, plan, multiplier, profile.drawReturnNet) ? 1 : 0), 0);
  const base = survived(1);
  const levels = profile.thresholds.map(target => {
    if (base >= target) return { target, met: true, multiplier: 1 };
    let low = 1;
    let high = 2;
    while (survived(high) < target) {
      high *= 2;
      if (high > 1e6) return { target, met: false, multiplier: null };
    }
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (low + high) / 2;
      if (survived(middle) >= target) high = middle;
      else low = middle;
    }
    return { target, met: false, multiplier: high };
  });
  const contributions = plan.scenario.situation === "have"
    ? plan.scenario.existingCapital
    : (plan.P0 || 0) + (plan.M || 0) * plan.Nm;
  return {
    profileId: profile.id,
    profileVersion: profile.version,
    runs: profile.runs,
    base,
    contributions,
    levels: levels.map(level => ({
      ...level,
      contribution: level.multiplier === null ? null : contributions * level.multiplier,
    })),
  };
}

export function stressTest(rawScenario, {
  dropPct,
  yearsFromNow,
} = {}) {
  const plan = computePlan(rawScenario);
  if (plan.warn) return null;
  const s = plan.scenario;
  const shockStart = Math.max(0, Math.round(Number(yearsFromNow ?? 0) * MONTHS));
  const shockMonthlyGross = Math.pow(1 - Number(dropPct ?? 0) / 100, 1 / MONTHS) - 1;
  const shockRate = (1 + shockMonthlyGross) *
    (1 - s.managementFee / (100 * MONTHS)) - 1;
  const inShock = month => month >= shockStart && month < shockStart + MONTHS;
  const initialFactor = s.serviceMode ? 1 : 1 - s.entryFee / 100;
  const newMoneyFactor = 1 - s.entryFee / 100;
  let balance = s.situation === "have"
    ? s.existingCapital
    : (plan.P0 || 0) * initialFactor;
  const monthly = s.situation === "have" ? 0 : (plan.M || 0) * newMoneyFactor;
  const path = [balance];
  for (let month = 0; month < plan.Nm; month += 1) {
    balance = balance * (1 + (inShock(month) ? shockRate : plan.iA)) + monthly;
    path.push(balance);
  }
  const capitalAtDraw = balance;
  const runDrawdown = (startCapital, rentFactor = 1, adjustMonth = null) => {
    let current = startCapital;
    let paymentNow = plan.R;
    let depleted = null;
    const values = [];
    for (let month = 0; month < plan.payM; month += 1) {
      const globalMonth = plan.Nm + month;
      const rate = inShock(globalMonth) ? shockRate : plan.i;
      const effectivePayment = adjustMonth !== null && month >= adjustMonth
        ? paymentNow * rentFactor : paymentNow;
      if (depleted === null) {
        current = current * (1 + rate) - effectivePayment;
        if (current <= 0) {
          depleted = month + 1;
          current = 0;
        } else {
          paymentNow *= 1 + plan.g;
        }
      }
      values.push(Math.max(0, current));
    }
    return { path: values, endingCapital: current, depletedAt: depleted };
  };
  let payment = plan.R;
  let depletedAt = null;
  for (let month = 0; month < plan.payM; month += 1) {
    const globalMonth = plan.Nm + month;
    const rate = inShock(globalMonth) ? shockRate : plan.i;
    if (depletedAt === null) {
      balance = balance * (1 + rate) - payment;
      if (balance <= 0) {
        depletedAt = globalMonth + 1;
        balance = 0;
      } else {
        payment *= 1 + plan.g;
      }
    }
    path.push(balance);
  }
  const result = {
    phase: shockStart < plan.Nm ? "accumulation" : "drawdown",
    dropPct: Number(dropPct ?? 0),
    yearsFromNow: Math.round(Number(yearsFromNow ?? 0)),
    capitalAtDraw,
    endingCapital: balance,
    depletedAt,
    path,
  };
  if (result.phase === "accumulation" &&
      !(s.situation === "have" && s.goal === "duration")) {
    result.rentStressed = plan.nek
      ? Math.max(0, capitalAtDraw * (plan.i - plan.g))
      : rentFromCapital(capitalAtDraw, plan.payM, plan.i, plan.g, s.residualCapital);
  }
  if (result.phase === "drawdown") {
    const adjustMonth = Math.max(0, shockStart - plan.Nm);
    if (plan.nek) {
      const endShock = Math.min(plan.payM, adjustMonth + MONTHS);
      let current = capitalAtDraw;
      let currentPayment = plan.R;
      for (let month = 0; month < endShock; month += 1) {
        const globalMonth = plan.Nm + month;
        const rate = inShock(globalMonth) ? shockRate : plan.i;
        current = Math.max(0, current * (1 + rate) - currentPayment);
        currentPayment *= 1 + plan.g;
      }
      const sustainable = Math.max(0, current * (plan.i - plan.g));
      result.cutPct = Math.max(0, 1 - sustainable / currentPayment) * 100;
      result.newRent = sustainable;
    } else if (depletedAt !== null && depletedAt - plan.Nm < plan.payM) {
      const fails = factor => {
        const run = runDrawdown(capitalAtDraw, factor, adjustMonth);
        return run.depletedAt !== null || run.endingCapital < s.residualCapital;
      };
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 40; iteration += 1) {
        const middle = (low + high) / 2;
        if (fails(middle)) high = middle;
        else low = middle;
      }
      result.cutPct = (1 - low) * 100;
      result.newRent = plan.R * low;
    }
  }
  return result;
}

/* ===== CMA pohľad — dlhodobé výhľadové predpoklady =====
   Tretí, metodicky samostatný pohľad vedľa klientskeho plánu a historického testu.
   Platí jediné pravidlo a je vynútené konštrukciou, nie disciplínou volajúceho:
   CMA výnos sa použije výhradne počas budovania majetku a od prvého mesiaca
   čerpania ho vždy nahradí PLANNING_DRAWDOWN_RETURN. Preto sa `drawReturn`
   nastavuje tu a vstupný scenár ho nemá ako prebiť. */
export function cmaPlan(rawScenario, assumptions) {
  if (!assumptions || typeof assumptions !== "object") {
    throw new Error("cmaPlan: chýbajú CMA predpoklady.");
  }
  const accumulation = Number(assumptions.accumulationReturn);
  if (!Number.isFinite(accumulation)) {
    throw new Error("cmaPlan: accumulationReturn nie je číslo.");
  }
  /* Konfigurácia smie výnos pri čerpaní iba potvrdiť, nie zmeniť. Ak by sa
     v nej objavilo iné číslo, je to chyba predpokladov, nie alternatíva. */
  const drawdown = assumptions.drawdownReturn === undefined
    ? PLANNING_DRAWDOWN_RETURN
    : Number(assumptions.drawdownReturn);
  if (drawdown !== PLANNING_DRAWDOWN_RETURN) {
    throw new Error(
      `cmaPlan: vo fáze čerpania sa smie použiť iba ${PLANNING_DRAWDOWN_RETURN} %, dostal som ${drawdown}.`);
  }
  /* Vo výplatnej fáze je plánovacích 4 % TVRDÝ ČISTÝ výnos po nákladoch: cieľom
     portfólia je udržať kúpnu silu, nie zarábať. Poplatky sa preto riešia iba
     v akumulácii. computePlan ale odpočítava správcovský poplatok z oboch fáz,
     tak mu výnos pre čerpanie dopredu navýšime tak, aby po jeho odpočte vyšli
     presne 4 %. Bez toho by sa poplatok zarátal dvakrát (3,07 % namiesto 4 %)
     a potrebný kapitál by vyskočil o stovky tisíc eur. */
  const fee = Number(rawScenario?.managementFee ?? 0.9);
  const netMonthly = Math.pow(1 + drawdown / 100, 1 / MONTHS);
  const grossMonthly = netMonthly / (1 - fee / (100 * MONTHS));
  const drawGross = (Math.pow(grossMonthly, MONTHS) - 1) * 100;
  const plan = computePlan({
    ...rawScenario,
    buildReturn: accumulation,
    drawReturn: drawGross,
  });
  return {
    ...plan,
    cma: Object.freeze({
      version: assumptions.version,
      asOf: assumptions.asOf,
      sourceName: assumptions.sourceName,
      sourceUrl: assumptions.sourceUrl,
      assetClass: assumptions.assetClass,
      currency: assumptions.currency,
      horizonYears: assumptions.horizonYears,
      nominalOrReal: assumptions.nominalOrReal,
      grossOrNet: assumptions.grossOrNet,
      accumulationReturn: accumulation,
      drawdownReturn: drawdown,
    }),
  };
}

/* ===== Krivka prežitia a poctivá úspešnosť =====
   Odpoveď na otázku, kvôli ktorej sa celý nástroj otvára: „vydrží mi renta?"

   Prečo samostatná funkcia a nie priame volanie adviserSimulation: metodika
   žiada, aby sa vo fáze čerpania VŽDY počítalo pevným plánovacím predpokladom.
   Keď si faktory skladá volajúci, dá sa to omylom porušiť — a výsledok potom
   vyzerá dôveryhodne, hoci meria niečo iné. Tu sa faktory pre čerpanie zostavia
   tu a parameter na ne neexistuje. */
export function advisoryOutlook(plan, annualReturns, options = {}) {
  if (!Array.isArray(annualReturns) || !annualReturns.length) {
    throw new Error("advisoryOutlook: chýbajú historické ročné výnosy.");
  }
  const accumulationFactors = annualReturns.map(value => 1 + value);
  /* Rovnako ako v cmaPlan: 4 % je tvrdý ČISTÝ výnos po nákladoch. Simulácia
     ale z faktorov čerpania ešte odpočíta správcovský poplatok, tak ich
     dopredu navýšime, aby po odpočte vyšli presne 4 %. Inak by poradenská
     krivka merala 3,07 % a rozišla by sa s klientskou modeláciou. */
  const fee = Number(plan.feeM ?? 0.9);
  const netMonthly = Math.pow(1 + PLANNING_DRAWDOWN_RETURN / 100, 1 / MONTHS);
  const grossDraw = Math.pow(netMonthly / (1 - fee / (100 * MONTHS)), MONTHS);
  const drawdownFactors = accumulationFactors.map(() => grossDraw);
  /* Predvolene bežíme na parametroch klientskeho historického profilu — vrátane
     nekruhových blokov. Poradca musí vidieť to isté číslo, aké klientovi ukazuje
     modelácia; dve rôzne úspešnosti pre ten istý plán sú na stretnutí neobhájiteľné. */
  const simulation = adviserSimulation(plan, {
    runs: PUBLIC_HISTORICAL_PROFILE.runs,
    blockYears: PUBLIC_HISTORICAL_PROFILE.blockYears,
    seed: PUBLIC_HISTORICAL_PROFILE.seed,
    seedStride: PUBLIC_HISTORICAL_PROFILE.seedStride,
    circularBlocks: false,
    ...options,
    accumulationFactors,
    drawdownFactors,
  });
  return {
    ...simulation,
    survival: survivalCurve(simulation),
    /* Podiel behov, v ktorých kapitál pokryl VŠETKY plánované výplaty.
       Toto je jediné číslo, ktoré sa smie nazvať úspešnosťou. */
    successRate: simulation.survivalShare,
    drawdownReturn: PLANNING_DRAWDOWN_RETURN,
  };
}

/* Podiel behov, ktoré sú v danom mesiaci ešte „nažive". Klesajúca krivka od 1
   po successRate — a na rozdiel od pásma percentilov nezakrýva zlé scenáre,
   lebo každý neúspech sa v nej prejaví ako pokles. */
export function survivalCurve(simulation) {
  const { depletion, runs, total } = simulation;
  if (!Array.isArray(depletion)) {
    throw new Error("survivalCurve: simulácia nevrátila mesiace vyčerpania.");
  }
  const zomrelo = new Array(total + 2).fill(0);
  for (const mesiac of depletion) {
    if (Number.isFinite(mesiac) && mesiac <= total) zomrelo[mesiac] += 1;
  }
  const krivka = [];
  let mrtvych = 0;
  for (let mesiac = 0; mesiac <= total; mesiac += 1) {
    mrtvych += zomrelo[mesiac];
    krivka.push((runs - mrtvych) / runs);
  }
  return krivka;
}
