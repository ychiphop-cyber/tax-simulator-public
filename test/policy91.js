'use strict';
/* ═══════════════════════════════════════════════════════════════════
   2026.9.1 국무회의 수정 세제개편 정부안 — 필수 회귀테스트 (지시서 §10)
   기대값은 엔진이 아니라 test/reference.js(법정 산식 독립 구현) 및 수기 산식으로 산출한다.
   세부담상한 간섭을 배제하기 위해 재산세 특례 유지(propFairKeep)·상승률 0으로 고정하고,
   상한이 실제로 걸리지 않았음(capped === 0)을 함께 검증한다.
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const R = require('./reference.js');
const { 억, 만 } = E;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1000 : tol);

function house(over) {
  return Object.assign({
    id: 'h' + Math.random().toString(36).slice(2, 7), name: '', area85: false, region: '서울',
    adjNow: 'yes', adjAcq: 'yes', adjSale: 'yes',
    priceMode: 'official', official: 0, market: '',
    acqPrice: 5, acqDate: '2016-05',
    ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 }, acqCause: 'buy',
    livePeriods: [], flags: { temp2: false, inherit: false, lowLocal: false, rental: false, popDecline: false }
  }, over);
}
function inputOf(houses, over) {
  return Object.assign({
    situation: 'one_live', rights: {},
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses, purposes: ['hold'],
    sell: {}, acquire: {}, joint: {}, gift: {},
    assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true, propFairKeep: true }
  }, over || {});
}
const LIVE = [{ from: '2016-05', to: '' }];
const joint = (me, sp) => ({ ownerType: 'joint', shares: { me, spouse: sp, other: 0 } });

/* 참조 계산 — 1주택 공동명의(개별납부/특례) 또는 단독 1주택, 세부담상한 미개입 가정(prevTotal 0) */
function refOne({ pub, live, year, scen, mode, share, age, holdY, liveY }) {
  const prop = R.refProp(pub, pub, true, year, true, true); // 1주택 특례 유지 가정 (urban=true, keep=true)
  const s = share == null ? 1 : share;
  const o = {
    year, scen, houseCount: 1, hasAdj: true,
    age: age || 0, holdY: holdY || 0, liveY: liveY || 0,
    pubSum: pub * s, aggPBase: pub * s * prop.fair, propMainPaid: prop.main * s, prevTotal: 0
  };
  if (mode === 'indiv') Object.assign(o, { isOne: false, jointOneIndiv: true, oneLive: live, liveShare: live ? 1 : 0 });
  else Object.assign(o, { isOne: true, oneLive: live, liveShare: live ? 1 : 0 });
  return R.refJongPerson(o);
}
const rowOf = (inp, scen, year) => E.holdSim(inp, scen).find(r => r.year === year);

/* ── TEST 1·2·3 — 비거주 단독명의 1주택 (2027 수정 정부안) ── */
console.log('\n[TEST 1~3] 비거주 단독명의 1주택 — 기본공제 12억 유지');
{
  const mk = pub => inputOf([house({ official: pub })], { situation: 'one_away' });
  // TEST 1 — 공시 11억
  const r11 = rowOf(mk(11), 'reform', 2027);
  T('TEST1 공시 11억 — 종부세 0원', r11.jong.total === 0, E.won(r11.jong.total));
  T('TEST1 기본공제 12억(9억 아님)', r11.jong.persons[0].deduct === 12 * 억, E.won(r11.jong.persons[0].deduct));
  T('TEST1 납세자 유형 one', r11.jong.persons[0].taxpayerType === 'one', r11.jong.persons[0].taxpayerType);
  // TEST 2 — 공시 12억 (경계)
  const r12 = rowOf(mk(12), 'reform', 2027);
  T('TEST2 공시 12억 — 경계값 종부세 0원', r12.jong.total === 0 && r12.jong.persons[0].base === 0, E.won(r12.jong.total));
  // TEST 3 — 공시 13억: 초과 1억 × 70%만 과세표준
  const r13 = rowOf(mk(13), 'reform', 2027);
  const p13 = r13.jong.persons[0];
  T('TEST3 공시 13억 — 과세표준 = 1억 × 70% = 7,000만', near(p13.base, 1 * 억 * 0.70), E.won(p13.base));
  T('TEST3 9억 기준 과표(2.8억)가 아님', !near(p13.base, 4 * 억 * 0.70), E.won(p13.base));
  const holdY27 = E.yearsBetween('2016-05', '2027-06');
  const ref13 = refOne({ pub: 13 * 억, live: false, year: 2027, scen: 'reform', mode: 'one', age: 56, holdY: holdY27, liveY: 0 });
  T('TEST3 세부담상한 미개입', p13.capped === 0, String(p13.capped));
  T('TEST3 종부세 = 참조 산식', near(r13.jong.total, ref13.total), `${E.won(r13.jong.total)} vs ${E.won(ref13.total)}`);
  // 2028+ 동일 적용
  const r13b = rowOf(mk(13), 'reform', 2029);
  T('TEST3 2029도 기본공제 12억', r13b.jong.persons[0].deduct === 12 * 억, E.won(r13b.jong.persons[0].deduct));
  // 실거주는 14억 그대로
  const rl = rowOf(inputOf([house({ official: 13, livePeriods: LIVE })]), 'reform', 2027);
  T('실거주 1주택 — 14억 유지', rl.jong.persons[0].deduct === 14 * 억 && rl.jong.total === 0, E.won(rl.jong.persons[0].deduct));
}

/* ── TEST 4·5 — 비거주 부부 공동명의 50:50 ── */
console.log('\n[TEST 4~5] 비거주 부부 공동명의 50:50 — 개별납부 1인당 6억');
{
  const mk = pub => inputOf([house(Object.assign({ official: pub }, joint(50, 50)))], { situation: 'one_away' });
  // TEST 4 — 공시 12억: 각 지분 6억 = 공제 6억 → 0
  const r12 = rowOf(mk(12), 'reform', 2027);
  const j12 = r12.jong.joint;
  T('TEST4 공동명의 비교 모드', r12.jong.mode === 'joint-compare', r12.jong.mode);
  T('TEST4 개별납부 각 공제 6억', j12.indiv.every(x => x.r.deduct === 6 * 억), j12.indiv.map(x => E.won(x.r.deduct)).join('/'));
  T('TEST4 개별납부 각 과표 0·세액 0', j12.indiv.every(x => x.r.base === 0 && x.r.total === 0), '');
  T('TEST4 납세자 유형 jointOneIndiv', j12.indiv.every(x => x.r.taxpayerType === 'jointOneIndiv'), '');
  T('TEST4 특례 공제 12억(비거주)', j12.special.deduct === 12 * 억, E.won(j12.special.deduct));
  T('TEST4 종부세 합계 0원', r12.jong.total === 0, E.won(r12.jong.total));
  // 문턱: 전체 공시 12억 (8억 아님)
  const thr = E.thresholds(mk(12));
  T('TEST4 개편 실효 문턱 = 12억 (8억 아님)', thr.reform.pub === 12 * 억, E.won(thr.reform.pub));
  T('TEST4 현행 실효 문턱 = 18억 (각 9억 ÷ 50%)', thr.current.pub === 18 * 억, E.won(thr.current.pub));

  // TEST 5 — 공시 14억: 개별납부(각 7억−6억) vs 특례(14억−12억) 모두 계산, 유리한 쪽
  const r14 = rowOf(mk(14), 'reform', 2027);
  const j14 = r14.jong.joint;
  const holdY27 = E.yearsBetween('2016-05', '2027-06');
  const refI = refOne({ pub: 14 * 억, live: false, year: 2027, scen: 'reform', mode: 'indiv', share: 0.5 });
  const refS = refOne({ pub: 14 * 억, live: false, year: 2027, scen: 'reform', mode: 'one', age: 56, holdY: holdY27, liveY: 0 });
  T('TEST5 개별납부 각 과표 = (7억−6억)×70% = 7,000만', j14.indiv.every(x => near(x.r.base, 0.7 * 억)), j14.indiv.map(x => E.won(x.r.base)).join('/'));
  T('TEST5 특례 과표 = (14억−12억)×70% = 1.4억', near(j14.special.base, 1.4 * 억), E.won(j14.special.base));
  T('TEST5 상한 미개입', j14.indiv.every(x => x.r.capped === 0) && j14.special.capped === 0, '');
  T('TEST5 개별납부 합 = 참조 ×2', near(j14.indivTotal, refI.total * 2), `${E.won(j14.indivTotal)} vs ${E.won(refI.total * 2)}`);
  T('TEST5 특례 = 참조', near(j14.special.total, refS.total), `${E.won(j14.special.total)} vs ${E.won(refS.total)}`);
  T('TEST5 유리한 쪽 선택 = min', j14.best === (j14.indivTotal <= j14.special.total ? 'indiv' : 'special') && near(r14.jong.total, Math.min(j14.indivTotal, j14.special.total)), '');
  // 수기 검산(개별납부 1인): 과표 7,000만 × 0.5% = 35만 − 재산세공제(top-slice) 10.125만 = 24.875만 → 농특 포함 29.85만
  T('TEST5 수기 검산 — 개별납부 1인 29.85만', near(j14.indiv[0].r.total, 29.85 * 만, 100), E.won(j14.indiv[0].r.total));
}

/* ── TEST 6 — 실거주 부부 공동명의 50:50 / 공시 18억 ── */
console.log('\n[TEST 6] 실거주 공동명의 50:50 — 1인당 9억 유지');
{
  const inp = inputOf([house(Object.assign({ official: 18, livePeriods: LIVE }, joint(50, 50)))]);
  const r = rowOf(inp, 'reform', 2027);
  const j = r.jong.joint;
  T('TEST6 개별납부 각 공제 9억 (6억으로 떨어지지 않음)', j.indiv.every(x => x.r.deduct === 9 * 억), j.indiv.map(x => E.won(x.r.deduct)).join('/'));
  T('TEST6 개별납부 종부세 0원', j.indivTotal === 0, E.won(j.indivTotal));
  T('TEST6 특례 공제 14억(실거주)', j.special.deduct === 14 * 억, E.won(j.special.deduct));
  T('TEST6 유리한 쪽 = 개별납부, 합계 0', j.best === 'indiv' && r.jong.total === 0, '');
  const thr = E.thresholds(inp);
  T('TEST6 개편 실효 문턱 18억', thr.reform.pub === 18 * 억, E.won(thr.reform.pub));
  const r28 = rowOf(inp, 'reform', 2028);
  T('TEST6 2028도 각 9억', r28.jong.joint.indiv.every(x => x.r.deduct === 9 * 억), '');
}

/* ── TEST 7 — 비거주 공동명의 60:40 / 공시 20억 ── */
console.log('\n[TEST 7] 비거주 공동명의 60:40 — 공제는 1인당 동일 6억, 과표는 지분가액 차이');
{
  const inp = inputOf([house(Object.assign({ official: 20 }, joint(60, 40)))], { situation: 'one_away' });
  const r = rowOf(inp, 'reform', 2027);
  const me = r.jong.joint.indiv.find(x => x.key === 'me').r, sp = r.jong.joint.indiv.find(x => x.key === 'spouse').r;
  T('TEST7 본인(60%) 공제 6억', me.deduct === 6 * 억, E.won(me.deduct));
  T('TEST7 배우자(40%) 공제 6억 (2.4억 안분 아님)', sp.deduct === 6 * 억, E.won(sp.deduct));
  T('TEST7 본인 과표 = (12억−6억)×70% = 4.2억', near(me.base, 4.2 * 억), E.won(me.base));
  T('TEST7 배우자 과표 = (8억−6억)×70% = 1.4억', near(sp.base, 1.4 * 억), E.won(sp.base));
  const refMe = refOne({ pub: 20 * 억, live: false, year: 2027, scen: 'reform', mode: 'indiv', share: 0.6 });
  const refSp = refOne({ pub: 20 * 억, live: false, year: 2027, scen: 'reform', mode: 'indiv', share: 0.4 });
  T('TEST7 상한 미개입', me.capped === 0 && sp.capped === 0, '');
  T('TEST7 본인 세액 = 참조', near(me.total, refMe.total), `${E.won(me.total)} vs ${E.won(refMe.total)}`);
  T('TEST7 배우자 세액 = 참조', near(sp.total, refSp.total), `${E.won(sp.total)} vs ${E.won(refSp.total)}`);
  // 2028: 조정지역 개별납부 FMV 80% (문답 p.45) 유지 — 공제만 6억
  const r28 = rowOf(inp, 'reform', 2028);
  const me28 = r28.jong.joint.indiv.find(x => x.key === 'me').r;
  T('TEST7 2028 본인 공제 6억 · 과표 (12억−6억)×80%', me28.deduct === 6 * 억 && near(me28.base, 4.8 * 억), `${E.won(me28.deduct)} / ${E.won(me28.base)}`);
  // 문턱: 60% 보유자 6억÷0.6 = 10억 < 특례 12억 → 실효 12억
  const thr = E.thresholds(inp);
  T('TEST7 실효 문턱 = max(10억, 12억) = 12억', thr.reform.pub === 12 * 억, E.won(thr.reform.pub));
}

/* ── TEST 8 — 일반 다주택 회귀: dedMulti 불변 ── */
console.log('\n[TEST 8] 일반 다주택 — 4억 + 5억 × 거주주택 비중 규칙 불변');
{
  // 2주택 단독명의: 15억(거주) + 10억 → 거주 비중 0.6 → 7억
  const two = inputOf([house({ official: 15, livePeriods: LIVE }), house({ official: 10, acqDate: '2019-03' })], { situation: 'two' });
  for (const y of [2027, 2028, 2029]) {
    const p = rowOf(two, 'reform', y).jong.persons[0];
    T(`TEST8 2주택 ${y} 공제 = 4억+5억×0.6 = 7억`, near(p.deduct, 7 * 억), E.won(p.deduct));
    T(`TEST8 2주택 ${y} 납세자 유형 multi`, p.taxpayerType === 'multi', p.taxpayerType);
  }
  // 3주택 전부 비거주 → 4억
  const three = inputOf([house({ official: 8 }), house({ official: 6, acqDate: '2019-03' }), house({ official: 5, acqDate: '2021-01' })], { situation: 'multi' });
  const p3 = rowOf(three, 'reform', 2028).jong.persons[0];
  T('TEST8 3주택 비거주 공제 4억 (6억 아님)', p3.deduct === 4 * 억, E.won(p3.deduct));
  T('TEST8 3주택 과표 = (19억−4억)×80%', near(p3.base, 15 * 억 * 0.80), E.won(p3.base));
  // 부부가 각각 다른 집을 100% 보유(공동명의 아님) → 각자 dedMulti
  const sep = inputOf([house({ official: 12, livePeriods: LIVE }), house({ official: 9, acqDate: '2019-03', ownerType: 'spouse', shares: { me: 0, spouse: 100, other: 0 } })], { situation: 'two' });
  const r = rowOf(sep, 'reform', 2027);
  T('TEST8 부부 각 1채(공동명의 아님) — per-taxpayer 모드', r.jong.mode === 'per-taxpayer', r.jong.mode);
  T('TEST8 본인(거주 12억) 공제 9억 · 배우자(비거주 9억) 공제 4억',
    r.jong.persons.find(p => p.taxpayer === 'me').deduct === 9 * 억 && r.jong.persons.find(p => p.taxpayer === 'spouse').deduct === 4 * 억,
    r.jong.persons.map(p => E.won(p.deduct)).join('/'));
  // 현행 시나리오 불변
  T('TEST8 현행 다주택 공제 9억', rowOf(two, 'current', 2026).jong.persons[0].deduct === 9 * 억, '');
}

/* ── TEST 9 — 세부담상한 150% ── */
console.log('\n[TEST 9] 종부세 세부담상한 — 200% 상향안 철회, 150%');
{
  const base = { pubSum: 50 * 억, houseCount: 3, hasAdj: true, isOne: false, liveShare: 0, aggPBase: 30 * 억, avgFair: 0.6, propMainPaid: 500 * 만, prevTotal: 1000 * 만, age: 55, holdY: 10, liveY: 0 };
  for (const [year, scen] of [[2027, 'reform'], [2028, 'reform'], [2030, 'reform'], [2026, 'current']]) {
    const d = E.jongbuPerson(Object.assign({ year, scen }, base));
    const ref = R.refJongPerson(Object.assign({ year, scen }, base));
    T(`TEST9 ${scen} ${year} — 산출세액이 충분히 큼(상한 발동)`, d.capped > 0, E.won(d.capped));
    T(`TEST9 ${scen} ${year} — 재산세+종부세 = 전년 1,000만 × 150% = 1,500만`, near(d.tax + base.propMainPaid, 1500 * 만), E.won(d.tax + base.propMainPaid));
    T(`TEST9 ${scen} ${year} — 200% 기준(2,000만)이 아님`, !near(d.tax + base.propMainPaid, 2000 * 만), '');
    T(`TEST9 ${scen} ${year} — 참조 일치`, near(d.tax, ref.tax), `${E.won(d.tax)} vs ${E.won(ref.tax)}`);
  }
  T('TEST9 jongParams burdenCap 전부 1.50', [E.jongParams(2026, 'current'), E.jongParams(2027, 'reform'), E.jongParams(2028, 'reform'), E.jongParams(2030, 'reform')].every(P => P.burdenCap === 1.5), '');
}

/* ── 정책 메타 ── */
console.log('\n[메타] 정책 기준일·상태');
{
  T('규칙 버전 2026.09.01', /2026\.09\.01/.test(E.RULES.version), E.RULES.version);
  T('정부안 status = draft_proposal (enacted 아님)', E.RULES.policy.reform.status === 'draft_proposal', E.RULES.policy.reform.status);
  T('정부안 배지에 9·1 수정 · 국회 심의 전', /9·1/.test(E.RULES.policy.reform.badge) && /국회 심의 전/.test(E.RULES.policy.reform.badge), E.RULES.policy.reform.badge);
  T('정책 이력에 8·3 · 9·1 모두 보존', E.RULES.policyHistory.length >= 2 && E.RULES.policyHistory.some(p => p.date === '2026-08-03') && E.RULES.policyHistory.some(p => p.date === '2026-09-01'), '');
}

console.log(`\n9·1 정책 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
