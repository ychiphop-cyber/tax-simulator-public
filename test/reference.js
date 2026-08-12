'use strict';
/* ═══════════════════════════════════════════════════════════════════
   테스트용 독립 참조 계산 (지시서 §10 옵션 2)
   — 엔진 코드를 import하지 않고, 공식 세율표·법정 산식을 이 파일에
     다시 옮겨 적어 구현한다. 엔진과 식이 일치하는지 검증하는 용도.
   기준: 2026 현행법 + 2026-08-03 정부안(국회 심의 전)
   ═══════════════════════════════════════════════════════════════════ */
const 억 = 1e8, 만 = 1e4;

function prog(base, table) { // [[상한, 세율, 누진공제]]
  if (base <= 0) return 0;
  for (const [cap, r, d] of table) if (base <= cap) return Math.max(0, base * r - (d || 0));
  return 0;
}
function brk(base, table) { // 구간 누적 [[상한, 세율]]
  if (base <= 0) return 0;
  let t = 0, prev = 0;
  for (const [cap, r] of table) {
    const s = Math.min(base, cap) - prev;
    if (s > 0) t += s * r;
    prev = cap;
    if (base <= cap) break;
  }
  return t;
}

/* ── 재산세 (지방세법 §110·§110의2·§111·§111의2, 2026 현행) ────────── */
const P_STD = [[0.6 * 억, 0.0010, 0], [1.5 * 억, 0.0015, 3 * 만], [3 * 억, 0.0025, 18 * 만], [Infinity, 0.0040, 63 * 만]];
const P_SPEC = [[0.6 * 억, 0.0005, 0], [1.5 * 억, 0.0010, 3 * 만], [3 * 억, 0.0020, 18 * 만], [Infinity, 0.0035, 63 * 만]];
function refFair(pub, oneHH, year, keep) {
  if (!oneHH) return 0.60;
  if (year >= 2027 && !keep) return 0.60; // 특례비율 일몰 가정 (시뮬레이터 기본 가정)
  return pub <= 3 * 억 ? 0.43 : pub <= 6 * 억 ? 0.44 : 0.45;
}
/** 과세표준상한(§110의2): 상한액 = 직전연도 시가표준액×당해 공정시장가액비율 + 당해 과표×5% */
function refProp(pub, prevPub, oneHH, year, urban = true, keep = false) {
  const fair = refFair(pub, oneHH, year, keep);
  const raw = pub * fair;
  let base = raw, capBase = null, capped = false;
  if (prevPub != null && prevPub > 0) {
    capBase = prevPub * fair + raw * 0.05;
    if (raw > capBase) { base = capBase; capped = true; }
  }
  const spec = oneHH && pub <= 9 * 억;
  const main = prog(base, spec ? P_SPEC : P_STD);
  const city = urban ? base * 0.0014 : 0;
  const edu = main * 0.20;
  return { fair, raw, capBase, capped, base, spec, main, city, edu, total: main + city + edu };
}

/* ── 종부세 (현행 + 정부안) ───────────────────────────────────────── */
const J_NORM = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .010], [25 * 억, .013], [50 * 억, .015], [94 * 억, .020], [Infinity, .027]];
const J_HEAVY = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .010], [25 * 억, .020], [50 * 억, .030], [94 * 억, .040], [Infinity, .050]];
const J_2027 = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .013], [25 * 억, .015], [50 * 억, .020], [94 * 억, .027], [Infinity, .035]];
const J_2028 = [[3 * 억, .005], [6 * 억, .007], [12 * 억, .013], [25 * 억, .020], [50 * 억, .030], [94 * 억, .040], [Infinity, .050]];
const AGE_C = a => a >= 70 ? .40 : a >= 65 ? .30 : a >= 60 ? .20 : 0;
const PER_C = y => y >= 15 ? .50 : y >= 10 ? .40 : y >= 5 ? .20 : 0;
const HALF_C = y => y >= 15 ? .25 : y >= 10 ? .20 : y >= 5 ? .10 : 0;

function refJongParams(year, scen) {
  if (scen === 'current' || year <= 2026) return { dedOne: () => 12 * 억, dedMulti: () => 9 * 억, fair: () => .60, tbl: n => n >= 3 ? J_HEAVY : J_NORM, mode: 'hold', bc: 1.5, cap: Infinity };
  if (year === 2027) return { dedOne: l => l ? 14 * 억 : 9 * 억, dedMulti: ls => 4 * 억 + 5 * 억 * ls, fair: () => .70, tbl: n => n >= 3 ? J_HEAVY : J_2027, mode: 'max', bc: 2.0, cap: 800 * 만 };
  return { dedOne: l => l ? 14 * 억 : 9 * 억, dedMulti: ls => 4 * 억 + 5 * 억 * ls, fair: (n, adj, one) => one ? .70 : ((n >= 3 || adj) ? .80 : .70), tbl: () => J_2028, mode: 'live', bc: 2.0, cap: 600 * 만 };
}
/** 납세자 1인 종부세 — aggPBase: 지분 기준 명목 재산세 과표 합, propMainPaid: 지분 기준 재산세 본세 */
function refJongPerson(o) {
  const P = refJongParams(o.year, o.scen);
  const ded = o.isOne ? P.dedOne(!!o.oneLive) : P.dedMulti(o.liveShare || 0);
  if (o.pubSum <= ded) return { deduct: ded, base: 0, gross: 0, propCredit: 0, credit: 0, tax: 0, rural: 0, total: 0, burdenBase: o.propMainPaid };
  const fair = P.fair(o.houseCount, !!o.hasAdj, !!o.isOne);
  const base = (o.pubSum - ded) * fair;
  const gross = brk(base, P.tbl(o.houseCount));
  // 공제할 재산세액 — 상단 구간 차감(top-slice)
  const slice = Math.min(o.aggPBase, base * (o.aggPBase / o.pubSum));
  const pc = Math.max(0, Math.min(
    prog(o.aggPBase, P_STD) - prog(Math.max(0, o.aggPBase - slice), P_STD),
    o.propMainPaid, gross));
  let tax = gross - pc;
  let credit = 0;
  if (o.isOne) {
    const pr = P.mode === 'hold' ? PER_C(o.holdY || 0) : P.mode === 'live' ? PER_C(o.liveY || 0) : Math.max(HALF_C(o.holdY || 0), PER_C(o.liveY || 0));
    let c = tax * Math.min(.80, AGE_C(o.age || 0) + pr);
    if (o.scen === 'reform' && o.year >= 2027 && c > P.cap) c = P.cap;
    credit = c;
    tax -= c;
  }
  if (o.prevTotal > 0) {
    const lim = o.prevTotal * P.bc;
    if (o.propMainPaid + tax > lim) tax = Math.max(0, lim - o.propMainPaid);
  }
  tax = Math.max(0, tax);
  return { deduct: ded, fair, base, gross, propCredit: pc, credit, tax, rural: tax * .2, total: tax * 1.2, burdenBase: o.propMainPaid + tax };
}

/* ── 양도소득세 (소득세법 §55·§95·§104, 2026 현행 + 정부안) ────────── */
const INC = [[1400 * 만, .06, 0], [5000 * 만, .15, 126 * 만], [8800 * 만, .24, 576 * 만],
[1.5 * 억, .35, 1544 * 만], [3 * 억, .38, 1994 * 만], [5 * 억, .40, 2594 * 만], [10 * 억, .42, 3594 * 만], [Infinity, .45, 6594 * 만]];
function refLtcgTables(year, scen) {
  if (scen === 'current' || year <= 2026 || year === 2027) return { one: { live: .04, liveMax: .40, hold: .04, holdMax: .40 }, gen: { mode: 'hold', hold: .02, holdMax: .30 } };
  if (year === 2028) return { one: { live: .06, liveMax: .60, hold: .02, holdMax: .20 }, gen: { mode: 'max', hold: .01, holdMax: .15, live: .02, liveMax: .30 } };
  return { one: { live: .08, liveMax: .80, hold: 0, holdMax: 0 }, gen: { mode: 'live', live: .02, liveMax: .30, minLive: 2 } };
}
function refSur(year, scen, cnt) {
  const t = (scen === 'current' || year <= 2026) ? { 2: .20, 3: .30 }
    : year === 2027 ? { 2: .05, 3: .10 } : year === 2028 ? { 2: .10, 3: .15 } : { 2: .20, 3: .30 };
  return cnt >= 3 ? t[3] : t[2];
}
/** 단일 소유자(share 반영) 양도세 — heavy는 호출자가 유예 판정 후 전달 */
function refYangdo(o) {
  const gain = o.sale - o.acq - (o.cost || 0);
  if (gain <= 0) return { tax: 0, local: 0, total: 0, ltcgRate: 0 };
  const exempt = !!o.isOne && o.holdY >= 2 && (!o.needLive || o.liveY >= 2);
  if (exempt && o.sale <= 12 * 억) return { tax: 0, local: 0, total: 0, exempt: true, ltcgRate: 0 };
  const ratio = exempt ? (o.sale - 12 * 억) / o.sale : 1;
  const hY = Math.floor(o.holdY), lY = Math.floor(o.liveY || 0);
  const T = refLtcgTables(o.year, o.scen);
  let rate = 0, holdR = 0, liveR = 0;
  if (o.holdY >= 2 && !o.heavy) {
    if (exempt && lY >= 2 && hY >= 3) {
      liveR = Math.min(T.one.liveMax, T.one.live * lY);
      holdR = Math.min(T.one.holdMax, T.one.hold * hY);
      rate = Math.min(.80, liveR + holdR);
    } else if (hY >= 3) {
      if (T.gen.mode === 'hold') rate = holdR = Math.min(T.gen.holdMax, T.gen.hold * hY);
      else if (T.gen.mode === 'max') rate = Math.max(holdR = Math.min(T.gen.holdMax, T.gen.hold * hY), liveR = Math.min(T.gen.liveMax, T.gen.live * lY));
      else rate = liveR = (lY >= (T.gen.minLive || 0)) ? Math.min(T.gen.liveMax, T.gen.live * lY) : 0;
    }
  }
  const share = o.share == null ? 1 : o.share;
  const taxable = gain * share * ratio;
  let ltcg = taxable * rate;
  const capT = (o.scen === 'reform') ? (o.year >= 2029 ? 10 * 억 : o.year === 2028 ? 20 * 억 : Infinity) : Infinity;
  if (ltcg > capT * share) ltcg = capT * share;
  const bd = o.noBasic ? 0 : (o.bigDed ? 2500 * 만 : 250 * 만);
  const base = Math.max(0, taxable - ltcg - bd);
  let gross = 0;
  if (base > 0) {
    if (o.holdY < 1) gross = base * .70;
    else if (o.holdY < 2) gross = base * .60;
    else {
      const sur = o.heavy ? refSur(o.year, o.scen, o.heavyCount || 2) : 0;
      for (const [cap, r, d] of INC) if (base <= cap) { gross = Math.max(0, base * (r + sur) - d); break; }
    }
  }
  const tax = Math.max(0, gross);
  return { exempt, ratio, holdR, liveR, ltcgRate: rate, ltcg, base, tax, local: tax * .1, total: tax * 1.1 };
}

/* ── 증여세 (상증세법 §26·§53·§55) ────────────────────────────────── */
const G_RATES = [[1 * 억, .10, 0], [5 * 억, .20, 1000 * 만], [10 * 억, .30, 6000 * 만], [30 * 억, .40, 1.6 * 억], [Infinity, .50, 4.6 * 억]];
const G_DED = { spouse: 6 * 억, child: 5000 * 만, minor: 2000 * 만, parent: 5000 * 만, other: 1000 * 만 };
function refGift(value, debt, rel, prior) {
  const ded = G_DED[rel] != null ? G_DED[rel] : G_DED.other;
  const taxable = Math.max(0, value - (debt || 0));
  const bNow = Math.max(0, taxable + (prior || 0) - ded);
  const bPrev = Math.max(0, (prior || 0) - ded);
  const gross = prog(bNow, G_RATES) - prog(bPrev, G_RATES);
  return { taxable, gross, tax: Math.max(0, gross * 0.97) };
}

/* ── 취득세 (지방세법 §11·§13의2, 2026 현행) ─────────────────────── */
function refAcqRate(price) {
  if (price <= 6 * 억) return .01;
  if (price <= 9 * 억) return Math.round(((price / 억) * 2 / 3 - 3) * 1e5) / 1e5 / 100;
  return .03;
}
function refAcq(price, cnt, adj, big85, temp2, first) {
  const eff = temp2 ? 1 : cnt;
  let rate, heavy = 0;
  if (eff <= 1) rate = refAcqRate(price);
  else if (adj) { rate = eff === 2 ? .08 : .12; heavy = rate; }
  else if (eff === 2) rate = refAcqRate(price);
  else { rate = eff === 3 ? .08 : .12; heavy = rate; }
  let main = price * rate, cut = 0;
  if (first && eff <= 1 && price <= 12 * 억) { cut = Math.min(main, 200 * 만); main -= cut; }
  const edu = price * (heavy ? .004 : rate * .10);
  const rural = big85 ? price * (heavy === .12 ? .010 : heavy === .08 ? .006 : .002) : 0;
  return { rate, main, cut, edu, rural, total: main + edu + rural };
}

module.exports = { 억, 만, prog, brk, refFair, refProp, refJongParams, refJongPerson, refYangdo, refGift, refAcq, refAcqRate, refLtcgTables, refSur, P_STD, P_SPEC };
