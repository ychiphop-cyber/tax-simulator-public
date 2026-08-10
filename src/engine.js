'use strict';
/* =====================================================================
   부동산 세금 진단 시뮬레이터 v2.0 — 계산 엔진 (순수 계산, DOM 없음)
   기준: 2026년 현행법(확정) + 2026.8.3 「2026년 세제개편안」(정부안·국회 미확정)
   PRD v2.0 (2026-08-09) 기반. 규칙은 RULES에 버전으로 관리한다.
   ===================================================================== */

const 억 = 1e8, 만 = 1e4;

const RULES = {
  version: 'rules-2026.08.09-r3',
  reviewedAt: '2026-08-09',
  officialRatio: 0.69, // 2026년 공동주택 공시가격 현실화율(참고값) — 시세→공시 추정에만 사용
  policy: {
    current: { code: 'current', label: '현행 확정법', badge: '현행법 · 확정', status: 'enacted' },
    reform:  { code: 'reform',  label: '8·3 정부안',  badge: '정부안 · 국회 심의 전', status: 'draft_proposal' }
  },
  // r2 (2026-08-09) P0 수정 반영:
  //   P0-1 종부세 세액공제 800/600만원 한도 (reform)
  //   P0-2 장특공제 20/10억원 한도 (reform)
  //   P0-3B 재산세 과세표준상한제 5% (현행법)
  //   P0-4 부담부증여 취득세 이중계산 (지방세법 §10의2 ⑥, 현행법)
  //   P0-5 분양권·입주권 양도·취득 주택수 산입 (소득세법 §88 10호·지방세법 §13의3, 현행법)
  //   P0-6 상속·지방저가·인구감소 특례 종부세 1세대1주택 판정 반영 (종부세법 §8 ④, 현행법)
  //   P0-3A' 2027+ 1세대1주택 공정시장가액비율 60% 복귀 가정 (시행령 §109 ①-2 미개정 기본)
  // r3 (2026-08-09) 정부 문답자료(8·3) 추가 반영:
  //   FMV(2028+) 판정에 isOne 인자 도입 — 부부공동명의 개별납부(각자 인별 isOne=false)에서 조정지역 주택이면 80% 적용,
  //   비조정 또는 1세대1주택자(특례 신청 포함)는 70% 유지 (문답자료 p.45)
  sources: [
    '기획재정부 「2026년 세제개편안」 상세본·문답자료 (2026.8.3)',
    '국토교통부 「2026년 공동주택 공시가격 결정·공시」',
    '국세청 증여세 항목별 설명 · 증여재산의 평가',
    '상속세 및 증여세법 제53조, 소득세법 제97조의2 · 제88조 10호',
    '지방세법 §10의2 ⑥ (부담부증여 과세표준) · §13의3 (주택수 산입) · §110 ③·시행령 §109의2 (과표상한 5%)',
    '지방세법·시행령 (취득세·재산세 2026년 현행)',
    '종합부동산세법 §8 ④ (1세대1주택 판정에서 상속·지방저가·일시적 2주택 제외)'
  ]
};

/* ── 공통 유틸 ───────────────────────────────────────────────────── */
// [[상한, 세율, 누진공제], ...]
function progressive(base, table) {
  if (base <= 0) return 0;
  for (const [cap, rate, ded] of table) {
    if (base <= cap) return Math.max(0, base * rate - (ded || 0));
  }
  return 0;
}
// 누진공제 없는 구간 누적 [[상한, 세율], ...]
function bracketed(base, table) {
  if (base <= 0) return 0;
  let tax = 0, prev = 0;
  for (const [cap, rate] of table) {
    const slice = Math.min(base, cap) - prev;
    if (slice > 0) tax += slice * rate;
    prev = cap;
    if (base <= cap) break;
  }
  return tax;
}
function stepRate(v, table) {
  for (const [cap, r] of table) if (v < cap) return r;
  return table[table.length - 1][1];
}

/* 날짜: 'YYYY-MM' 문자열 기준 (월 단위) */
function ym(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})/.exec(String(s));
  if (!m) return null;
  return { y: +m[1], m: +m[2] };
}
function ymVal(o) { return o.y + (o.m - 1) / 12; }
function yearsBetween(a, b) {
  const A = ym(a), B = ym(b);
  if (!A || !B) return null;
  return Math.max(0, ymVal(B) - ymVal(A));
}
function liveYearsOf(periods, atStr) {
  const at = ym(atStr);
  if (!at) return 0;
  let sum = 0;
  for (const p of (periods || [])) {
    const f = ym(p.from);
    if (!f) continue;
    const t = p.to ? ym(p.to) : at;
    const end = Math.min(ymVal(t), ymVal(at)), st = ymVal(f);
    if (end > st) sum += end - st;
  }
  return sum;
}
function liveNowOf(periods) { return (periods || []).some(p => ym(p.from) && !p.to); }

/* 포맷 */
function won(v) {
  v = Math.round(v);
  if (v === 0) return '0원';
  const neg = v < 0; v = Math.abs(v);
  let s;
  if (v >= 억) {
    const e = Math.floor(v / 억), m = Math.round((v % 억) / 만);
    s = m > 0 ? `${e}억 ${m.toLocaleString('ko-KR')}만원` : `${e}억원`;
  } else if (v >= 만) {
    const m = v / 만;
    s = (m >= 100 ? Math.round(m).toLocaleString('ko-KR') : (Math.round(m * 10) / 10).toLocaleString('ko-KR')) + '만원';
  } else s = `${v.toLocaleString('ko-KR')}원`;
  return (neg ? '−' : '') + s;
}
function shortWon(v) {
  v = Math.round(v);
  const neg = v < 0 ? '−' : ''; v = Math.abs(v);
  if (v >= 억) return neg + (v / 억).toFixed(v >= 10 * 억 ? 1 : 2).replace(/\.?0+$/, '') + '억';
  if (v >= 만) return neg + Math.round(v / 만).toLocaleString('ko-KR') + '만';
  return neg + String(v);
}
function eok(v) { // 억 단위 표시
  return (Math.round(v / 억 * 100) / 100).toLocaleString('ko-KR') + '억원';
}

/* ── 주택 가격 접근자 ────────────────────────────────────────────── */
function pubOf(h) { // 공시가격(원) — 시세 입력 시 ×69% 추정
  if (h.priceMode === 'market') return (h.market || 0) * 억 * RULES.officialRatio;
  return (h.official || 0) * 억;
}
function pubEstimated(h) { return h.priceMode === 'market'; }
function marketOf(h) { // 시세(원) — 공시 입력 시 ÷69% 환산(참고)
  if (h.priceMode === 'market') return (h.market || 0) * 억;
  return (h.official || 0) * 억 / RULES.officialRatio;
}
function shareOf(h, key) {
  const s = h.shares || {};
  return Math.max(0, Math.min(100, +s[key] || 0)) / 100;
}
function pubAt(h, year, inp) {
  const g = 1 + (inp.assumptions.officialGrowth || 0) / 100;
  return pubOf(h) * Math.pow(g, year - inp.assumptions.baseYear);
}
function marketAt(h, year, inp) {
  const g = 1 + (inp.assumptions.marketGrowth || 0) / 100;
  return marketOf(h) * Math.pow(g, year - inp.assumptions.baseYear);
}

/* =====================================================================
   1. 재산세 (지방세 — 2026년 현행, 8·3 개편 대상 아님)
   ===================================================================== */
const PROP = {
  fairOne: [[3 * 억, 0.43], [6 * 억, 0.44], [Infinity, 0.45]], // 1세대1주택 공정시장가액비율
  fairOther: 0.60,
  rateStd: [[0.6 * 억, 0.0010, 0], [1.5 * 억, 0.0015, 3 * 만], [3 * 억, 0.0025, 18 * 만], [Infinity, 0.0040, 63 * 만]],
  rateSpec: [[0.6 * 억, 0.0005, 0], [1.5 * 억, 0.0010, 3 * 만], [3 * 억, 0.0020, 18 * 만], [Infinity, 0.0035, 63 * 만]],
  specCap: 9 * 억,
  urban: 0.0014,
  edu: 0.20
};
// P0-3A' (지방세법 시행령 §109 ①-2): 43·44·45% 특례 공정시장가액비율은 매년 한시 개정.
// 2026년까지만 확정, 2027년 이후 시행령 미개정 시 60% 복귀 → 시뮬레이터는 미연장 가정을 기본으로 함.
function fairRateOne(pub, year) {
  if (year && year >= 2027) return PROP.fairOther;  // 60%
  for (const [cap, r] of PROP.fairOne) if (pub <= cap) return r;
  return 0.45;
}
// P0-3B (지방세법 §110 ③ + 시행령 §109의2, 2024 시행): 주택 재산세 과세표준상한제
// 과세표준상한액 = 직전연도 과세표준 + (당해연도 과세표준 − 직전연도) × 5%
function propertyTax(pub, isOneHH, urban = true, prevBase = null, year = null) {
  const fair = isOneHH ? fairRateOne(pub, year) : PROP.fairOther;
  let base = pub * fair;
  const rawBase = base;
  let capped = false;
  if (prevBase != null && prevBase > 0 && base > prevBase) {
    const capBase = prevBase + (base - prevBase) * 0.05;
    if (capBase < base) { base = capBase; capped = true; }
  }
  // 특례세율(공시 9억 이하 1세대1주택)은 지방세법 §111의2에 일몰 없이 상시 규정 → 연도 무관
  const useSpec = isOneHH && pub <= PROP.specCap;
  const main = progressive(base, useSpec ? PROP.rateSpec : PROP.rateStd);
  const city = urban ? base * PROP.urban : 0;
  const edu = main * PROP.edu;
  return { pub, fair, base, rawBase, capped, useSpec, main, city, edu, total: main + city + edu };
}

/* =====================================================================
   2. 종합부동산세 — 납세자별 계산
   ===================================================================== */
const JR_NORMAL = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .010], [25 * 억, .013], [50 * 억, .015], [94 * 억, .020], [Infinity, .027]];
const JR_HEAVY  = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .010], [25 * 억, .020], [50 * 억, .030], [94 * 억, .040], [Infinity, .050]];
const JR_2027   = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .013], [25 * 억, .015], [50 * 억, .020], [94 * 억, .027], [Infinity, .035]];
const JR_2028   = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .013], [25 * 억, .020], [50 * 억, .030], [94 * 억, .040], [Infinity, .050]];

const AGE_CREDIT = [[60, 0], [65, .20], [70, .30], [Infinity, .40]];
const PERIOD_CREDIT = [[5, 0], [10, .20], [15, .40], [Infinity, .50]];      // 보유(현행)/거주(정부안)
const HOLD_CREDIT_HALF = [[5, 0], [10, .10], [15, .20], [Infinity, .25]];   // 2027 보유공제(절반)

function jongParams(year, scen) {
  if (scen === 'current' || year <= 2026) {
    return {
      key: 'current', label: '현행',
      dedOne: () => 12 * 억,
      dedMulti: () => 9 * 억,
      fair: () => 0.60,
      table: n => n >= 3 ? JR_HEAVY : JR_NORMAL,
      creditMode: 'hold', burdenCap: 1.50
    };
  }
  if (year === 2027) {
    return {
      key: 'r2027', label: '정부안 2027',
      dedOne: live => live ? 14 * 억 : 9 * 억,
      dedMulti: ls => 4 * 억 + 5 * 억 * ls,
      fair: () => 0.70,
      // PRD §8 P0: 2027년 3주택 이상은 중과 체계(최고 5%) 유지, 1·2주택만 일원화 중간 단계
      table: n => n >= 3 ? JR_HEAVY : JR_2027,
      creditMode: 'max', burdenCap: 2.00
    };
  }
  return {
    key: 'r2028', label: '정부안 2028~',
    dedOne: live => live ? 14 * 억 : 9 * 억,
    dedMulti: ls => 4 * 억 + 5 * 억 * ls,
    // 정부안 문답자료 p.45: 3주택 이상 또는 조정지역 주택 보유자(단, 1세대1주택자 제외) → 80%,
    // 그 외 (1세대1주택자, 지방 1·2주택) → 70%.
    // 부부공동명의 개별납부는 각자 인별 판정 시 1세대1주택자가 아니므로 조정지역 시 80% 적용.
    fair: (n, hasAdj, isOne) => isOne ? 0.70 : ((n >= 3 || hasAdj) ? 0.80 : 0.70),
    table: () => JR_2028,
    creditMode: 'live', burdenCap: 2.00
  };
}

/**
 * 공제할 재산세액 — 종부세 과세표준 상당분의 재산세를 상단 구간(top-slice)에서 차감.
 * 정부 문답 공식 사례(공시 15억·2028 → 종부세 10.8만원)와 일치하도록 재구현. (PRD §8 P0)
 * aggPBase: 납세자 지분 기준 재산세 과세표준 합계, avgFair: 지분가중 재산세 공정시장가액비율
 */
function jongPropCredit(jongBase, aggPBase, avgFair, propMainPaid, gross) {
  if (jongBase <= 0 || aggPBase <= 0) return 0;
  const slice = Math.min(aggPBase, jongBase * avgFair);
  const c = progressive(aggPBase, PROP.rateStd) - progressive(Math.max(0, aggPBase - slice), PROP.rateStd);
  return Math.max(0, Math.min(c, propMainPaid, gross));
}

/**
 * 납세자 1인의 종부세.
 * o: {year, scen, pubSum, houseCount, hasAdj, isOne, oneLive, liveShare,
 *     age, holdY, liveY, aggPBase, avgFair, propMainPaid, prevTotal}
 */
function jongbuPerson(o) {
  const P = jongParams(o.year, o.scen);
  const d = {
    label: P.label, pubSum: o.pubSum, houseCount: o.houseCount, isOne: !!o.isOne,
    deduct: 0, threshold: 0, fair: 0, base: 0, gross: 0, propCredit: 0,
    creditRate: 0, credit: 0, beforeCap: 0, capped: 0, tax: 0, rural: 0, total: 0
  };
  if (o.pubSum <= 0) return d;
  const ded = o.isOne ? P.dedOne(!!o.oneLive) : P.dedMulti(Math.max(0, Math.min(1, o.liveShare || 0)));
  d.deduct = ded; d.threshold = ded;
  if (o.pubSum <= ded) return d;

  const fair = P.fair(o.houseCount, !!o.hasAdj, !!o.isOne);
  d.fair = fair;
  const base = (o.pubSum - ded) * fair;
  d.base = base;

  const gross = bracketed(base, P.table(o.houseCount));
  d.gross = gross;

  d.propCredit = jongPropCredit(base, o.aggPBase, o.avgFair, o.propMainPaid, gross);
  let tax = gross - d.propCredit;

  if (o.isOne) {
    const ageR = stepRate(o.age || 0, AGE_CREDIT);
    let pr = 0;
    if (P.creditMode === 'hold') pr = stepRate(o.holdY || 0, PERIOD_CREDIT);
    else if (P.creditMode === 'live') pr = stepRate(o.liveY || 0, PERIOD_CREDIT);
    else pr = Math.max(stepRate(o.holdY || 0, HOLD_CREDIT_HALF), stepRate(o.liveY || 0, PERIOD_CREDIT));
    const rate = Math.min(0.80, ageR + pr);
    d.creditRate = rate;
    let credit = tax * rate;
    // P0-1 (2026.8.3 정부안 개정안): 종부세 세액공제 절대금액 한도 신설
    //   2027년: 800만원, 2028년 이후: 600만원 (합산 세액공제액 상한)
    //   ※ 국회 심의 전 정부안, reform 시나리오에만 적용
    if (o.scen === 'reform' && o.year >= 2027) {
      const cap = o.year === 2027 ? 800 * 만 : 600 * 만;
      if (credit > cap) {
        d.creditCap = cap;
        d.creditRaw = credit;
        credit = cap;
      }
    }
    d.credit = credit;
    tax -= d.credit;
  }
  d.beforeCap = tax;

  if (o.prevTotal > 0) {
    const limit = o.prevTotal * P.burdenCap;
    const now = o.propMainPaid + tax;
    if (now > limit) {
      d.capped = now - limit;
      tax = Math.max(0, limit - o.propMainPaid);
    }
  }
  d.tax = Math.max(0, tax);
  d.rural = d.tax * 0.20;
  d.total = d.tax + d.rural;
  d.burdenBase = o.propMainPaid + d.tax; // 다음 해 세부담상한 기산
  return d;
}

/* ── 세대·납세자 구성 ────────────────────────────────────────────── */
function activeHouses(inp, opt = {}) {
  return inp.houses.filter(h => h.id !== opt.excludeId);
}
// P0-5 (소득세법 §88 10호·지방세법 §13의3): 분양권/입주권도 양도·취득 주택수 산입
// P0-6 (종부세법 §8④): 1세대1주택 특례 판정 시 상속·지방저가·인구감소는 주택수에서 제외
//                       (등록임대는 요건 복잡 → 자동화 대신 옵션+경고로 유지)
// 일시적 2주택: 2주택 + temp2 플래그 → 1주택 지위 유지(처분기한 내 가정)
function specialExcludedCount(houses) {
  return houses.filter(h => h.flags && (h.flags.inherit || h.flags.lowLocal || h.flags.popDecline)).length;
}
function oneStatusOf(houses, rightsCount = 0) {
  const excl = specialExcludedCount(houses);       // 특례 제외 대상 실주택 수
  const netHouses = houses.length - excl;           // 실질 주택수
  const netTotal = netHouses + rightsCount;         // 실질 + 권리
  if (netTotal === 1 && netHouses === 1) return { one: true, temp2: false, effCount: houses.length + rightsCount, excluded: excl };
  if (netTotal === 2 && netHouses === 2 && houses.some(h => h.flags && h.flags.temp2))
    return { one: true, temp2: true, effCount: houses.length + rightsCount, excluded: excl };
  return { one: false, temp2: false, effCount: houses.length + rightsCount, excluded: excl };
}
function rightsCountOf(inp) {
  const r = inp && inp.rights ? inp.rights : {};
  return (r.presale ? 1 : 0) + (r.occupancy ? 1 : 0);
}
function mainHouseOf(houses) { // 거주 중인 주택 우선, 없으면 첫 번째
  return houses.find(h => liveNowOf(h.livePeriods)) || houses[0];
}
function adjYes(v) { return v === 'yes' || v === 'unknown'; } // 미확인은 보수적으로 예 취급(플래그 별도)

/**
 * 특정 연도 보유세(재산세 + 종부세) — 납세자별.
 * prevMap: 세부담상한 연쇄용 { key: burdenBase }
 */
function holdCalcYear(inp, scen, year, prevMap, opt = {}) {
  const houses = activeHouses(inp, opt);
  const isOnePT = houses.length === 1; // 재산세 1세대1주택 특례는 엄격히 1주택만
  const stat = oneStatusOf(houses);
  const urban = inp.assumptions.urban !== false;

  const rows = houses.map(h => {
    const pub = pubAt(h, year, inp);
    // P0-3B: house.id별 직전연도 과세표준 체이닝 (prevMap에 저장)
    const pbKey = `pb|${scen}|${h.id}`;
    const prevBase = prevMap ? prevMap[pbKey] : null;
    const pt = propertyTax(pub, isOnePT, urban, prevBase, year);
    if (prevMap) prevMap[pbKey] = pt.base;
    return { h, pub, pt };
  });
  const prop = {
    rows,
    main: rows.reduce((s, r) => s + r.pt.main, 0),
    total: rows.reduce((s, r) => s + r.pt.total, 0)
  };

  const asOf = `${year}-06`; // 과세기준일 6월 1일
  const people = inp.people || {};
  const tps = [];
  for (const key of ['me', 'spouse']) {
    const ent = rows.filter(r => shareOf(r.h, key) > 0)
      .map(r => ({
        h: r.h, share: shareOf(r.h, key),
        pubShare: r.pub * shareOf(r.h, key),
        fair: r.pt.fair, mainShare: r.pt.main * shareOf(r.h, key),
        liveNow: liveNowOf(r.h.livePeriods),
        adj: adjYes(r.h.adjNow)
      }));
    if (!ent.length) continue;
    const pubSum = ent.reduce((s, e) => s + e.pubShare, 0);
    const aggPBase = ent.reduce((s, e) => s + e.pubShare * e.fair, 0);
    const person = people[key] || {};
    tps.push({
      key,
      entries: ent,
      pubSum,
      houseCount: ent.length,
      hasAdj: ent.some(e => e.adj),
      aggPBase,
      avgFair: pubSum > 0 ? aggPBase / pubSum : PROP.fairOther,
      propMainPaid: ent.reduce((s, e) => s + e.mainShare, 0),
      liveShare: pubSum > 0 ? ent.filter(e => e.liveNow).reduce((s, e) => s + e.pubShare, 0) / pubSum : 0,
      age: (person.age || 0) + (year - inp.assumptions.baseYear),
      soleOne: stat.one && ent.length === houses.length && ent.every(e => e.share >= 0.999)
    });
  }

  const mainH = mainHouseOf(houses);
  const holdY = mainH && mainH.acqDate ? (yearsBetween(mainH.acqDate, asOf) || 0) : 0;
  const liveY = mainH ? liveYearsOf(mainH.livePeriods, asOf) : 0;
  const oneLive = mainH ? liveNowOf(mainH.livePeriods) : false;

  const jong = { mode: 'per-taxpayer', persons: [], total: 0, joint: null, oneStatus: stat };
  const jointOne = stat.one && houses.length >= 1 && tps.length === 2 &&
    tps.every(t => t.houseCount === houses.length);

  const pk = k => `${scen}|${year}|${k}`;
  const prevOf = k => (prevMap && prevMap[k] !== undefined) ? prevMap[k] : 0;
  const setPrev = (k, v) => { if (prevMap) prevMap[k] = v; };

  if (jointOne) {
    // A) 부부 개별 납부 — 각자 다주택(지분) 공제
    const indiv = tps.map(t => {
      const r = jongbuPerson({
        year, scen, pubSum: t.pubSum, houseCount: t.houseCount, hasAdj: t.hasAdj,
        isOne: false, oneLive: false, liveShare: t.liveShare,
        age: t.age, holdY, liveY,
        aggPBase: t.aggPBase, avgFair: t.avgFair, propMainPaid: t.propMainPaid,
        prevTotal: prevOf(`indiv|${t.key}`)
      });
      setPrev(`indiv|${t.key}`, r.burdenBase || t.propMainPaid);
      return { key: t.key, r };
    });
    const indivTotal = indiv.reduce((s, x) => s + x.r.total, 0);

    // B) 1세대 1주택 특례 — 지분 큰 자(동률이면 본인)가 전체 합산 납부
    const rep = tps.reduce((a, b) => (b.pubSum > a.pubSum ? b : a), tps[0]);
    const pubAll = rows.reduce((s, r) => s + r.pub, 0);
    const aggAll = rows.reduce((s, r) => s + r.pub * r.pt.fair, 0);
    const special = jongbuPerson({
      year, scen, pubSum: pubAll, houseCount: houses.length, hasAdj: rows.some(r => adjYes(r.h.adjNow)),
      isOne: true, oneLive, liveShare: oneLive ? 1 : 0,
      age: rep.age, holdY, liveY,
      aggPBase: aggAll, avgFair: pubAll > 0 ? aggAll / pubAll : PROP.fairOther,
      propMainPaid: prop.main,
      prevTotal: prevOf('special')
    });
    setPrev('special', special.burdenBase || prop.main);

    const best = indivTotal <= special.total ? 'indiv' : 'special';
    jong.mode = 'joint-compare';
    jong.joint = { indiv, indivTotal, special, best, repKey: rep.key };
    jong.total = Math.min(indivTotal, special.total);
    jong.persons = indiv.map(x => x.r);
  } else {
    for (const t of tps) {
      const isOneTp = stat.one && t.soleOne;
      const r = jongbuPerson({
        year, scen, pubSum: t.pubSum, houseCount: t.houseCount, hasAdj: t.hasAdj,
        isOne: isOneTp, oneLive: isOneTp ? oneLive : false, liveShare: t.liveShare,
        age: t.age, holdY, liveY,
        aggPBase: t.aggPBase, avgFair: t.avgFair, propMainPaid: t.propMainPaid,
        prevTotal: prevOf(`p|${t.key}`)
      });
      setPrev(`p|${t.key}`, r.burdenBase || t.propMainPaid);
      r.taxpayer = t.key;
      jong.persons.push(r);
      jong.total += r.total;
    }
  }

  return { year, scen, prop, jong, holdTax: prop.total + jong.total, holdY, liveY };
}

/** 연도별 보유세 시뮬레이션 (2025 프라임 → baseYear..baseYear+4) */
function holdSim(inp, scen, opt = {}) {
  const y0 = inp.assumptions.baseYear;
  const prevMap = {};
  // 2025년(직전연도)으로 세부담상한 기산 — 현행 규정
  {
    const seedInp = JSON.parse(JSON.stringify(inp));
    const g = 1 + (inp.assumptions.officialGrowth || 0) / 100;
    seedInp.houses.forEach(h => {
      if (h.priceMode === 'market') h.market = (h.market || 0) / g;
      else h.official = (h.official || 0) / g;
    });
    seedInp.assumptions.baseYear = y0 - 1;
    const seedPrev = {};
    const r = holdCalcYear(seedInp, 'current', y0 - 1, seedPrev, opt);
    // seedPrev 키를 본 시뮬레이션 키로 이관
    for (const k in seedPrev) prevMap[k] = seedPrev[k];
  }
  const rows = [];
  for (let y = y0; y <= y0 + 4; y++) rows.push(holdCalcYear(inp, scen, y, prevMap, opt));
  return rows;
}

/* =====================================================================
   3. 양도소득세 — 소유자(지분)별
   ===================================================================== */
const INCOME_RATES = [
  [1400 * 만, 0.06, 0], [5000 * 만, 0.15, 126 * 만], [8800 * 만, 0.24, 576 * 만],
  [1.5 * 억, 0.35, 1544 * 만], [3 * 억, 0.38, 1994 * 만], [5 * 억, 0.40, 2594 * 만],
  [10 * 억, 0.42, 3594 * 만], [Infinity, 0.45, 6594 * 만]
];

function yangdoParams(year, scen) {
  if (scen === 'current' || year <= 2026) return {
    label: '현행',
    one: { live: .04, liveMax: .40, hold: .04, holdMax: .40 },
    gen: { mode: 'hold', hold: .02, holdMax: .30, live: 0, liveMax: 0 },
    basicDed: 250 * 만, bigDed: null,
    sur: { 2: .20, 3: .30 }, senior: null
  };
  if (year === 2027) return {
    label: '정부안 2027',
    one: { live: .04, liveMax: .40, hold: .04, holdMax: .40 },
    gen: { mode: 'hold', hold: .02, holdMax: .30, live: 0, liveMax: 0 },
    basicDed: 250 * 만, bigDed: 2500 * 만,
    sur: { 2: .05, 3: .10 }, senior: { rate: .50, cap: 5 * 억 }
  };
  if (year === 2028) return {
    label: '정부안 2028',
    one: { live: .06, liveMax: .60, hold: .02, holdMax: .20 },
    // PRD §8 P0: 다주택 — 보유 연1% 최대 15% vs 거주 연2% 최대 30% 중 큰 금액
    gen: { mode: 'max', hold: .01, holdMax: .15, live: .02, liveMax: .30 },
    basicDed: 250 * 만, bigDed: 2500 * 만,
    sur: { 2: .10, 3: .15 }, senior: { rate: .30, cap: 3 * 억 }
  };
  return {
    label: '정부안 2029~',
    one: { live: .08, liveMax: .80, hold: 0, holdMax: 0 },
    gen: { mode: 'live', live: .02, liveMax: .30, minLive: 2, hold: 0, holdMax: 0 },
    basicDed: 250 * 만, bigDed: 2500 * 만,
    sur: { 2: .20, 3: .30 }, senior: null
  };
}

/**
 * 양도세 코어 — 매도·부담부증여 공용.
 * o: {year, scen, sale, acq, cost, holdY, liveY, isOne, needLive, heavyCount(0|2|3),
 *     fullPrice(고가주택 판정 기준가, 기본 sale), owners:[{key, share, age, senior}],
 *     sameYearOther, seniorMove}
 */
function yangdoCore(o) {
  const P = yangdoParams(o.year, o.scen);
  const d = {
    label: P.label, gain: 0, exempt: false, taxRatio: 1, ltcgRate: 0,
    owners: [], tax: 0, local: 0, total: 0, notes: []
  };
  const gain = o.sale - o.acq - o.cost;
  d.gain = gain;
  if (gain <= 0) { d.notes.push('양도차익이 없어 세액이 없습니다.'); return d; }

  const full = o.fullPrice || o.sale;
  const exempt = !!o.isOne && (o.holdY || 0) >= 2 && (!o.needLive || (o.liveY || 0) >= 2);
  d.exempt = exempt;
  if (o.isOne && (o.holdY || 0) >= 2 && o.needLive && (o.liveY || 0) < 2) {
    d.notes.push('취득 당시 조정대상지역 — 거주 2년 미충족으로 1세대 1주택 비과세가 적용되지 않았습니다.');
  }
  if (exempt && full <= 12 * 억) {
    d.taxRatio = 0;
    d.notes.push('1세대 1주택 · 양도가액 12억원 이하 — 전액 비과세');
    return d;
  }
  const ratio = exempt ? (full - 12 * 억) / full : 1;
  d.taxRatio = ratio;
  if (exempt) d.notes.push('1세대 1주택 — 12억원 초과분만 과세');

  const shortTerm = (o.holdY || 0) < 2;
  const heavy = !shortTerm && !o.isOne && (o.heavyCount || 0) >= 2;

  // 장기보유특별공제
  let rate = 0;
  const hY = Math.floor(o.holdY || 0), lY = Math.floor(o.liveY || 0);
  if (shortTerm) {
    // 단기 — 장특 없음
  } else if (heavy) {
    d.notes.push('조정대상지역 다주택 중과 — 장기보유특별공제 배제');
  } else if (exempt && lY >= 2 && hY >= 3) {
    const t = P.one;
    rate = Math.min(0.80, Math.min(t.liveMax, t.live * lY) + Math.min(t.holdMax, t.hold * hY));
  } else if (hY >= 3) {
    const t = P.gen;
    if (t.mode === 'hold') rate = Math.min(t.holdMax, t.hold * hY);
    else if (t.mode === 'max') rate = Math.max(Math.min(t.holdMax, t.hold * hY), Math.min(t.liveMax, t.live * lY));
    else rate = (lY >= (t.minLive || 0)) ? Math.min(t.liveMax, t.live * lY) : 0;
  }
  d.ltcgRate = rate;

  const surRate = heavy ? ((o.heavyCount >= 3) ? P.sur[3] : P.sur[2]) : 0;
  d.surcharge = surRate;
  if (heavy) d.notes.push(`조정대상지역 다주택 중과 +${Math.round(surRate * 100)}%p (${P.label})`);

  // P0-2 (2026.8.3 정부안 개정안): 장기보유특별공제 절대금액 한도
  //   2028년 양도분 20억원, 2029년 이후 양도분 10억원 (2027년까지는 현행 유지)
  //   ※ 인별 연간 + 양도물건별 한도. 공동소유 시 지분비율로 안분.
  //   ※ 국회 심의 전 정부안, reform 시나리오에만 적용
  const ltcgCap = (o.scen === 'reform')
    ? (o.year >= 2029 ? 10 * 억 : (o.year === 2028 ? 20 * 억 : Infinity))
    : Infinity;
  for (const ow of o.owners) {
    const g = gain * ow.share;
    const taxable = g * ratio;
    let ltcg = taxable * rate;
    const ltcgCapOw = ltcgCap === Infinity ? Infinity : ltcgCap * ow.share;
    let ltcgCapped = false;
    if (ltcg > ltcgCapOw) { ltcg = ltcgCapOw; ltcgCapped = true; }
    let bd = o.sameYearOther ? 0 : P.basicDed;
    if (!o.sameYearOther && P.bigDed && o.isOne && (o.liveY || 0) >= 10 && full <= 30 * 억) {
      bd = P.bigDed;
      if (!d.notes.includes('장기거주 1주택 기본공제 2,500만원 적용')) d.notes.push('장기거주 1주택 기본공제 2,500만원 적용');
    }
    const base = Math.max(0, taxable - ltcg - bd);
    let gross = 0, mRate = 0;
    if (base > 0) {
      if ((o.holdY || 0) < 1) { mRate = 0.70; gross = base * 0.70; }
      else if ((o.holdY || 0) < 2) { mRate = 0.60; gross = base * 0.60; }
      else {
        for (const [cap, r, ded] of INCOME_RATES) {
          if (base <= cap) { mRate = r + surRate; gross = Math.max(0, base * (r + surRate) - ded); break; }
        }
      }
    }
    let senior = 0;
    if (o.seniorMove && o.isOne && P.senior && (ow.age || 0) >= 65) {
      senior = Math.min(gross * P.senior.rate, P.senior.cap);
    }
    const tax = Math.max(0, gross - senior);
    d.owners.push({ key: ow.key, share: ow.share, taxable, ltcg, ltcgCapped, ltcgCap: ltcgCap === Infinity ? null : ltcgCapOw, basicDed: base > 0 ? bd : Math.min(bd, taxable - ltcg), base, rate: mRate, gross, senior, tax, local: tax * 0.10, total: tax * 1.10 });
    if (ltcgCapped && !d.notes.some(n => n.includes('장특공제 한도'))) {
      d.notes.push(`정부안 장특공제 한도 적용 (${P.label}) — ${o.year >= 2029 ? '10억원' : '20억원'} 안분 후 초과분 배제`);
    }
    d.tax += tax;
  }
  if ((o.holdY || 0) < 1) d.notes.push('보유 1년 미만 — 단기세율 70%');
  else if ((o.holdY || 0) < 2) d.notes.push('보유 1~2년 — 단기세율 60%');
  if (o.sameYearOther) d.notes.push('같은 해 다른 양도 있음 — 기본공제(250만원)는 인별 연 1회만 적용되어 이번 계산에서 제외');
  d.local = d.tax * 0.10;
  d.total = d.tax + d.local;
  return d;
}

/** 매도 시뮬레이션 — 연도별(양도일의 월 고정) */
function sellSim(inp, scen) {
  const s = inp.sell || {};
  const h = inp.houses.find(x => x.id === s.houseId) || inp.houses[0];
  if (!h) return null;
  const y0 = inp.assumptions.baseYear;
  const saleM = (ym(s.date) ? ym(s.date).m : 6);
  const before61 = saleM < 6;

  const holdRows = holdSim(inp, scen);
  const holdRowsEx = holdSim(inp, scen, { excludeId: h.id });

  const rows = [];
  let cum = 0;
  for (let i = 0; i < holdRows.length; i++) {
    const Y = y0 + i;
    const saleYM = `${Y}-${String(saleM).padStart(2, '0')}`;
    const holdThis = before61 ? (holdRows[i].holdTax - (function () {
      // 6월 1일 전 매도 시 그 해 매도주택 보유세 제외 (전체 재계산으로 근사)
      return holdRows[i].holdTax - holdRowsEx[i].holdTax;
    })()) : holdRows[i].holdTax;

    const others = activeHouses(inp);
    const rc = rightsCountOf(inp);   // P0-5: 매도 시점의 잔여 주택 수 + 권리
    const stat = oneStatusOf(others, rc);
    const needLive = adjYes(h.adjAcq) && (!h.acqDate || h.acqDate >= '2017-08');
    const heavyAdj = adjYes(h.adjSale);
    const owners = [];
    for (const key of ['me', 'spouse']) {
      const sh = shareOf(h, key);
      if (sh > 0) owners.push({ key, share: sh, age: ((inp.people || {})[key] || {}).age + (Y - y0) || 0 });
    }
    const otherSh = shareOf(h, 'other');
    if (otherSh > 0) owners.push({ key: 'other', share: otherSh, age: 0 });

    const holdY = h.acqDate ? (yearsBetween(h.acqDate, saleYM) || 0) : 0;
    const liveY = liveYearsOf(h.livePeriods, saleYM);
    const salePrice = (s.price || 0) * 억 * Math.pow(1 + (inp.assumptions.marketGrowth || 0) / 100, Y - y0);

    const yd = yangdoCore({
      year: Y, scen,
      sale: salePrice, acq: (h.acqPrice || 0) * 억, cost: (s.cost || 0) * 만,
      holdY, liveY,
      isOne: stat.one, needLive,
      heavyCount: (!stat.one && heavyAdj) ? Math.min(3, others.length + rc) : 0,
      fullPrice: salePrice,
      owners,
      sameYearOther: !!s.sameYearOther,
      seniorMove: !!s.seniorMove
    });

    cum += holdThis;
    rows.push({
      year: Y, hold: holdThis, cum, yangdo: yd, yangdoTotal: yd.total,
      grand: cum + yd.total, salePrice, holdY, liveY, before61
    });
  }
  return { house: h, rows, before61, saleMonth: saleM };
}

/* =====================================================================
   4. 취득세 (2026년 현행 지방세)
   ===================================================================== */
function acqBaseRate(price) {
  if (price <= 6 * 억) return 0.01;
  if (price <= 9 * 억) {
    const pct = (price / 억) * 2 / 3 - 3;
    return Math.round(pct * 1e5) / 1e5 / 100;
  }
  return 0.03;
}
function acquisitionTax(o) {
  const eff = o.temp2 ? 1 : o.housesAfter;
  let rate, heavy = 0;
  if (eff <= 1) rate = acqBaseRate(o.price);
  else if (o.adj) { rate = eff === 2 ? 0.08 : 0.12; heavy = rate; }
  else if (eff === 2) rate = acqBaseRate(o.price);
  else { rate = eff === 3 ? 0.08 : 0.12; heavy = rate; }

  let main = o.price * rate;
  let firstCut = 0;
  if (o.firstHome && eff <= 1 && o.price <= 12 * 억) {
    firstCut = Math.min(main, 200 * 만);
    main -= firstCut;
  }
  const eduRate = heavy ? 0.004 : rate * 0.10;
  const edu = o.price * eduRate;
  let ruralRate = 0;
  if (o.big85) ruralRate = heavy === 0.12 ? 0.010 : (heavy === 0.08 ? 0.006 : 0.002);
  const rural = o.price * ruralRate;
  return { rate, heavy, main, firstCut, edu, rural, total: main + edu + rural };
}
/** 증여 취득세 — 무상취득 3.5%, 조정지역·공시 3억 이상 12% 중과(1세대1주택자→배우자·직계 제외) */
function giftAcquisitionTax(o) {
  // o: {base(시가인정액), officialFull, adj, big85, giverIsOne, toLineal}
  const heavy = o.adj && o.officialFull >= 3 * 억 && !(o.giverIsOne && o.toLineal);
  const rate = heavy ? 0.12 : 0.035;
  const main = o.base * rate;
  const edu = o.base * (heavy ? 0.004 : 0.003);
  const rural = o.big85 ? o.base * (heavy ? 0.010 : 0.002) : 0;
  return { rate, heavy, main, edu, rural, total: main + edu + rural };
}

/* =====================================================================
   5. 증여세 — 일반 / 배우자 지분 / 부담부
   ===================================================================== */
const GIFT_RATES = [[1 * 억, .10, 0], [5 * 억, .20, 1000 * 만], [10 * 억, .30, 6000 * 만], [30 * 억, .40, 1.6 * 억], [Infinity, .50, 4.6 * 억]];
const GIFT_DED = { spouse: 6 * 억, child: 5000 * 만, minor: 2000 * 만, parent: 5000 * 만, other: 1000 * 만 };
const GIFT_REL_LABEL = { spouse: '배우자', child: '직계비속(성년)', minor: '직계비속(미성년)', parent: '직계존속', other: '기타 친족' };

function giftTaxCalc(o) {
  // o: {value(시가×지분), debt, relation, prior10y}
  const ded = GIFT_DED[o.relation] !== undefined ? GIFT_DED[o.relation] : GIFT_DED.other;
  const taxableGift = Math.max(0, o.value - (o.debt || 0));
  const prior = Math.max(0, o.prior10y || 0);
  const baseNow = Math.max(0, taxableGift + prior - ded);
  const basePrior = Math.max(0, prior - ded);
  const gross = progressive(baseNow, GIFT_RATES) - progressive(basePrior, GIFT_RATES);
  const reportCredit = gross * 0.03;
  const tax = Math.max(0, gross - reportCredit);
  return { value: o.value, debt: o.debt || 0, taxableGift, deduct: ded, prior, baseNow, gross, reportCredit, tax, relation: o.relation };
}

/** 증여 종합 — 증여세 + 취득세 + (부담부) 증여자 양도세 */
function giftFull(inp) {
  const g = inp.gift || {};
  const h = inp.houses.find(x => x.id === g.houseId) || inp.houses[0];
  if (!h) return null;
  const y0 = inp.assumptions.baseYear;
  const giftYM = g.date || `${y0}-09`;
  const giftYear = ym(giftYM) ? ym(giftYM).y : y0;
  const share = Math.max(0, Math.min(100, g.share || 0)) / 100;
  const fullValue = (g.value ? g.value * 억 : marketOf(h));
  const value = fullValue * share;
  const debt = (g.type === 'burden' ? (g.debt || 0) * 억 : 0);
  const relation = g.type === 'spouse_share' ? 'spouse' : (g.relation || 'child');

  const gt = giftTaxCalc({ value, debt, relation, prior10y: (g.prior || 0) * 억 });

  const houses = activeHouses(inp);
  const rc = rightsCountOf(inp);
  const stat = oneStatusOf(houses, rc);
  const toLineal = relation !== 'other';
  // P0-4 (지방세법 §10의2 ⑥): 부담부증여 무상분 base = 시가인정액 − 채무부담액
  const freeBase = Math.max(0, value - debt);
  const at = giftAcquisitionTax({
    base: freeBase, officialFull: pubOf(h), adj: adjYes(h.adjNow),
    big85: !!h.area85, giverIsOne: stat.one, toLineal
  });
  // 부담부 유상부분 취득세(수증자) — 표준세율 가정
  let atOnerous = null;
  if (debt > 0) {
    const r = acqBaseRate(debt);
    atOnerous = { rate: r, main: debt * r, edu: debt * r * 0.10, rural: h.area85 ? debt * 0.002 : 0 };
    atOnerous.total = atOnerous.main + atOnerous.edu + atOnerous.rural;
  }

  // 부담부 — 채무 인수분은 증여자의 유상 양도
  let giverYangdo = null;
  if (debt > 0 && value > 0) {
    const acqPortion = (h.acqPrice || 0) * 억 * share * (debt / value);
    const holdY = h.acqDate ? (yearsBetween(h.acqDate, giftYM) || 0) : 0;
    const liveY = liveYearsOf(h.livePeriods, giftYM);
    const needLive = adjYes(h.adjAcq) && (!h.acqDate || h.acqDate >= '2017-08');
    giverYangdo = yangdoCore({
      year: giftYear, scen: 'current',
      sale: debt, acq: acqPortion, cost: 0,
      holdY, liveY,
      isOne: stat.one, needLive,
      heavyCount: (!stat.one && adjYes(h.adjNow)) ? Math.min(3, houses.length + rc) : 0,
      fullPrice: fullValue,
      owners: [{ key: 'giver', share: 1, age: ((inp.people || {}).me || {}).age || 0 }],
      sameYearOther: false, seniorMove: false
    });
  }

  const total = gt.tax + at.total + (atOnerous ? atOnerous.total : 0) + (giverYangdo ? giverYangdo.total : 0);
  const warnings = [];
  if (relation === 'spouse' || relation === 'child' || relation === 'minor' || relation === 'parent') {
    warnings.push(`이월과세 — 배우자·직계존비속이 증여받은 부동산을 10년 이내(${giftYear + 10}년 이전) 양도하면 취득가액을 증여자의 당초 취득가액으로 계산합니다. 증여로 취득가를 올려 양도세를 줄이는 효과가 사라질 수 있습니다.`);
  }
  if (at.heavy) warnings.push('조정대상지역 공시가격 3억원 이상 주택의 증여 취득세는 12% 중과세율이 적용되었습니다.');
  if (debt > value) warnings.push('인수 채무가 증여가액보다 큽니다 — 사실관계 확인이 필요합니다.');
  warnings.push('증여세 신고·납부 기한은 증여일이 속한 달의 말일부터 3개월, 취득세는 취득일이 속한 달의 말일부터 3개월입니다.');
  warnings.push('증여재산 평가는 시가(매매사례가액·감정가액 등)가 원칙입니다. 아파트는 유사 매매사례가액이 우선 적용되므로 공시가격 기준 신고는 부인될 수 있습니다.');

  return { house: h, share, fullValue, value, debt, type: g.type || 'general', relation, giftYM, gt, at, atOnerous, giverYangdo, total, warnings };
}

/* =====================================================================
   6. 공동명의 전환 분석 (단독 → 부부 공동)
   ===================================================================== */
function jointConvertAnalysis(inp) {
  const j = inp.joint || {};
  const h = inp.houses.find(x => x.id === j.houseId) || inp.houses[0];
  if (!h) return null;
  const share = Math.max(1, Math.min(99, j.share || 50)) / 100;
  const fullValue = marketOf(h);
  const value = fullValue * share;

  // 전환 비용: 배우자 증여세 + 증여 취득세
  const gt = giftTaxCalc({ value, debt: 0, relation: 'spouse', prior10y: (j.prior || 0) * 억 });
  const houses = activeHouses(inp);
  const stat = oneStatusOf(houses);
  const at = giftAcquisitionTax({
    base: value, officialFull: pubOf(h), adj: adjYes(h.adjNow),
    big85: !!h.area85, giverIsOne: stat.one, toLineal: true
  });
  const cost = gt.tax + at.total;

  // 연간 보유세 절감: 현재 명의 vs 전환 후 명의
  const after = JSON.parse(JSON.stringify(inp));
  const ah = after.houses.find(x => x.id === h.id);
  const meNow = shareOf(h, 'me') * 100;
  ah.shares = { me: Math.max(0, meNow - share * 100), spouse: (shareOf(h, 'spouse') * 100) + share * 100, other: shareOf(h, 'other') * 100 };

  const savings = {};
  for (const scen of ['current', 'reform']) {
    const beforeRows = holdSim(inp, scen);
    const afterRows = holdSim(after, scen);
    savings[scen] = beforeRows.map((r, i) => ({
      year: r.year, before: r.jong.total, after: afterRows[i].jong.total, save: r.jong.total - afterRows[i].jong.total
    }));
  }
  // 손익분기: 정부안 기준 연평균 절감(2027~2030)
  const annual = savings.reform.slice(1).reduce((s, r) => s + r.save, 0) / Math.max(1, savings.reform.length - 1);
  const breakeven = annual > 1000 ? cost / annual : null;

  const warnings = [
    '증여 후 10년 이내 양도 시 이월과세로 취득가액이 증여자 기준으로 되돌아갑니다.',
    '전환 비용에는 국민주택채권 매입·등기 비용 등 부대비용이 빠져 있습니다.',
    '향후 양도 시에는 지분별 기본공제(각 250만원)와 누진세율 분산으로 양도세가 줄어드는 효과가 별도로 있습니다.',
    '대출 승계·자금출처 등 비세금 요인은 이 계산과 분리해 판단해야 합니다.'
  ];
  if (at.heavy) warnings.unshift('이 주택은 증여 취득세 12% 중과 대상입니다 — 전환 비용이 크게 늘어납니다.');

  return { house: h, share, value, gt, at, cost, savings, annual, breakeven, warnings, afterShares: ah.shares };
}

/* =====================================================================
   7. 임계점 · 민감도
   ===================================================================== */
function thresholds(inp) {
  const houses = activeHouses(inp);
  if (!houses.length) return null;
  const stat = oneStatusOf(houses);
  const mainH = mainHouseOf(houses);
  const oneLive = mainH ? liveNowOf(mainH.livePeriods) : false;
  const pubNow = houses.reduce((s, h) => s + pubOf(h), 0);

  function thrFor(scen, year) {
    const P = jongParams(year, scen);
    const tps = ['me', 'spouse'].map(k => houses.filter(h => shareOf(h, k) > 0));
    const both = tps.every(list => list.length === houses.length && list.length > 0);
    if (stat.one && both) {
      // 공동명의 1주택: 과세 시작 = max(개별납부 시작, 특례 시작)
      const shares = ['me', 'spouse'].map(k => shareOf(houses[0], k));
      const live = liveNowOf(houses[0].livePeriods);
      const indivStart = Math.min(...shares.filter(s => s > 0).map(s => P.dedMulti(live ? 1 : 0) / s));
      const specialStart = P.dedOne(live);
      return Math.max(indivStart, specialStart);
    }
    if (stat.one) return P.dedOne(oneLive);
    // 다주택: 본인 지분 기준 근사 — 합계가 인별 공제 합을 넘는 시점
    let sum = 0;
    for (const k of ['me', 'spouse']) {
      const list = houses.filter(h => shareOf(h, k) > 0);
      if (!list.length) continue;
      const ls = (() => {
        const ps = list.reduce((s, h) => s + pubOf(h) * shareOf(h, k), 0);
        const lv = list.filter(h => liveNowOf(h.livePeriods)).reduce((s, h) => s + pubOf(h) * shareOf(h, k), 0);
        return ps > 0 ? lv / ps : 0;
      })();
      sum += P.dedMulti(ls);
    }
    return sum || P.dedMulti(0);
  }

  const cur = thrFor('current', inp.assumptions.baseYear);
  const ref = thrFor('reform', inp.assumptions.baseYear + 2);
  const mk = t => ({
    pub: t,
    market: t / RULES.officialRatio,
    pct: pubNow > 0 ? (t / pubNow - 1) : null,
    years: [0.03, 0.05, 0.07].map(g => ({
      g, years: pubNow > 0 && t > pubNow ? Math.log(t / pubNow) / Math.log(1 + g) : 0
    }))
  });
  return { pubNow, current: mk(cur), reform: mk(ref), oneStatus: stat, oneLive };
}

/** 공시가격 ±5% 민감도 — 기준·하향·상향 3개 시나리오 */
function sensitivity(inp) {
  const mk = factor => {
    const v = JSON.parse(JSON.stringify(inp));
    v.houses.forEach(h => {
      if (h.priceMode === 'market') h.market = (h.market || 0) * factor;
      else h.official = (h.official || 0) * factor;
    });
    return v;
  };
  const rows = [];
  for (const [label, f] of [['하향 −5%', 0.95], ['기준', 1.0], ['상향 +5%', 1.05]]) {
    const v = mk(f);
    const cur = holdSim(v, 'current');
    const ref = holdSim(v, 'reform');
    rows.push({
      label, factor: f,
      cur2026: cur[0].holdTax, curJong2026: cur[0].jong.total,
      ref2027: ref[1] ? ref[1].holdTax : 0, refJong2027: ref[1] ? ref[1].jong.total : 0,
      ref2028: ref[2] ? ref[2].holdTax : 0, refJong2028: ref[2] ? ref[2].jong.total : 0
    });
  }
  const thr = thresholds(inp);
  let nearBoundary = false;
  if (thr && thr.pubNow > 0) {
    for (const t of [thr.current.pub, thr.reform.pub]) {
      if (t > 0 && Math.abs(thr.pubNow - t) / t <= 0.05) nearBoundary = true;
    }
  }
  return { rows, nearBoundary };
}

/* =====================================================================
   8. 입력 검증 · 상태 분류 (확정/추정/확인필요/계산불가)
   ===================================================================== */
function validateInput(inp) {
  const errors = [], confirms = [], estimates = [], fixed = [];
  const houses = inp.houses || [];
  if (!houses.length) errors.push({ code: 'NO_HOUSE', msg: '등록된 주택이 없습니다.' });

  houses.forEach((h, i) => {
    const nm = h.name || `주택 ${i + 1}`;
    const sum = (+(h.shares || {}).me || 0) + (+(h.shares || {}).spouse || 0) + (+(h.shares || {}).other || 0);
    if (Math.abs(sum - 100) > 0.01) errors.push({ code: 'SHARE_SUM', msg: `${nm} — 소유 지분 합계가 ${sum}%입니다. 100%가 되어야 계산할 수 있습니다.` });
    const pub = pubOf(h);
    if (!(pub > 0)) errors.push({ code: 'NO_PRICE', msg: `${nm} — 공시가격 또는 시세를 입력해 주세요.` });
    else if (pubEstimated(h)) estimates.push({ code: 'PUB_EST', msg: `${nm} — 공시가격을 시세×69%로 추정했습니다(2026 공동주택 참고값). 실제 고시가격 입력 시 정확도가 올라갑니다.` });
    else fixed.push({ code: 'PUB_OK', msg: `${nm} — 실제 공시가격 입력` });
    if (h.adjNow === 'unknown') confirms.push({ code: 'ADJ_NOW', msg: `${nm} — 현재 규제지역 여부 미확인. 보수적으로 규제지역으로 가정했습니다.` });
    if (!h.acqDate) confirms.push({ code: 'ACQ_DATE', msg: `${nm} — 취득일 미입력. 보유기간 공제·단기세율 판정이 부정확할 수 있습니다.` });
    if (h.flags) {
      const fl = [];
      if (h.flags.temp2) fl.push('일시적 2주택');
      if (h.flags.inherit) fl.push('상속주택');
      if (h.flags.lowLocal) fl.push('지방 저가주택');
      if (h.flags.rental) fl.push('등록임대');
      if (h.flags.popDecline) fl.push('인구감소지역');
      if (fl.length) confirms.push({ code: 'SPECIAL', msg: `${nm} — ${fl.join('·')} 특례 표시. 요건 충족 여부에 따라 결과가 달라질 수 있어 전문가 확인이 필요합니다.` });
    }
  });

  // 거주 충돌: 두 주택 이상에 현재 거주
  const livingNow = houses.filter(h => liveNowOf(h.livePeriods));
  if (livingNow.length > 1) confirms.push({ code: 'LIVE_DUP', msg: '두 개 이상의 주택에 현재 거주 중으로 입력되어 있습니다. 실거주는 한 곳만 가능합니다.' });

  if (inp.situation === 'unsure') confirms.push({ code: 'UNSURE', msg: '주택 수 판정이 불확실하다고 답하셨습니다 — 잠정 분류로 계산하며, 특례·권리관계에 따라 달라질 수 있습니다.' });
  if (inp.rights && (inp.rights.presale || inp.rights.occupancy)) confirms.push({ code: 'RIGHTS', msg: '분양권·입주권은 양도세·취득세 주택 수에 포함되지만 이 계산의 종부세에는 반영하지 않았습니다.' });
  if (inp.rights && inp.rights.inherited) confirms.push({ code: 'INHERIT', msg: '상속주택은 요건에 따라 주택 수 판정에서 제외될 수 있습니다 — 보수적으로 포함해 계산했습니다.' });

  const purposes = inp.purposes || [];
  if (purposes.includes('sell')) {
    const s = inp.sell || {};
    if (!(s.price > 0)) errors.push({ code: 'SELL_PRICE', msg: '매도 — 예상 양도가액을 입력해 주세요.' });
    const h = houses.find(x => x.id === s.houseId) || houses[0];
    if (h && h.acqDate && s.date && s.date < h.acqDate) errors.push({ code: 'DATE_ORDER', msg: '매도 — 양도 예정일이 취득일보다 빠릅니다.' });
    if (h && !(h.acqPrice > 0)) confirms.push({ code: 'ACQ_PRICE', msg: '매도 — 취득가액이 없어 양도차익이 과대계산될 수 있습니다.' });
    if (h && h.adjSale === 'unknown') confirms.push({ code: 'ADJ_SALE', msg: '매도 — 양도 시점 규제지역 여부 미확인. 보수적으로 규제지역으로 가정했습니다.' });
    if (h && h.adjAcq === 'unknown') confirms.push({ code: 'ADJ_ACQ', msg: '매도 — 취득 당시 규제지역 여부 미확인. 보수적으로 거주요건이 있는 것으로 가정했습니다.' });
  }
  if (purposes.includes('gift')) {
    const g = inp.gift || {};
    const h = houses.find(x => x.id === g.houseId) || houses[0];
    const fullValue = (g.value ? g.value * 억 : (h ? marketOf(h) : 0));
    const share = Math.max(0, Math.min(100, g.share || 0)) / 100;
    if (!(fullValue > 0) || !(share > 0)) errors.push({ code: 'GIFT_VALUE', msg: '증여 — 증여 지분과 평가액을 입력해 주세요.' });
    if (g.type === 'burden' && (g.debt || 0) * 억 > fullValue * share) errors.push({ code: 'GIFT_DEBT', msg: '증여 — 인수 채무가 증여가액보다 큽니다. 사실관계를 확인해 주세요.' });
    if (!g.value) estimates.push({ code: 'GIFT_EST', msg: '증여 — 평가액을 시세 환산값으로 추정했습니다. 실제로는 유사 매매사례가액 등 시가 평가가 우선합니다.' });
  }
  if ((inp.assumptions.marketGrowth || 0) !== 0 || (inp.assumptions.officialGrowth || 0) !== 0) {
    estimates.push({ code: 'GROWTH', msg: `가격 상승 가정 — 시세 연 ${inp.assumptions.marketGrowth || 0}% · 공시 연 ${inp.assumptions.officialGrowth || 0}%는 추정값입니다.` });
  }

  return { errors, confirms, estimates, fixed, blocked: errors.length > 0 };
}

/** 신뢰도 A/B/C */
function confidenceGrade(inp, valid, sens) {
  if (valid.blocked) return { grade: '-', why: '필수 입력 오류' };
  const near = sens && sens.nearBoundary;
  if (valid.confirms.length > 0) return { grade: 'C', why: '핵심 정보(주택 수·규제지역·특례 등) 확인 필요' };
  if (near && valid.estimates.length > 0) return { grade: 'C', why: '과세 경계 ±5% 이내 + 추정값 사용' };
  if (near) return { grade: 'B', why: '과세 경계 ±5% 이내 — 실제 공시가격 확인 권장' };
  if (valid.estimates.length > 0) return { grade: 'B', why: '일부 추정값 사용(경계와는 충분히 떨어짐)' };
  return { grade: 'A', why: '실제 공시가격·확정 정보 기반' };
}

/* =====================================================================
   9. 결론 코드 (검토의견 엔진의 사실 계층)
   ===================================================================== */
function conclusionOf(inp, curRows, refRows, valid, sens) {
  const y0 = inp.assumptions.baseYear;
  const cur26 = curRows[0], ref28 = refRows[2] || refRows[refRows.length - 1];
  const curJong = cur26.jong.total;
  const refJong = ref28.jong.total;
  const curHold28 = curRows[2] ? curRows[2].holdTax : cur26.holdTax;
  const refHold28 = ref28.holdTax;
  const diff = refHold28 - curHold28;

  if (valid.blocked) return { code: 'BLOCKED', head: '필수 입력을 확인해 주세요', sub: '' };

  const criticalUnknown = valid.confirms.some(c => ['UNSURE', 'SPECIAL'].includes(c.code));
  if (criticalUnknown) {
    return {
      code: 'UNCERTAIN',
      head: '주택 수·특례 확인 전에는 세액 범위를 확정하기 어렵습니다',
      sub: '아래 결과는 보수적 가정(특례 미적용·규제지역 포함) 기준의 잠정치입니다.', diff
    };
  }
  if (curJong <= 0 && refJong <= 0) {
    if (sens && sens.nearBoundary) {
      const thr = thresholds(inp);
      const t = thr ? Math.min(thr.current.pub, thr.reform.pub) : 0;
      return {
        code: 'CONDITIONAL',
        head: `공시가격 ${eok(t)}을 초과하면 종부세 과세가 시작될 수 있습니다`,
        sub: '현재는 과세 대상이 아니지만 과세 경계에 가깝습니다. 실제 공시가격을 확인해 주세요.', diff
      };
    }
    return {
      code: 'NO_CURRENT_IMPACT',
      head: '현재 입력 기준, 종합부동산세 과세 대상이 아닙니다',
      sub: '현행법과 8·3 정부안 모두에서 과세 문턱(기본공제)에 미치지 않습니다.', diff
    };
  }
  if (curJong <= 0 && refJong > 0) {
    return {
      code: 'TAX_STARTS',
      head: `정부안 가정 시 ${ref28.year}년부터 종부세 과세가 시작됩니다`,
      sub: `현행법에서는 과세 대상이 아니지만, 정부안 기준으로는 연 ${won(refJong)} 수준입니다.`, diff
    };
  }
  if (curJong > 0 && refJong <= 0) {
    return {
      code: 'TAX_ENDS',
      head: '정부안 가정 시 종부세 과세 대상에서 제외됩니다',
      sub: `현행 기준 연 ${won(curJong)} → 정부안 기준 0원. 과세 문턱 상향의 효과입니다.`, diff
    };
  }
  if (diff > 1000) {
    return {
      code: 'TAX_INCREASE',
      head: `정부안 가정 시 ${ref28.year}년 보유세가 현행 유지 대비 ${won(diff)} 증가합니다`,
      sub: '공정시장가액비율·기본공제 개편의 영향입니다. 국회 통과 여부에 따라 달라집니다.', diff
    };
  }
  if (diff < -1000) {
    return {
      code: 'TAX_DECREASE',
      head: `정부안 가정 시 ${ref28.year}년 보유세가 현행 유지 대비 ${won(-diff)} 감소합니다`,
      sub: '과세 문턱·공제 개편의 효과입니다. 국회 통과 여부에 따라 달라집니다.', diff
    };
  }
  return {
    code: 'NO_CHANGE',
    head: '현행과 정부안의 세부담 차이가 크지 않습니다',
    sub: '입력 기준에서는 개편 영향이 제한적입니다.', diff
  };
}

/* node 테스트용 export */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    억, 만, RULES, PROP, GIFT_RATES, GIFT_DED,
    progressive, bracketed, stepRate, ym, yearsBetween, liveYearsOf, liveNowOf,
    won, shortWon, eok, pubOf, marketOf, pubAt, marketAt, shareOf,
    propertyTax, fairRateOne, jongParams, jongPropCredit, jongbuPerson,
    holdCalcYear, holdSim, yangdoParams, yangdoCore, sellSim,
    acqBaseRate, acquisitionTax, giftAcquisitionTax, giftTaxCalc, giftFull,
    jointConvertAnalysis, thresholds, sensitivity, validateInput, confidenceGrade, conclusionOf,
    JR_NORMAL, JR_HEAVY, JR_2027, JR_2028, oneStatusOf
  };
}
