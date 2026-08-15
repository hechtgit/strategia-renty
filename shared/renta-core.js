export const MONTHS = 12;

export const PUBLIC_HISTORICAL_PROFILE = Object.freeze({
  id: "public-history-v1",
  version: 1,
  runs: 800,
  blockYears: 5,
  seed: 1234,
  seedStride: 7919,
  drawReturnNet: 4,
  thresholds: [600, 720],
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
    out.avail = out.C0 * Math.pow(1 + rateBuild, monthsBuild);
    out.cap = out.avail;
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
  const paid = Math.abs(plan.g) < 1e-12
    ? plan.R * plan.Tm
    : plan.R * (Math.pow(1 + plan.g, plan.Tm) - 1) / plan.g;
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
}) {
  const entries = Object.entries(seriesByAsset);
  if (!entries.length) throw new Error("Chýbajú historické série.");
  const length = entries[0][1].length;
  if (!length || entries.some(([, values]) => values.length !== length)) {
    throw new Error("Historické série musia mať rovnakú neprázdnu dĺžku.");
  }
  if (blockYears < 1 || blockYears > length) throw new Error("Neplatná dĺžka bloku.");
  const starts = length - blockYears + 1;
  const paths = [];
  for (let run = 0; run < runs; run += 1) {
    const random = mulberry32(seed + run * seedStride);
    const path = Object.fromEntries(entries.map(([asset]) => [asset, []]));
    while (path[entries[0][0]].length < years) {
      const start = Math.floor(random() * starts);
      for (let offset = 0; offset < blockYears &&
          path[entries[0][0]].length < years; offset += 1) {
        for (const [asset, values] of entries) path[asset].push(values[start + offset]);
      }
    }
    paths.push(path);
  }
  return paths;
}

function survivesHistoricalPath(path, plan, multiplier, drawReturnNet) {
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
  let payment = plan.R;
  let depletedAt = null;
  for (let month = 0; month < plan.payM; month += 1) {
    const globalMonth = plan.Nm + month;
    const rate = inShock(globalMonth) ? shockRate : plan.i;
    balance = balance * (1 + rate) - payment;
    if (balance <= 0 && depletedAt === null) {
      depletedAt = globalMonth + 1;
      balance = 0;
    } else if (depletedAt === null) {
      payment *= 1 + plan.g;
    }
    path.push(balance);
  }
  return {
    phase: shockStart < plan.Nm ? "accumulation" : "drawdown",
    dropPct: Number(dropPct ?? 0),
    yearsFromNow: Math.round(Number(yearsFromNow ?? 0)),
    capitalAtDraw,
    endingCapital: balance,
    depletedAt,
    path,
  };
}
