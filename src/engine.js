'use strict';
/* =====================================================================
   부동산 세금 진단 시뮬레이터 v2.0 — 계산 엔진 (순수 계산, DOM 없음)
   기준: 2026년 현행법(확정) + 2026.9.1 국무회의 수정 확정 「2026년 세제개편안」(9·1 수정 정부안·국회 심의 전)
   정책 이력: 8·3 발표안 → 9·1 수정안 (RULES.policyHistory 참조)
   PRD v2.0 (2026-08-09) 기반. 규칙은 RULES에 버전으로 관리한다.
   ===================================================================== */

const 억 = 1e8, 만 = 1e4;

const RULES = {
  version: 'rules-2026.09.01-r1',
  reviewedAt: '2026-09-01',
  policyDate: '2026-09-01',          // 정책 기준일 — 국회 심의·시행령 확정 시 이 상수와 policyHistory를 갱신한다
  officialRatio: 0.69, // 2026년 공동주택 공시가격 현실화율(참고값) — 시세→공시 추정에만 사용
  policy: {
    current: { code: 'current', label: '현행 확정법', badge: '현행법 · 확정', status: 'enacted' },
    reform:  {
      code: 'reform', label: '9·1 수정 정부안', badge: '9·1 수정 정부안 · 국회 심의 전', status: 'draft_proposal',
      decidedAt: '2026-09-01',
      note: '2026년 9월 1일 국무회의에서 수정 확정된 정부 세법개정안을 반영합니다. 아직 국회 심의 전으로 최종 법률은 변경될 수 있습니다.'
    }
  },
  // 정책 변경 이력 — 과거 자료는 삭제하지 않고 누적 관리
  policyHistory: [
    { date: '2026-08-03', name: '8·3 세제개편안(정부 발표)', status: 'superseded',
      items: ['비거주 1세대1주택 종부세 기본공제 12억 → 9억 축소안', '부부 공동명의 1주택 개별납부 공제 1인당 4억(비거주)/9억(실거주)', '종부세 세부담상한 150% → 200% 상향안', '실거주 1주택 기본공제 14억, 공정시장가액비율 70/80%, 세액공제 800/600만원 한도, 장특공제 20/10억 한도'] },
    { date: '2026-09-01', name: '9·1 수정 정부안(국무회의 확정)', status: 'draft_proposal',
      items: ['비거주 1세대1주택 종부세 기본공제 12억원 유지(9억 축소안 철회)', '비거주 부부 공동명의 1주택 개별납부 공제 1인당 6억원(4억 → 6억, 부부 합산 12억)', '실거주 부부 공동명의 1인당 9억원 유지(부부 합산 18억)', '종부세 세부담상한 150% 유지(주택분·토지분 200% 상향안 철회)', '그 외 8·3 발표안 항목은 유지'] }
  ],
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
    '기획재정부 「2026년 세법개정안」 국무회의 수정 확정 — 비거주 1주택 기본공제 12억 유지, 비거주 부부 공동명의 1인당 6억, 세부담상한 150% 유지 (2026.9.1)',
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
/* 거주기간 정규화 — 시작일 정렬 후 중첩·연속 구간 병합 (2026-08-13 오류 4).
   [{from,to}] → 병합된 [start,end] 숫자 구간 배열. atStr 이후는 잘라낸다.
   종료일 < 시작일인 구간은 무시(입력 오류 — 검증 계층에서 별도 표시). */
function normalizeLivePeriods(periods, atStr, fromStr) {
  const at = ym(atStr);
  if (!at) return [];
  const atV = ymVal(at);
  const minV = fromStr && ym(fromStr) ? ymVal(ym(fromStr)) : -Infinity; // 취득일 이전 구간 보정
  const segs = [];
  for (const p of (periods || [])) {
    const f = ym(p.from);
    if (!f) continue;
    const tv = p.to ? (ym(p.to) ? ymVal(ym(p.to)) : atV) : atV;
    let st = Math.max(ymVal(f), minV), en = Math.min(tv, atV);
    if (!(en > st)) continue;   // 역전·0길이 구간 제외
    segs.push([st, en]);
  }
  segs.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); // 중첩·연속 병합(포함 구간도 흡수)
    else merged.push([s[0], s[1]]);
  }
  return merged;
}
function liveYearsOf(periods, atStr, fromStr) {
  const merged = normalizeLivePeriods(periods, atStr, fromStr);
  let sum = 0;
  for (const s of merged) sum += s[1] - s[0];
  return sum;
}
function liveNowOf(periods, asOf) {
  // 오류 2: 열린 거주 구간이라도 전입일이 판정 시점(asOf) 이후면 '아직 비거주'다.
  return (periods || []).some(p => {
    const f = ym(p.from);
    if (!f || p.to) return false;
    if (!asOf) return true;                 // 시점 미지정 호출은 기존 의미 유지
    const a = ym(asOf);
    return a ? ymVal(f) <= ymVal(a) : true;
  });
}
function futureMoveIn(periods, asOf) {      // 향후 실거주 예정 여부·시작월
  for (const p of (periods || [])) {
    const f = ym(p.from);
    if (f && !p.to && asOf && ymVal(f) > ymVal(ym(asOf))) return p.from;
  }
  return null;
}

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
   1. 재산세 (지방세 — 2026년 현행, 세제개편안(국세) 대상 아님)
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
// 과세표준상한제 (지방세법 §110의2, 2024 시행) — 2026-08-12 점검 이슈 3에서 산식 재구현:
//   과세표준상한액 = 직전 연도 과세표준상당액 + (당해연도 시가표준액으로 산정한 과세표준 × 상한율 5%)
//   직전 연도 과세표준상당액 = 직전 연도 시가표준액(공시가격) × 당해연도 공정시장가액비율
//   → prevPub(직전 연도 공시가격)을 체이닝하며, 확정 과표가 아니라 공시가격을 넘긴다.
function propertyTax(pub, isOneHH, urban = true, prevPub = null, year = null, keepSpecial = false) {
  // P1-2: keepSpecial=true → 1주택 43~45% 특례가 2027년 이후에도 연장된다고 가정 (기본값은 일몰)
  const fair = isOneHH ? fairRateOne(pub, keepSpecial ? null : year) : PROP.fairOther;
  let base = pub * fair;
  const rawBase = base;
  let capBase = null, capped = false;
  if (prevPub != null && prevPub > 0) {
    capBase = prevPub * fair + rawBase * 0.05;
    if (rawBase > capBase) { base = capBase; capped = true; }
  }
  // 특례세율(공시 9억 이하 1세대1주택)은 지방세법 §111의2에 일몰 없이 상시 규정 → 연도 무관
  const useSpec = isOneHH && pub <= PROP.specCap;
  const main = progressive(base, useSpec ? PROP.rateSpec : PROP.rateStd);
  const city = urban ? base * PROP.urban : 0;
  const edu = main * PROP.edu;
  return { pub, fair, base, rawBase, capBase, capped, useSpec, main, city, edu, total: main + city + edu };
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

/* 종부세 기본공제 유형 (2026-09-02 지시서 §9) — 4가지 보유형태를 같은 로직으로 처리하지 않는다 */
const DED_TYPE = {
  one: 'SINGLE_OWNER_ONE_HOUSEHOLD_HOME',            // TYPE 1: 1세대1주택 단독명의 (실거주 14억 / 비거주 12억)
  jointOneIndiv: 'JOINT_OWNER_ONE_HOUSEHOLD_HOME',   // TYPE 2: 부부 공동명의 1주택 개별납부 (각 9억 / 각 6억) + 특례 비교
  multi: 'MULTI_HOME_HOUSEHOLD_INDIVIDUAL_OWNER'     // TYPE 3: 부부 각 1채·일반 다주택 (4억 + 5억 × 거주주택가액비율)
};
function jongParams(year, scen) {
  if (scen === 'current' || year <= 2026) {
    return {
      key: 'current', label: '현행',
      dedOne: () => 12 * 억,
      dedMulti: () => 9 * 억,
      dedJointOneIndiv: () => 9 * 억,       // 현행: 부부 공동명의 1주택 개별납부 = 일반 납세자 공제 9억
      fair: () => 0.60,
      table: n => n >= 3 ? JR_HEAVY : JR_NORMAL,
      creditMode: 'hold', burdenCap: 1.50
    };
  }
  if (year === 2027) {
    return {
      key: 'r2027', label: '수정 정부안 2027',
      // 9·1 수정안: 비거주 1주택 기본공제 12억 유지(8·3안의 9억 축소 철회), 실거주 14억
      dedOne: live => live ? 14 * 억 : 12 * 억,
      // 일반 다주택(8·3안 유지): 4억 + 5억 × 거주주택가액 비중 — 공동명의 1주택과는 별도 규칙
      dedMulti: ls => 4 * 억 + 5 * 억 * ls,
      // 9·1 수정안: 부부 공동명의 1주택 개별납부 — 납세의무자 1인당 실거주 9억 / 비거주 6억 (지분 안분 아님)
      dedJointOneIndiv: live => live ? 9 * 억 : 6 * 억,
      fair: () => 0.70,
      // PRD §8 P0: 2027년 3주택 이상은 중과 체계(최고 5%) 유지, 1·2주택만 일원화 중간 단계
      table: n => n >= 3 ? JR_HEAVY : JR_2027,
      creditMode: 'max', burdenCap: 1.50   // 9·1 수정안: 200% 상향안 철회 → 현행 150% 유지
    };
  }
  return {
    key: 'r2028', label: '수정 정부안 2028~',
    dedOne: live => live ? 14 * 억 : 12 * 억,          // 9·1 수정안: 비거주 12억 유지
    dedMulti: ls => 4 * 억 + 5 * 억 * ls,               // 일반 다주택(8·3안 유지)
    dedJointOneIndiv: live => live ? 9 * 억 : 6 * 억,   // 9·1 수정안: 공동명의 1주택 개별납부 1인당
    // 정부안 문답자료 p.45: 3주택 이상 또는 조정지역 주택 보유자(단, 1세대1주택자 제외) → 80%,
    // 그 외 (1세대1주택자, 지방 1·2주택) → 70%.
    // 부부공동명의 개별납부는 각자 인별 판정 시 1세대1주택자가 아니므로 조정지역 시 80% 적용.
    fair: (n, hasAdj, isOne) => isOne ? 0.70 : ((n >= 3 || hasAdj) ? 0.80 : 0.70),
    table: () => JR_2028,
    creditMode: 'live', burdenCap: 1.50   // 9·1 수정안: 200% 상향안 철회 → 현행 150% 유지
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
  // 납세자 유형별 기본공제 — 공동명의 1주택 개별납부(jointOneIndiv)는 일반 다주택(dedMulti)과 분리
  const taxpayerType = o.jointOneIndiv ? 'jointOneIndiv' : (o.isOne ? 'one' : 'multi');
  const ded = taxpayerType === 'jointOneIndiv' ? P.dedJointOneIndiv(!!o.oneLive)
    : taxpayerType === 'one' ? P.dedOne(!!o.oneLive)
    : P.dedMulti(Math.max(0, Math.min(1, o.liveShare || 0)));
  d.taxpayerType = taxpayerType;
  d.dedType = DED_TYPE[taxpayerType];
  // 납세자 단위 데이터(§8) — 호출자가 소유주택·지분가액을 계산해 넘긴다
  if (o.owner) d.owner = Object.assign({}, o.owner, { taxpayerDeduction: ded });
  const hh = o.householdHouseCount || o.houseCount || 1;
  const ratioPct = Math.round(Math.max(0, Math.min(1, o.liveShare || 0)) * 100);
  if (P.key === 'current') {
    d.dedWhy = taxpayerType === 'one'
      ? `세대 기준 1주택 · 단독명의 → 현행 1세대 1주택 기본공제 12억원.`
      : taxpayerType === 'jointOneIndiv'
        ? `동일한 1주택을 부부가 공동소유 → 현행 개별납부는 납세의무자 1인당 일반 공제 9억원 (1세대 1주택 특례 신청과 비교).`
        : `세대 기준 ${hh}주택이므로 1세대 1주택 공제(12억)를 적용하지 않습니다. 현행 기본공제 9억원.`;
  } else if (taxpayerType === 'one') {
    d.dedWhy = `세대 기준 1주택${hh > 1 ? '(특례주택 제외)' : ''} · 단독명의 → 1세대 1주택 공제 ${o.oneLive ? '실거주 14억원' : '비거주 12억원 (9·1 수정안: 8·3안의 9억 축소 철회)'}.`;
  } else if (taxpayerType === 'jointOneIndiv') {
    d.dedWhy = `부부가 각각 한 채씩 보유한 것이 아니라 동일한 1주택을 공동소유한 경우이므로 공동명의 1주택 규정을 적용합니다 — 개별납부 시 납세의무자 1인당 ${o.oneLive ? '실거주 9억원' : '비거주 6억원(9·1 수정안, 8·3안 4억)'} (지분 안분 없음). 1세대 1주택 특례 신청과 비교해 유리한 쪽을 적용합니다.`;
  } else {
    d.dedWhy = (o.householdOneHome
      ? '세대 기준으로는 1주택(특례주택 제외)이지만 본인이 그 주택의 단독 소유자가 아니므로 1세대 1주택 공제를 적용하지 않습니다. '
      : `세대 기준 ${hh}주택이므로 1세대 1주택 공제를 적용하지 않습니다. `) + (ratioPct > 0
      ? `본인이 보유한 주택가액 중 거주용 주택 비율이 ${ratioPct}%이므로 기본공제는 4억원 + 5억원 × ${ratioPct}% = ${won(ded)}입니다.`
      : `본인 소유 주택이 모두 비거주주택이므로 기본공제는 4억원입니다.`);
  }
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
    d.creditAgeRate = ageR;      // 표시용 분해 (P2-4)
    d.creditPeriodRate = pr;
    d.creditPeriodLabel = P.creditMode === 'hold' ? '보유' : P.creditMode === 'live' ? '거주' : '보유·거주 중 큰 값';
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
/* P0-2 (종부세법 시행령 §4의2): 상속주택 주택 수 제외는 시간 제한이 있다.
   ① 상속개시일부터 5년 미경과 — 기간 경과 시 산입
   ② 소유 지분 40% 이하 — 기간 제한 없음
   ③ 지분 상당 공시가격 수도권 6억(그 외 3억) 이하 — 기간 제한 없음
   asOf(과세기준일 YYYY-MM)가 주어지면 시간 축을 판정하고, 없으면 기존 동작(제외 유지)을 보존한다. */
const METRO_REGIONS = ['서울', '경기', '인천'];
function inheritForever(h) {
  const maxShare = Math.max(shareOf(h, 'me'), shareOf(h, 'spouse'));
  if (maxShare > 0 && maxShare <= 0.40) return true;
  const metro = METRO_REGIONS.some(r => String(h.region || '').indexOf(r) === 0);
  return pubOf(h) * (maxShare || 1) <= (metro ? 6 * 억 : 3 * 억);
}
function inheritExcludedAt(h, asOf) {
  if (!(h.flags && h.flags.inherit)) return false;
  if (inheritForever(h)) return true;
  if (!h.acqDate) return false;              // 오류 8: 상속개시일 미입력 → 특례 미적용(자동 유리 적용 금지)
  if (!asOf) return true;                    // 시점 미지정 경로(양도·증여 등)는 기존 동작 유지
  const yrs = yearsBetween(h.acqDate, asOf);
  return yrs !== null && yrs < 5;
}
/* 이슈 6A: 지방 저가·인구감소 특례는 법정 요건(소재지·공시가격) 충족 시에만 반영.
   지방 저가주택: 수도권(서울·경기·인천) 밖 + 공시 3억 이하 (종부세법 §8④3, 시행령 §4의2).
   인구감소지역: 수도권 밖 + 공시 4억 이하로 잠정 적용 — 세부 요건(지정지역 목록·취득시기)은 확인 필요. */
/* 오류 6 (상세본 p70-71): 적용 지역은 '비수도권(광역시 제외)'이 원칙 — 광역시 주택은 부적격
   (광역시 내 군지역 예외는 시·군·구 입력이 없어 자동 판정 미지원 → 별도 안내).
   인구감소·관심지역 가액 상한은 유형별 9억/6억/4억 — 지역 유형 입력이 없어
   가장 보수적인 4억(일반 비수도권 기준)만 자동 인정. 주택 수 제외 특례는 '26.1.1. 이후 취득분. */
function nonMetroEligible(h) {
  const r = String(h.region || '');
  const metro = METRO_REGIONS.some(m => r.indexOf(m) === 0);
  const gwangyeok = r.indexOf('부산') === 0; // '부산·대구 등 광역시' 선택지
  return !metro && !gwangyeok;
}
function lowLocalEligible(h) {
  return nonMetroEligible(h) && pubOf(h) <= 3 * 억;
}
function popDeclineEligible(h) {
  return nonMetroEligible(h) && pubOf(h) <= 4 * 억 && !!h.acqDate && h.acqDate >= '2026-01';
}
function specialExcludedIds(houses, asOf = null) {
  return new Set(houses.filter(h => h.flags && (
    (h.flags.inherit && inheritExcludedAt(h, asOf)) ||
    (h.flags.lowLocal && lowLocalEligible(h)) ||
    (h.flags.popDecline && popDeclineEligible(h))
  )).map(h => h.id));
}
function specialExcludedCount(houses, asOf = null) {
  return specialExcludedIds(houses, asOf).size;
}
/* 오류 5 (상세본 p73-74): 일시적 2주택 처분기한 — 신규주택 취득일부터 현행 3년,
   조정대상지역 내(종전·신규 모두 조정) 2년으로 단축. 경과조치: '26.8.3. 이전 취득
   또는 계약+계약금 지급분은 종전 3년. 기한 경과 시 특례 자동 해제. */
function temp2Deadline(houses) {
  const flagged = houses.filter(h => h.flags && h.flags.temp2);
  if (houses.length !== 2 || !flagged.length) return null;
  const newer = houses.slice().sort((a, b) => (b.acqDate || '') > (a.acqDate || '') ? 1 : -1)[0];
  if (!newer || !newer.acqDate) return { unknown: true };
  const bothAdj = houses.every(h => adjYes(h.adjNow));
  const years = (bothAdj && newer.acqDate > '2026-08-03') ? 2 : 3;
  const d = ym(newer.acqDate);
  return { from: newer.acqDate, years, until: `${d.y + years}-${String(d.m).padStart(2, '0')}` };
}
function temp2ActiveAt(houses, asOf) {
  const dl = temp2Deadline(houses);
  if (!dl) return false;
  if (dl.unknown || !asOf) return true; // 날짜 미상·시점 미지정 → 유지(확인 문구 별도)
  return ymVal(ym(asOf)) <= ymVal(ym(dl.until));
}
function oneStatusOf(houses, rightsCount = 0, asOf = null) {
  // 이슈 5: 주택 수 제외 특례(§8④)는 '다른 주택과 함께 보유'를 전제로 한다.
  // 상속주택 등만 보유한 사람은 0주택이 아니라 그 주택 기준 1세대 1주택자다.
  const exclRaw = specialExcludedCount(houses, asOf);
  const excl = Math.min(exclRaw, Math.max(0, houses.length - 1));
  const netHouses = houses.length - excl;           // 실질 주택수
  const netTotal = netHouses + rightsCount;         // 실질 + 권리
  if (netTotal === 1 && netHouses === 1) return { one: true, temp2: false, effCount: houses.length + rightsCount, excluded: excl };
  if (netTotal === 2 && netHouses === 2 && temp2ActiveAt(houses, asOf))
    return { one: true, temp2: true, effCount: houses.length + rightsCount, excluded: excl };
  return { one: false, temp2: false, effCount: houses.length + rightsCount, excluded: excl };
}
/** 시뮬레이션 구간(baseYear~+4) 안에서 상속 특례가 만료되는 첫 연도 (없으면 null) */
function inheritExpiryYear(inp) {
  const y0 = inp.assumptions.baseYear;
  let best = null;
  for (const h of (inp.houses || [])) {
    if (!(h.flags && h.flags.inherit) || !h.acqDate || inheritForever(h)) continue;
    for (let y = y0; y <= y0 + 4; y++) {
      if (!inheritExcludedAt(h, `${y}-06`)) {
        if (!best || y < best.year) best = { year: y, name: h.name || '상속주택' };
        break;
      }
    }
  }
  return best;
}
function rightsCountOf(inp) {
  const r = inp && inp.rights ? inp.rights : {};
  return (r.presale ? 1 : 0) + (r.occupancy ? 1 : 0);
}
function mainHouseOf(houses, asOf) { // 거주 중인 주택 우선, 없으면 첫 번째
  return houses.find(h => liveNowOf(h.livePeriods, asOf)) || houses[0];
}
function adjYes(v) { return v === 'yes' || v === 'unknown'; } // 미확인은 보수적으로 예 취급(플래그 별도)

/**
 * 특정 연도 보유세(재산세 + 종부세) — 납세자별.
 * prevMap: 세부담상한 연쇄용 { key: burdenBase }
 */
function holdCalcYear(inp, scen, year, prevMap, opt = {}) {
  const houses = activeHouses(inp, opt);
  const isOnePT = houses.length === 1; // 재산세 1세대1주택 특례는 엄격히 1주택만
  const stat = oneStatusOf(houses, 0, `${year}-06`); // P0-2: 상속 특례 5년 만료를 과세기준일 기준으로 판정
  const urban = inp.assumptions.urban !== false;

  const rows = houses.map(h => {
    const pub = pubAt(h, year, inp);
    // §110의2: house.id별 직전 연도 '시가표준액(공시가격)' 체이닝 (prevMap에 저장)
    const ppKey = `pp|${scen}|${h.id}`;
    const prevPub = prevMap ? prevMap[ppKey] : null;
    const pt = propertyTax(pub, isOnePT, urban, prevPub, year, !!inp.assumptions.propFairKeep);
    if (prevMap) prevMap[ppKey] = pub;
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
        liveNow: liveNowOf(r.h.livePeriods, asOf),
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
      // §8 납세자 단위 데이터 — 각 납세자의 소유주택·지분가액을 먼저 계산한 뒤 공제를 산출한다
      owner: {
        ownedHouses: ent.map(e => ({ id: e.h.id, name: e.h.name || '', ownershipShare: e.share, officialValue: e.share > 0 ? e.pubShare / e.share : 0, ownedOfficialValue: e.pubShare, residential: !!e.liveNow })),
        ownershipShare: ent.reduce((m, e) => { m[e.h.id] = e.share; return m; }, {}),
        ownedOfficialValue: pubSum,
        residentialOwnedValue: ent.filter(e => e.liveNow).reduce((s, e) => s + e.pubShare, 0),
        totalOwnedValue: pubSum,
        residentialValueRatio: pubSum > 0 ? ent.filter(e => e.liveNow).reduce((s, e) => s + e.pubShare, 0) / pubSum : 0
      },
      age: (person.age || 0) + (year - inp.assumptions.baseYear),
      soleOne: stat.one && (function () {
        // 1세대 1주택자 판정(§8④): 특례로 제외된 주택을 뺀 '세대의 1주택'을 이 납세자가 단독 소유해야 한다.
        // 배우자가 상속주택만 따로 보유한 경우 그 배우자는 1세대 1주택자가 아니다.
        const exIds = specialExcludedIds(houses, asOf);
        const core = houses.filter(h => !exIds.has(h.id));
        return (core.length ? core : houses).every(h => shareOf(h, key) >= 0.999);
      })()
    });
  }

  const mainH = mainHouseOf(houses, asOf);
  const holdY = mainH && mainH.acqDate ? (yearsBetween(mainH.acqDate, asOf) || 0) : 0;
  const liveY = mainH ? liveYearsOf(mainH.livePeriods, asOf, mainH.acqDate) : 0;
  const oneLive = mainH ? liveNowOf(mainH.livePeriods, asOf) : false;

  const jong = {
    mode: 'per-taxpayer', persons: [], total: 0, joint: null, oneStatus: stat,
    // §8 세대 단위 데이터 — 1세대1주택 특례 판단은 세대 기준, 공제 산출은 납세자 기준
    household: {
      householdHouseCount: houses.length,
      isHouseholdOneHome: !!stat.one,
      residenceHouseId: (houses.find(h => liveNowOf(h.livePeriods, asOf)) || {}).id || null
    }
  };
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
        isOne: false, jointOneIndiv: true, oneLive, liveShare: t.liveShare,   // 9·1: 1인당 9억/6억 공제, 세액공제·70% FMV는 종전대로 미적용
        householdHouseCount: houses.length, householdOneHome: stat.one, owner: t.owner,
        age: t.age, holdY, liveY,
        aggPBase: t.aggPBase, avgFair: t.avgFair, propMainPaid: t.propMainPaid,
        prevTotal: prevOf(`indiv|${t.key}`)
      });
      setPrev(`indiv|${t.key}`, r.burdenBase || t.propMainPaid);
      return { key: t.key, r };
    });
    const indivTotal = indiv.reduce((s, x) => s + x.r.total, 0);

    // B) 1세대 1주택 특례 — 납세의무자: 지분율 큰 자 (지분율이 같으면 합의로 정하는 자
    //    — 종부세법 시행령 §5의2. 동률이면 두 경우를 모두 계산해 유리한 쪽을 추천)
    const pubAll = rows.reduce((s, r) => s + r.pub, 0);
    const aggAll = rows.reduce((s, r) => s + r.pub * r.pt.fair, 0);
    const tie = Math.abs(tps[0].pubSum - tps[1].pubSum) < 1;
    const candidates = tie ? tps : [tps.reduce((a, b) => (b.pubSum > a.pubSum ? b : a), tps[0])];
    const specials = candidates.map(rep => {
      const r = jongbuPerson({
        year, scen, pubSum: pubAll, houseCount: houses.length, hasAdj: rows.some(x => adjYes(x.h.adjNow)),
        isOne: true, oneLive, liveShare: oneLive ? 1 : 0,
        householdHouseCount: houses.length, householdOneHome: stat.one,
        owner: {
          ownedHouses: rows.map(x => ({ id: x.h.id, name: x.h.name || '', ownershipShare: 1, officialValue: x.pub, ownedOfficialValue: x.pub, residential: liveNowOf(x.h.livePeriods, asOf) })),
          ownedOfficialValue: pubAll, residentialOwnedValue: oneLive ? pubAll : 0, totalOwnedValue: pubAll, residentialValueRatio: oneLive ? 1 : 0
        },
        age: rep.age, holdY, liveY,
        aggPBase: aggAll, avgFair: pubAll > 0 ? aggAll / pubAll : PROP.fairOther,
        propMainPaid: prop.main,
        prevTotal: prevOf(`special|${rep.key}`)
      });
      setPrev(`special|${rep.key}`, r.burdenBase || prop.main);
      return { key: rep.key, r };
    });
    const bestSp = specials.reduce((a, b) => (b.r.total < a.r.total ? b : a), specials[0]);
    const special = bestSp.r;
    const specialAlt = specials.length > 1 ? specials.find(x => x.key !== bestSp.key) : null;

    const best = indivTotal <= special.total ? 'indiv' : 'special';
    jong.mode = 'joint-compare';
    jong.joint = {
      indiv, indivTotal, special, best,
      repKey: bestSp.key,
      repChoice: tie ? 'agreed' : 'statutory',   // agreed: 합의 선택 가능(유리한 쪽 추천) / statutory: 지분 큰 자 법정
      specialAlt: specialAlt ? { key: specialAlt.key, total: specialAlt.r.total } : null
    };
    jong.total = Math.min(indivTotal, special.total);
    jong.persons = indiv.map(x => x.r);
  } else {
    for (const t of tps) {
      const isOneTp = stat.one && t.soleOne;
      const r = jongbuPerson({
        year, scen, pubSum: t.pubSum, houseCount: t.houseCount, hasAdj: t.hasAdj,
        isOne: isOneTp, oneLive: isOneTp ? oneLive : false, liveShare: t.liveShare,
        householdHouseCount: houses.length, householdOneHome: stat.one, owner: t.owner,
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
  const yEnd = Math.max(y0 + 4, opt.toYear || 0);
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
  for (let y = y0; y <= yEnd; y++) rows.push(holdCalcYear(inp, scen, y, prevMap, opt));
  return rows;
}

/* =====================================================================
   3. 양도소득세 — 소유자(지분)별
   ===================================================================== */
/* 이슈 1: 다주택자 조정대상지역 중과 한시 배제 — 2026-05-09 양도분까지 (소득세법 시행령 §167의3 등,
   기획재정부 고시 기준일. 재연장 여부는 미정 — 이후 양도분은 중과 원칙 복귀로 계산).
   월 단위 입력은 2026년 4월까지만 확정 배제, 5월은 일 단위 입력 필요(미입력 시 보수적으로 중과). */
const HEAVY_SUSPEND_END = '2026-05-09';
function heavySuspendedAt(dateStr) {
  if (!dateStr) return false;
  const d = String(dateStr);
  if (d.length >= 10) return d.slice(0, 10) <= HEAVY_SUSPEND_END;
  return d <= '2026-04';
}
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
  // 상생임대주택 특례(시행령 §155의3): 비과세·장특 표2의 거주기간 제한을 받지 않는다 — liveWaived로 전달
  const exempt = !!o.isOne && (o.holdY || 0) >= 2 && (!o.needLive || (o.liveY || 0) >= 2);
  if (o.liveWaived && o.isOne && exempt) d.notes.push('상생임대주택 특례 반영 — 거주요건(2년)을 충족한 것으로 보아 계산했습니다 (임대기간·임대료 5% 이내 등 법정 요건 충족 전제).');
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

  // 장기보유특별공제 (분해 표시: 보유분/거주분 — §7)
  let rate = 0, holdPart = 0, livePart = 0;
  const hY = Math.floor(o.holdY || 0), lY = Math.floor(o.liveY || 0);
  if (shortTerm) {
    // 단기 — 장특 없음
  } else if (heavy) {
    d.notes.push('조정대상지역 다주택 중과 — 장기보유특별공제 배제');
  } else if (exempt && (lY >= 2 || o.liveWaived) && hY >= 3) {
    const t = P.one;
    livePart = Math.min(t.liveMax, t.live * lY);
    holdPart = Math.min(t.holdMax, t.hold * hY);
    rate = Math.min(0.80, livePart + holdPart);
  } else if (hY >= 3) {
    const t = P.gen;
    if (t.mode === 'hold') rate = holdPart = Math.min(t.holdMax, t.hold * hY);
    else if (t.mode === 'max') {
      holdPart = Math.min(t.holdMax, t.hold * hY);
      livePart = Math.min(t.liveMax || 0, (t.live || 0) * lY);
      rate = Math.max(holdPart, livePart);
    }
    else rate = livePart = (lY >= (t.minLive || 0)) ? Math.min(t.liveMax, t.live * lY) : 0;
  }
  d.ltcgRate = rate;
  d.ltcgHoldRate = holdPart;
  d.ltcgLiveRate = livePart;

  let surRate = heavy ? ((o.heavyCount >= 3) ? P.sur[3] : P.sur[2]) : 0;
  let surTransition = false;
  // 오류 3 (상세본 p72 특례규정): 중과세율이 적용된 '26년 양도분(보유 2년 이상)도
  // '27.1.1. 이후 예정·확정신고 시 완화세율(2주택 +5%p, 3주택 이상 +10%p) 적용 — 정부안 한정
  if (heavy && o.scen === 'reform' && o.year === 2026) {
    surRate = (o.heavyCount >= 3) ? 0.10 : 0.05;
    surTransition = true;
  }
  d.surcharge = surRate;
  d.surTransition = surTransition;
  if (heavy) d.notes.push(surTransition
    ? `조정대상지역 다주택 중과 +${Math.round(surRate * 100)}%p — '26년 양도분 특례규정(정부안): '27년 예정·확정신고 시 완화세율 적용 (보유 2년 이상 한정, 장기보유특별공제 배제는 유지)`
    : `조정대상지역 다주택 중과 +${Math.round(surRate * 100)}%p (${P.label})`);

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
    // 오류 7 (문답 p48-49): 기본공제는 인별 연간 한도에서 '같은 해 다른 양도 기사용액'만 차감.
    // 확대공제(10년 거주·30억 이하) 대상이면 한도 2,500만원 — 다른 자산에 250만원을 썼다면
    // 이 주택에는 2,250만원. 부부 공동명의는 각각 한도 적용(문답 ➋).
    const bigOk = P.bigDed && o.isOne && (o.liveY || 0) >= 10 && full <= 30 * 억;
    const bdLimit = bigOk ? P.bigDed : P.basicDed;
    const bdUsed = o.sameYearOther ? Math.min(bdLimit, Math.max(0, o.usedBasicDed != null ? o.usedBasicDed : P.basicDed)) : 0;
    const bd = Math.max(0, bdLimit - bdUsed);
    if (bigOk && !d.notes.includes('장기거주 1주택 기본공제 한도 2,500만원 적용')) d.notes.push('장기거주 1주택 기본공제 한도 2,500만원 적용');
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
      senior = Math.min(gross * P.senior.rate, P.senior.cap * ow.share); // 한도는 주택 전체 기준 → 지분 안분
    }
    const tax = Math.max(0, gross - senior);
    d.owners.push({ key: ow.key, share: ow.share, taxable, ltcg, ltcgCapped, ltcgCap: ltcgCap === Infinity ? null : ltcgCapOw, basicDed: base > 0 ? bd : Math.min(bd, taxable - ltcg), bdLimit, bdUsed, base, rate: mRate, gross, senior, tax, local: tax * 0.10, total: tax * 1.10 });
    if (ltcgCapped && !d.notes.some(n => n.includes('장특공제 한도'))) {
      d.notes.push(`정부안 장특공제 한도 적용 (${P.label}) — ${o.year >= 2029 ? '10억원' : '20억원'} 안분 후 초과분 배제`);
    }
    d.tax += tax;
  }
  if ((o.holdY || 0) < 1) d.notes.push('보유 1년 미만 — 단기세율 70%');
  else if ((o.holdY || 0) < 2) d.notes.push('보유 1~2년 — 단기세율 60%');
  if (o.sameYearOther) d.notes.push(`같은 해 다른 양도의 기본공제 기사용액을 인별 한도에서 차감했습니다 (한도·기사용·잔여는 상세 내역 참조)`);
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
  const sd = ym(s.date);
  const saleM = sd ? sd.m : 6;
  const saleYear = sd ? sd.y : y0;
  const dayMatch = /^\d{4}-\d{1,2}-(\d{1,2})/.exec(String(s.date || ''));
  const saleDay = dayMatch ? +dayMatch[1] : null;
  const before61 = saleM < 6 || (saleM === 6 && saleDay != null && saleDay <= 1);

  // 오류 1: 입력한 매도연도를 반드시 포함 — 기본 비교 구간(y0~y0+4) 밖이면
  // 매도연도를 끝으로 하는 5개 연도로 비교 구간을 이동한다.
  const years = [];
  if (saleYear <= y0 + 4) { for (let y = y0; y <= y0 + 4; y++) years.push(y); }
  else { for (let y = Math.max(y0, saleYear - 4); y <= saleYear; y++) years.push(y); }

  const toYear = years[years.length - 1];
  const holdRows = holdSim(inp, scen, { toYear });
  const holdRowsEx = holdSim(inp, scen, { excludeId: h.id, toYear });
  const holdOf = y => holdRows[y - y0];
  const holdExOf = y => holdRowsEx[y - y0];

  const targetFlagged = h.flags && (h.flags.inherit || h.flags.lowLocal || h.flags.popDecline);
  const judgeHouses = targetFlagged
    ? inp.houses.map(x => x.id === h.id
      ? Object.assign({}, x, { flags: Object.assign({}, x.flags, { inherit: false, lowLocal: false, popDecline: false }) })
      : x)
    : inp.houses;
  const rc = rightsCountOf(inp);
  const otherSh = shareOf(h, 'other');
  const metroHouse = METRO_REGIONS.some(m => String(h.region || '').indexOf(m) === 0);
  const dl = temp2Deadline(inp.houses);

  const rows = [];
  for (const Y of years) {
    const saleYM = `${Y}-${String(saleM).padStart(2, '0')}`;
    const saleDate = saleDay != null ? `${saleYM}-${String(saleDay).padStart(2, '0')}` : saleYM;

    const holdThis = before61 ? holdExOf(Y).holdTax : holdOf(Y).holdTax;
    let cum = 0;
    for (let y = y0; y < Y; y++) cum += holdOf(y).holdTax;
    cum += holdThis;

    const stat = oneStatusOf(judgeHouses, rc, saleYM);
    const sangYes = h.sangsaeng === 'yes'; // 상생임대 특례 표시 — 거주요건 면제(§155의3)
    const needLive = adjYes(h.adjAcq) && (!h.acqDate || h.acqDate >= '2017-08') && !sangYes;
    const heavyAdj = adjYes(h.adjSale);
    const owners = [];
    for (const key of ['me', 'spouse']) {
      const sh = shareOf(h, key);
      if (sh > 0) owners.push({ key, share: sh, age: ((inp.people || {})[key] || {}).age + (Y - y0) || 0 });
    }

    const holdY = h.acqDate ? (yearsBetween(h.acqDate, saleYM) || 0) : 0;
    const liveY = liveYearsOf(h.livePeriods, saleYM, h.acqDate);
    const salePrice = (s.price || 0) * 억 * Math.pow(1 + (inp.assumptions.marketGrowth || 0) / 100, Y - y0);
    const suspended = heavySuspendedAt(saleDate) || !!s.contractBefore;

    // 오류 4 (조특법 §71의3): 고령자 특례 법정 요건 전부 검증 — 미충족 시 미적용 + 사유 표시
    let seniorOk = false, seniorWhy = [];
    if (s.seniorMove) {
      const contLive = (function () { // 양도일 현재 '계속 거주 중' 기간 (열린 구간)
        for (const pr of (h.livePeriods || [])) {
          if (pr.from && !pr.to) {
            const yv = yearsBetween(pr.from, saleYM);
            if (yv != null && ymVal(ym(pr.from)) <= ymVal(ym(saleYM))) return yv;
          }
        }
        return 0;
      })();
      const ageAt = owners.length ? Math.max.apply(null, owners.map(o => o.age || 0)) : 0;
      if (!(Y === 2027 || Y === 2028) || scen !== 'reform') seniorWhy.push('적용기간(2027~2028년 양도, 정부안) 아님');
      if (!stat.one) seniorWhy.push('1세대 1주택 아님');
      if (!metroHouse) seniorWhy.push('수도권 소재 주택 아님');
      if (ageAt < 65) seniorWhy.push('양도일 기준 65세 미만');
      if (contLive < 2) seniorWhy.push(`양도일 현재 계속 거주 2년 미충족(${contLive.toFixed(1)}년)`);
      if (liveY < 5) seniorWhy.push(`총 거주기간 5년 미충족(${liveY.toFixed(1)}년)`);
      seniorOk = seniorWhy.length === 0;
    }

    const yd = yangdoCore({
      year: Y, scen,
      sale: salePrice, acq: (h.acqPrice || 0) * 억, cost: (s.cost || 0) * 만,
      holdY, liveY,
      isOne: stat.one, needLive, liveWaived: sangYes,
      heavyCount: (!stat.one && heavyAdj && !suspended) ? Math.min(3, inp.houses.length + rc) : 0,
      fullPrice: salePrice,
      owners,
      sameYearOther: !!s.sameYearOther,
      usedBasicDed: (s.usedBasicDed != null ? s.usedBasicDed : 250) * 만,
      seniorMove: seniorOk
    });
    if (s.seniorMove && !seniorOk) {
      yd.notes.push('고령자 지방이주 특례 미적용 — ' + seniorWhy.join(', ') + ' (조특법 §71의3 요건)');
    } else if (seniorOk) {
      yd.notes.push('고령자 지방이주 특례 적용 — 양도 후 6개월 내 비수도권 이주·5년 내 수도권 미복귀 등 사후관리 요건 미충족 시 감면세액이 추징됩니다. 한도(’27년 5억·’28년 3억)는 지분비율로 안분했습니다.');
    }
    if (!stat.one && heavyAdj && suspended) {
      yd.notes.push(s.contractBefore && !heavySuspendedAt(saleDate)
        ? '다주택 중과 — 경과규정(2026-05-09 이전 계약) 선택 적용으로 배제. 적용 가능 여부는 세무전문가 확인 필요'
        : '다주택 중과 한시 배제(2026-05-09 양도분까지) — 기본세율·장기보유특별공제 적용');
    }
    if (Y === 2026 && saleM === 5 && saleDay == null && !stat.one && heavyAdj) {
      yd.notes.push('2026년 5월 양도 — 중과 배제는 5월 9일 양도분까지입니다. 일 단위 날짜를 입력하면 정확히 판정합니다 (현재는 보수적으로 중과 적용)');
    }
    if (targetFlagged) yd.notes.push('양도 대상이 특례 표시 주택입니다 — 해당 주택 자신은 주택 수 제외 특례로 비과세를 받을 수 없어 일반 주택 수 기준으로 판정했습니다. 피상속인 보유기간 통산 등 세부 특례는 확인 필요');
    if (otherSh > 0) yd.notes.push(`제3자 지분 ${Math.round(otherSh * 100)}%의 양도세는 합계에서 제외했습니다 (본인·배우자 귀속분만 표시)`);
    if (dl && !dl.unknown && stat.temp2) yd.notes.push(`일시적 2주택 — 종전주택 처분기한 ${dl.until} (신규주택 취득 후 ${dl.years}년, '26.8.3. 이전 취득·계약분은 3년 경과조치). 기한 경과 시 특례가 해제됩니다.`);
    if (dl && !dl.unknown && !stat.temp2 && inp.houses.some(x => x.flags && x.flags.temp2)) yd.notes.push(`일시적 2주택 처분기한(${dl.until}) 경과 — 이 연도부터 특례를 해제하고 2주택으로 판정했습니다.`);
    if (dl && dl.unknown) yd.notes.push('일시적 2주택 — 신규주택 취득일이 없어 처분기한을 계산할 수 없습니다. 취득 시기를 입력해 주세요.');

    cum = Math.round(cum);
    rows.push({
      year: Y, hold: holdThis, cum, yangdo: yd, yangdoTotal: yd.total,
      grand: cum + yd.total, salePrice, holdY, liveY, before61
    });
  }
  return { house: h, rows, before61, saleMonth: saleM, saleDay, saleYear, years };
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
    const giftSangYes = h.sangsaeng === 'yes';
    const needLive = adjYes(h.adjAcq) && (!h.acqDate || h.acqDate >= '2017-08') && !giftSangYes;
    const giftSuspended = heavySuspendedAt(giftYM);
    giverYangdo = yangdoCore({
      year: giftYear, scen: 'current',
      sale: debt, acq: acqPortion, cost: 0,
      holdY, liveY,
      isOne: stat.one, needLive, liveWaived: giftSangYes,
      heavyCount: (!stat.one && adjYes(h.adjNow) && !giftSuspended) ? Math.min(3, houses.length + rc) : 0,
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
  const pubNow = houses.reduce((s, h) => s + pubOf(h), 0);

  /* 오류 3 (2026-08-13): 기준시점을 계산 연도별로 다시 잡는다.
     2026년의 거주 상태를 2028년 개편안에 재사용하면 안 됨.
     공동명의 1주택 실효 문턱 = max(인별 과세 문턱, 공동명의 특례 문턱)
     — 납세자는 유리한 방식을 고를 수 있으므로 둘 중 큰 값에서 과세가 시작된다. */
  function thrFor(scen, year) {
    const P = jongParams(year, scen);
    const asOf = `${year}-06`;
    const stat = oneStatusOf(houses, 0, asOf);
    const mainH = mainHouseOf(houses, asOf);
    const oneLive = mainH ? liveNowOf(mainH.livePeriods, asOf) : false;
    const tps = ['me', 'spouse'].map(k => houses.filter(h => shareOf(h, k) > 0));
    const both = tps.every(list => list.length === houses.length && list.length > 0);
    if (stat.one && both) {
      const shares = ['me', 'spouse'].map(k => shareOf(houses[0], k)).filter(s => s > 0);
      const live = liveNowOf(houses[0].livePeriods, asOf);
      const indivStart = Math.min.apply(null, shares.map(s => P.dedJointOneIndiv(live) / s)); // 9·1: 1인당 9억/6억 ÷ 지분
      const specialStart = P.dedOne(live);
      return Math.max(indivStart, specialStart);
    }
    if (stat.one) return P.dedOne(oneLive);
    let sum = 0;
    for (const k of ['me', 'spouse']) {
      const list = houses.filter(h => shareOf(h, k) > 0);
      if (!list.length) continue;
      const ps = list.reduce((s, h) => s + pubOf(h) * shareOf(h, k), 0);
      const lv = list.filter(h => liveNowOf(h.livePeriods, asOf)).reduce((s, h) => s + pubOf(h) * shareOf(h, k), 0);
      sum += P.dedMulti(ps > 0 ? lv / ps : 0);
    }
    return sum || P.dedMulti(0);
  }
  const stat = oneStatusOf(houses, 0, `${inp.assumptions.baseYear}-06`);
  const mainH0 = mainHouseOf(houses, `${inp.assumptions.baseYear}-06`);
  const oneLive = mainH0 ? liveNowOf(mainH0.livePeriods, `${inp.assumptions.baseYear}-06`) : false;

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
  const jointOne = stat.one && ['me', 'spouse'].every(k => houses.filter(h => shareOf(h, k) > 0).length === houses.length);

  /* 납세자별 문턱 (2026-09-02): 종부세는 인별 과세이므로 다주택·부부 각 1채는 세대 합이 아니라
     각 납세자의 '지분 공시가격 합계 대비 본인 공제액'이 과세 시작점이다. 유형 판정은 holdCalcYear와 동일. */
  function personThr(scen, year) {
    const P = jongParams(year, scen);
    const asOf = `${year}-06`;
    const st = oneStatusOf(houses, 0, asOf);
    const mh = mainHouseOf(houses, asOf);
    const hhLive = mh ? liveNowOf(mh.livePeriods, asOf) : false;
    const exIds = specialExcludedIds(houses, asOf);
    const core = houses.filter(h => !exIds.has(h.id));
    const both = ['me', 'spouse'].every(k => houses.filter(h => shareOf(h, k) > 0).length === houses.length);
    const out = [];
    for (const k of ['me', 'spouse']) {
      const list = houses.filter(h => shareOf(h, k) > 0);
      if (!list.length) continue;
      const ps = list.reduce((s, h) => s + pubOf(h) * shareOf(h, k), 0);
      const lv = list.filter(h => liveNowOf(h.livePeriods, asOf)).reduce((s, h) => s + pubOf(h) * shareOf(h, k), 0);
      const ratio = ps > 0 ? lv / ps : 0;
      const sole = st.one && (core.length ? core : houses).every(h => shareOf(h, k) >= 0.999);
      let type, deduct;
      if (st.one && both) { type = 'jointOneIndiv'; deduct = P.dedJointOneIndiv(liveNowOf(houses[0].livePeriods, asOf)); }
      else if (sole) { type = 'one'; deduct = P.dedOne(hhLive); }
      else { type = 'multi'; deduct = P.dedMulti(ratio); }
      out.push({ key: k, type, dedType: DED_TYPE[type], pubShare: ps, ratio, deduct, market: deduct / RULES.officialRatio,
        pct: ps > 0 ? (deduct / ps - 1) : null, over: ps > deduct });
    }
    return out;
  }
  const pc = personThr('current', inp.assumptions.baseYear);
  const pr = personThr('reform', inp.assumptions.baseYear + 2);
  const persons = pc.map(p => ({ key: p.key, label: p.key === 'spouse' ? '배우자' : '본인', pubShare: p.pubShare,
    current: p, reform: pr.find(x => x.key === p.key) || p }));
  const mode = jointOne ? 'joint-one' : (stat.one && persons.length === 1 ? 'one' : 'per-taxpayer');
  return { pubNow, current: mk(cur), reform: mk(ref), oneStatus: stat, oneLive, jointOne, mode, persons };
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
      // 방향 명시 원칙(수정 지시서 P0-1): 실제 계산이 사용자에게 유리한 방향인지
      // 불리한 방향인지를 문구에 그대로 적는다. '보수적'은 실제 보수적일 때만 쓴다.
      if (h.flags.inherit) {
        let tail = '';
        if (!h.acqDate) tail = ' 상속개시일(취득 시기)이 없어 특례를 적용하지 않았습니다(주택 수 포함, 불리한 방향) — STEP 2에서 취득 시기를 입력하면 특례를 반영합니다.';
        else if (inheritForever(h)) tail = ' 소액지분·저가주택 요건에 해당해 기간 제한 없이 제외됩니다.';
        else {
          const exp = inheritExpiryYear({ houses: [h], assumptions: inp.assumptions });
          tail = exp
            ? ` 이 입력 기준 ${exp.year}년부터(상속 5년 경과) 다주택으로 전환되어 세액이 크게 오릅니다 — 연도별 표를 확인하세요.`
            : ' 특례 기간(상속개시일부터 5년)이 끝나면 다주택으로 판정되어 세액이 크게 오릅니다.';
        }
        confirms.push({
          code: 'SPECIAL',
          msg: `${nm} — 상속주택을 종부세 1세대 1주택 판정에서 주택 수에 넣지 않고 계산했습니다(종합부동산세법 §8④, 사용자에게 유리한 방향).${tail}`
        });
      }
      if (h.flags.lowLocal) confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 지방 저가주택을 1세대 1주택 판정에서 주택 수에 넣지 않고 계산했습니다(유리한 방향). 공시가격·소재지 요건을 충족하지 못하면 다주택으로 판정됩니다.`
      });
      if (h.flags.popDecline) confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 인구감소지역 주택을 1세대 1주택 판정에서 주택 수에 넣지 않고 계산했습니다(유리한 방향). 요건 미충족 시 다주택으로 판정됩니다.`
      });
      if (h.flags.temp2) confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 일시적 2주택으로 보아 1주택 지위를 유지한 채 계산했습니다(처분기한 내 충족 가정, 유리한 방향). 기한 내 종전주택을 처분하지 못하면 다주택으로 과세됩니다.`
      });
      if (h.flags.rental) confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 등록임대주택의 합산배제 및 각종 특례는 등록시기·임대기간·가격요건 등에 따라 달라질 수 있어 자동 계산에 포함하지 않았습니다(합산 과세, 사용자에게 불리한 쪽으로 계산). 요건 충족 시 실제 세액은 이보다 낮을 수 있습니다.`
      });
      if (h.sangsaeng === 'yes') confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 상생임대주택 특례 대상으로 표시 — 양도세 비과세·장기보유특별공제의 거주요건(2년)을 충족한 것으로 보아 계산했습니다. 임대기간·임대료 인상률(5% 이내) 등 법정 요건 충족이 전제입니다.`
      });
      if (h.sangsaeng === 'unknown') confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 상생임대 특례는 임대기간, 임대료 인상률 등 별도 요건을 충족해야 합니다. 정확한 해당 여부는 별도 확인이 필요합니다. 이번 계산에는 반영하지 않았습니다(거주요건 그대로 적용).`
      });
      if (h.flags.redev) confirms.push({
        code: 'SPECIAL',
        msg: `${nm} — 재개발·재건축 및 조합원입주권은 관리처분인가일, 입주권 취득시점, 준공시점 등에 따라 보유기간 계산이 달라질 수 있습니다. 현재 시뮬레이터에서는 해당 특례를 자동 계산하지 않습니다.`
      });
    }
  });

  // 거주 충돌: 두 주택 이상에 현재 거주
  const livingNow = houses.filter(h => liveNowOf(h.livePeriods));
  if (livingNow.length > 1) confirms.push({ code: 'LIVE_DUP', msg: '두 개 이상의 주택에 현재 거주 중으로 입력되어 있습니다. 실거주는 한 곳만 가능합니다.' });

  if (inp.situation === 'unsure') confirms.push({ code: 'UNSURE', msg: '주택 수 판정이 불확실하다고 답하셨습니다 — 잠정 분류로 계산하며, 특례·권리관계에 따라 달라질 수 있습니다.' });
  if (inp.rights && (inp.rights.presale || inp.rights.occupancy)) confirms.push({ code: 'RIGHTS', msg: '분양권·입주권은 양도세·취득세 주택 수에 포함되지만 이 계산의 종부세에는 반영하지 않았습니다.' + (inp.rights.occupancy ? ' 조합원입주권은 관리처분인가일·입주권 취득시점·준공시점 등에 따라 보유기간 계산이 달라질 수 있어 해당 특례를 자동 계산하지 않습니다.' : '') });
  if (inp.rights && inp.rights.inherited) {
    const flagged = houses.some(h => h.flags && h.flags.inherit);
    confirms.push({
      code: 'INHERIT',
      msg: flagged
        ? '상속주택 특례 적용 여부는 위 주택별 안내를 확인하세요. 특례는 상속개시일부터 5년(소액지분·저가주택은 무기한)입니다.'
        : '상속주택 표시가 있으나 특례 플래그가 켜진 주택이 없어 주택 수에 포함해 계산했습니다(불리한 방향). 상속 후 5년 이내라면 STEP 2에서 해당 주택에 상속주택 특례를 표시하세요.'
    });
  }

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
    // 이슈 6C: 증여 지분은 증여자(본인) 실제 보유 지분을 초과할 수 없다
    if (h) {
      const meShare = (+(h.shares || {}).me || 0);
      if ((g.share || 0) > meShare + 0.01) errors.push({ code: 'GIFT_OVER', msg: `증여 — 증여 지분 ${g.share}%가 본인 보유 지분 ${meShare}%를 초과합니다.` });
    }
    if (!g.value) estimates.push({ code: 'GIFT_EST', msg: '증여 — 평가액을 시세 환산값으로 추정했습니다. 실제로는 유사 매매사례가액 등 시가 평가가 우선합니다.' });
  }
  if (purposes.includes('joint')) {
    const jh = houses.find(x => x.id === (inp.joint || {}).houseId) || houses[0];
    if (jh) {
      const meShare = (+(jh.shares || {}).me || 0);
      if (((inp.joint || {}).share || 0) > meShare + 0.01) errors.push({ code: 'JOINT_OVER', msg: `공동명의 전환 — 이전 지분 ${(inp.joint || {}).share}%가 본인 보유 지분 ${meShare}%를 초과합니다.` });
    }
  }
  if (purposes.includes('sell') && (inp.sell || {}).contractBefore) {
    confirms.push({ code: 'HEAVY_GRANDF', msg: '매도 — 경과규정(2026-05-09 이전 계약) 선택을 적용해 중과를 배제했습니다. 실제 적용 가능 여부는 계약·계약금 수령 시점 증빙과 함께 세무전문가 확인이 필요합니다.' });
  }
  houses.forEach((h, i) => {
    const nm = h.name || `주택 ${i + 1}`;
    if (h.flags && h.flags.lowLocal && !lowLocalEligible(h)) confirms.push({ code: 'SPECIAL_INVALID', msg: `${nm} — 지방 저가주택 표시가 있으나 요건(수도권·광역시 외 + 공시 3억 이하) 미충족으로 적용하지 않았습니다. 광역시 내 군지역 예외는 자동 판정을 지원하지 않습니다.` });
    if (h.flags && h.flags.popDecline && !popDeclineEligible(h)) confirms.push({ code: 'SPECIAL_INVALID', msg: `${nm} — 인구감소지역 표시가 있으나 자동 인정 요건(수도권·광역시 외 + 공시 4억 이하 + '26.1.1. 이후 취득) 미충족으로 적용하지 않았습니다. 인구감소지역 9억·관심지역 6억 상한과 광역시 내 군지역 예외는 지역 세부정보가 없어 자동 판정을 지원하지 않습니다(상세본 p70-71).` });
    {
      const fmv = futureMoveIn(h.livePeriods, RULES.reviewedAt.slice(0, 7));
      if (fmv) confirms.push({ code: 'FUTURE_MOVEIN', msg: `${nm} — ${ym(fmv).y}년 ${ym(fmv).m}월부터 실거주 예정으로 입력되었습니다. 그 전 연도는 비거주로 계산합니다.` });
    }
    if (shareOf(h, 'other') > 0) confirms.push({ code: 'THIRD_PARTY', msg: `${nm} — 제3자 지분 ${Math.round(shareOf(h, 'other') * 100)}%: 종부세·양도세는 본인·배우자 귀속분만 계산하며, 재산세 표시는 물건 전체 기준입니다.` });
  });
  if (purposes.includes('acquire') && (inp.acquire || {}).first) {
    confirms.push({ code: 'FIRST_HOME', msg: '생애최초 감면은 일반 한도 200만원으로 계산했습니다. 소형·인구감소지역 주택 등 일부 유형은 300만원 한도가 적용될 수 있으나 요건 확인이 필요해 자동 적용하지 않았습니다.' });
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
  // P0-2: 상속 특례 만료가 시뮬레이션 구간 안이면 전환 문장을 함께 만든다.
  let extra = null;
  const exp = inheritExpiryYear(inp);
  if (exp) {
    const i = exp.year - y0;
    const prevRef = refRows[i - 1], atRef = refRows[i];
    if (prevRef && atRef) {
      const jump = atRef.holdTax - prevRef.holdTax;
      extra = `${exp.year}년부터 ${exp.name}의 상속주택 특례(5년)가 끝나 다주택으로 전환됩니다 — 정부안 기준 보유세가 전년 대비 ${won(jump)} 늘어납니다.`;
    } else {
      extra = `${exp.year}년부터 ${exp.name}의 상속주택 특례(5년)가 끝나 다주택으로 전환됩니다.`;
    }
  }
  const cur26 = curRows[0], ref28 = refRows[2] || refRows[refRows.length - 1];
  const curJong = cur26.jong.total;
  const refJong = ref28.jong.total;
  const curHold28 = curRows[2] ? curRows[2].holdTax : cur26.holdTax;
  const refHold28 = ref28.holdTax;
  const diff = refHold28 - curHold28;

  if (valid.blocked) return { code: 'BLOCKED', head: '필수 입력을 확인해 주세요', sub: '' };

  const hasUnsure = valid.confirms.some(c => c.code === 'UNSURE');
  const hasSpecial = valid.confirms.some(c => c.code === 'SPECIAL');
  if (hasUnsure || hasSpecial) {
    // 방향 명시(수정 지시서 P0-1): 특례 표시는 요건 충족을 전제로 유리한 방향으로 반영되어 있다.
    const sub = hasSpecial
      ? '특례 표시 항목은 요건 충족을 전제로 세액이 낮아지는 방향으로 반영했습니다. 요건을 충족하지 못하면 실제 세액은 이보다 커질 수 있습니다. 항목별 방향은 아래 상태 점검을 확인하세요.'
      : '주택 수 판정이 불확실해 잠정 분류로 계산했습니다. 미확인 규제지역은 규제지역으로(보수적), 특례는 표시된 경우에만 반영했습니다.';
    return {
      code: 'UNCERTAIN',
      head: '주택 수·특례 확인 전에는 세액 범위를 확정하기 어렵습니다',
      sub, diff, extra
    };
  }
  if (curJong <= 0 && refJong <= 0) {
    if (sens && sens.nearBoundary) {
      const thr = thresholds(inp);
      const t = thr ? Math.min(thr.current.pub, thr.reform.pub) : 0;
      return {
        code: 'CONDITIONAL',
        head: `공시가격 ${eok(t)}을 초과하면 종부세 과세가 시작될 수 있습니다`,
        sub: '현재는 과세 대상이 아니지만 과세 경계에 가깝습니다. 실제 공시가격을 확인해 주세요.', diff, extra
      };
    }
    return {
      code: 'NO_CURRENT_IMPACT',
      head: '현재 입력 기준, 종합부동산세 과세 대상이 아닙니다',
      sub: '현행법과 9·1 수정 정부안 모두에서 과세 문턱(기본공제)에 미치지 않습니다.', diff, extra
    };
  }
  if (curJong <= 0 && refJong > 0) {
    return {
      code: 'TAX_STARTS',
      head: `정부안 가정 시 ${ref28.year}년부터 종부세 과세가 시작됩니다`,
      sub: `현행법에서는 과세 대상이 아니지만, 정부안 기준으로는 연 ${won(refJong)} 수준입니다.`, diff, extra
    };
  }
  if (curJong > 0 && refJong <= 0) {
    return {
      code: 'TAX_ENDS',
      head: '정부안 가정 시 종부세 과세 대상에서 제외됩니다',
      sub: `현행 기준 연 ${won(curJong)} → 정부안 기준 0원. 과세 문턱 상향의 효과입니다.`, diff, extra
    };
  }
  if (diff > 1000) {
    return {
      code: 'TAX_INCREASE',
      head: `정부안 가정 시 ${ref28.year}년 보유세가 현행 유지 대비 ${won(diff)} 증가합니다`,
      sub: '공정시장가액비율·기본공제 개편의 영향입니다. 국회 통과 여부에 따라 달라집니다.', diff, extra
    };
  }
  if (diff < -1000) {
    return {
      code: 'TAX_DECREASE',
      head: `정부안 가정 시 ${ref28.year}년 보유세가 현행 유지 대비 ${won(-diff)} 감소합니다`,
      sub: '과세 문턱·공제 개편의 효과입니다. 국회 통과 여부에 따라 달라집니다.', diff, extra
    };
  }
  return {
    code: 'NO_CHANGE',
    head: '현행과 정부안의 세부담 차이가 크지 않습니다',
    sub: '입력 기준에서는 개편 영향이 제한적입니다.', diff, extra
  };
}

/* node 테스트용 export */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DED_TYPE,
    억, 만, RULES, PROP, GIFT_RATES, GIFT_DED,
    progressive, bracketed, stepRate, ym, yearsBetween, liveYearsOf, liveNowOf,
    won, shortWon, eok, pubOf, marketOf, pubAt, marketAt, shareOf,
    propertyTax, fairRateOne, jongParams, jongPropCredit, jongbuPerson,
    holdCalcYear, holdSim, yangdoParams, yangdoCore, sellSim,
    acqBaseRate, acquisitionTax, giftAcquisitionTax, giftTaxCalc, giftFull,
    jointConvertAnalysis, thresholds, sensitivity, validateInput, confidenceGrade, conclusionOf,
    inheritExcludedAt, inheritForever, inheritExpiryYear, specialExcludedCount,
    heavySuspendedAt, lowLocalEligible, popDeclineEligible, nonMetroEligible, normalizeLivePeriods,
    temp2Deadline, temp2ActiveAt, futureMoveIn,
    JR_NORMAL, JR_HEAVY, JR_2027, JR_2028, oneStatusOf
  };
}
