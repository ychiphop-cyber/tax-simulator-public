'use strict';
/* ═══════════════════════════════════════════════════════════════════
   2026-08-12 점검 지시서 — 이슈별 재현·수정 검증 테스트
   기대값은 엔진 출력 복사가 아니라 지시서 제시값 또는 test/reference.js
   (법정 산식 독립 구현)으로 산출했다. 첫 실행에서 실패 = 이슈 재현.
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const R = require('./reference.js');
const { 억, 만 } = E;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 만 : tol); }

function house(over) {
  return Object.assign({
    id: 'h1', name: '', area85: false, region: '서울',
    adjNow: 'yes', adjAcq: 'yes', adjSale: 'yes',
    priceMode: 'official', official: 0, market: '',
    acqPrice: 0, acqDate: '2016-05',
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
    assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true }
  }, over || {});
}

/* ───────────────────────────────────────────────────────────────────
   이슈 1 · 다주택 중과 유예(~2026-05-09) 미반영
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[이슈 1] 다주택 양도세 중과 유예 종료일(2026-05-09) 반영');
{
  const mk = (date, adj) => {
    const inp = inputOf([
      house({ id: 's1', official: 14, acqPrice: 5, acqDate: '2010-06', adjNow: adj, adjSale: adj }),
      house({ id: 's2', official: 9, acqPrice: 4, acqDate: '2018-03', adjNow: adj, adjSale: adj })
    ], { situation: 'two', purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 's1', date, price: 20, cost: 0, sameYearOther: false, seniorMove: false };
    return inp;
  };
  // 참조값: 유예 중(중과 배제) → 일반 장특 30% (보유 16년), 기본세율
  const refSusp = R.refYangdo({ year: 2026, scen: 'current', sale: 20 * 억, acq: 5 * 억, cost: 0, holdY: 15.75, liveY: 0, isOne: false, heavy: false });
  // 참조값: 유예 종료 후(중과) → 장특 배제 + 기본세율 +20%p
  const refHeavy = R.refYangdo({ year: 2026, scen: 'current', sale: 20 * 억, acq: 5 * 억, cost: 0, holdY: 16.1, liveY: 0, isOne: false, heavy: true, heavyCount: 2 });

  const r0326 = E.sellSim(mk('2026-03-15', 'yes'), 'current').rows[0];
  T('2026-03 양도(조정 2주택) — 중과 미적용', (r0326.yangdo.surcharge || 0) === 0, `sur=${r0326.yangdo.surcharge}`);
  T('2026-03 양도 — 장특공제 30% 적용', near(r0326.yangdo.ltcgRate, 0.30, 1e-9), `rate=${r0326.yangdo.ltcgRate}`);
  T('2026-03 양도 — 세액 ≈ 참조 4억4,598만', near(r0326.yangdo.total, refSusp.total, 2 * 만), `${(r0326.yangdo.total / 만).toFixed(0)}만 vs ${(refSusp.total / 만).toFixed(0)}만`);

  const r0509 = E.sellSim(mk('2026-05-09', 'yes'), 'current').rows[0];
  T('2026-05-09 양도 — 중과 미적용(마지막 날)', (r0509.yangdo.surcharge || 0) === 0, `sur=${r0509.yangdo.surcharge}`);
  const r0510 = E.sellSim(mk('2026-05-10', 'yes'), 'current').rows[0];
  T('2026-05-10 양도 — 중과 적용(+20%p)', near(r0510.yangdo.surcharge || 0, 0.20, 1e-9), `sur=${r0510.yangdo.surcharge}`);
  T('2026-05-10 양도 — 장특 배제', (r0510.yangdo.ltcgRate || 0) === 0, `rate=${r0510.yangdo.ltcgRate}`);
  T('2026-05-10 양도 — 세액 ≈ 참조(중과)', near(r0510.yangdo.total, refHeavy.total, 2 * 만), `${(r0510.yangdo.total / 만).toFixed(0)}만 vs ${(refHeavy.total / 만).toFixed(0)}만`);

  const rNoAdj = E.sellSim(mk('2026-07-15', 'no'), 'current').rows[0];
  T('비조정 2주택 — 시기 무관 중과 없음', (rNoAdj.yangdo.surcharge || 0) === 0, `sur=${rNoAdj.yangdo.surcharge}`);

  const inp3 = mk('2026-07-15', 'yes');
  inp3.houses.push(house({ id: 's3', official: 7, acqPrice: 3, acqDate: '2020-01' }));
  const r3h = E.sellSim(inp3, 'current').rows[0];
  T('3주택 · 유예 종료 후 — +30%p', near(r3h.yangdo.surcharge || 0, 0.30, 1e-9), `sur=${r3h.yangdo.surcharge}`);

  const inpC = mk('2026-09-15', 'yes');
  inpC.sell.contractBefore = true; // 경과규정(2026-05-09 이전 계약) 선택 입력
  const rC = E.sellSim(inpC, 'current').rows[0];
  T('경과규정 선택 시 — 종료 후 양도에도 배제 유지', (rC.yangdo.surcharge || 0) === 0, `sur=${rC.yangdo.surcharge}`);
  T('경과규정 미선택(위 2026-07) — 중과 유지', near(E.sellSim(mk('2026-07-15', 'yes'), 'current').rows[0].yangdo.surcharge || 0, 0.20, 1e-9));
}

/* ───────────────────────────────────────────────────────────────────
   이슈 2 · 6/1 이전 매도 시 과거 연도 누적 보유세 소실
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[이슈 2] 매도 연도별 누적 보유세 — 과거 연도 보존 · 6/1 일 단위 판정');
{
  const mk = date => {
    const inp = inputOf([house({ id: 'b1', official: 30, acqPrice: 10, acqDate: '2010-05', livePeriods: [{ from: '2010-05', to: '' }] })],
      { purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'b1', date, price: 50, cost: 3000, sameYearOther: false, seniorMove: false };
    return inp;
  };
  const inp = mk('2026-03-15');
  const full = E.holdSim(inp, 'current');
  const sim = E.sellSim(inp, 'current');
  T('3월 매도: 매도 연도(2026) 보유세 제외', near(sim.rows[0].cum, 0, 1), `cum2026=${sim.rows[0].cum}`);
  T('3월 매도: 2027년 매도 행 누적 = 2026 전체 보유세', near(sim.rows[1].cum, full[0].holdTax, 1),
    `${(sim.rows[1].cum / 만).toFixed(1)}만 vs ${(full[0].holdTax / 만).toFixed(1)}만`);
  const expCum2030 = full[0].holdTax + full[1].holdTax + full[2].holdTax + full[3].holdTax;
  T('3월 매도: 2030년 매도 행 누적 = 2026~29 전체 합', near(sim.rows[4].cum, expCum2030, 1),
    `${(sim.rows[4].cum / 만).toFixed(1)}만 vs ${(expCum2030 / 만).toFixed(1)}만`);
  T('과거 누적이 전부 0이 아님 (보고된 버그)', sim.rows[4].cum > 100 * 만, `cum=${sim.rows[4].cum}`);

  const s531 = E.sellSim(mk('2026-05-31'), 'current');
  T('5/31 매도 — 그해 보유세 제외', near(s531.rows[0].hold, 0, 1), String(s531.rows[0].hold));
  const s601 = E.sellSim(mk('2026-06-01'), 'current');
  T('6/1 매도 — 과세기준일 잔금 시 매수자 부담(제외)', near(s601.rows[0].hold, 0, 1), String(s601.rows[0].hold));
  const s602 = E.sellSim(mk('2026-06-02'), 'current');
  T('6/2 매도 — 그해 보유세 매도자 부담(포함)', near(s602.rows[0].hold, full[0].holdTax, 1), String(s602.rows[0].hold));
  const s12 = E.sellSim(mk('2026-12-15'), 'current');
  T('12월 매도 — 포함', near(s12.rows[0].hold, full[0].holdTax, 1));

  // 다주택: 매도 대상 외 주택의 보유세는 매도 연도에도 유지
  const inp2 = mk('2027-03-15');
  inp2.houses.push(house({ id: 'b2', official: 10, acqPrice: 5, acqDate: '2019-01' }));
  inp2.situation = 'two';
  const full2 = E.holdSim(inp2, 'current');
  const ex2 = E.holdSim(inp2, 'current', { excludeId: 'b1' });
  const sim2 = E.sellSim(inp2, 'current');
  T('다주택 3월 매도: 매도 연도 = 잔여 주택 보유세만', near(sim2.rows[1].hold, ex2[1].holdTax, 1),
    `${(sim2.rows[1].hold / 만).toFixed(1)}만 vs ${(ex2[1].holdTax / 만).toFixed(1)}만`);
  T('다주택: 매도 전 연도는 전체 보유세', near(sim2.rows[1].cum, full2[0].holdTax + ex2[1].holdTax, 1));
}

/* ───────────────────────────────────────────────────────────────────
   이슈 3 · 재산세 과세표준상한 산식 (지방세법 §110의2)
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[이슈 3] 과세표준상한 = 직전연도 시가표준액×당해 공정시장가액비율 + 당해 과표×5%');
{
  const inp = inputOf([house({ official: 8, acqPrice: 4, acqDate: '2015-01', livePeriods: [{ from: '2015-01', to: '' }] })]);
  const cur = E.holdSim(inp, 'current');
  const r27 = cur[1].prop.rows[0].pt;
  T('공시 8억 · 상승 0% · 2027 과표 = 4.8억 (상한 미적용)', near(r27.base, 4.8 * 억, 1000), `base=${(r27.base / 억).toFixed(3)}억`);
  T('2027 재산세 합계 ≈ 1,932,000 (특례세율)', near(cur[1].prop.total, 193.2 * 만, 1000), `${(cur[1].prop.total / 만).toFixed(1)}만`);
  // 참조 대조
  const ref = R.refProp(8 * 억, 8 * 억, true, 2027);
  T('참조 계산과 일치', near(cur[1].prop.total, ref.total, 100), `ref=${(ref.total / 만).toFixed(1)}만`);

  // 상승 시나리오 (지시서 필수: -10/0/5/20/50%)
  for (const g of [-10, 0, 5, 20, 50]) {
    const v = inputOf([house({ official: 8, acqPrice: 4, acqDate: '2015-01', livePeriods: [{ from: '2015-01', to: '' }] })]);
    v.assumptions.officialGrowth = g;
    const rows = E.holdSim(v, 'current');
    let prevPub = 8 * 억 / (1 + g / 100); // 2025 시가표준액
    let ok = true, det = '';
    for (let i = 0; i < rows.length; i++) {
      const pub = 8 * 억 * Math.pow(1 + g / 100, i);
      const rf = R.refProp(pub, prevPub, true, 2026 + i);
      const pt = rows[i].prop.rows[0].pt;
      if (!near(pt.base, rf.base, 1000) || !near(pt.main, rf.main, 100)) { ok = false; det = `${2026 + i}: base ${(pt.base / 억).toFixed(3)} vs ref ${(rf.base / 억).toFixed(3)}`; break; }
      prevPub = pub;
    }
    T(`상승률 ${g}% — 전 연도 과표·본세가 참조와 일치`, ok, det);
  }
}

/* ───────────────────────────────────────────────────────────────────
   이슈 4 · 부부 공동명의 특례 납세의무자 선택 (50:50 합의 선택)
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[이슈 4] 공동명의 1주택 특례 — 50:50 시 유리한 배우자 선택');
{
  const inp = inputOf([house({
    official: 35, acqPrice: 10, acqDate: '2010-05', ownerType: 'joint',
    shares: { me: 50, spouse: 50, other: 0 }, livePeriods: [{ from: '2010-05', to: '' }]
  })], { people: { me: { age: 55 }, spouse: { age: 75 } } });
  const j = E.holdSim(inp, 'current')[0].jong;
  T('joint-compare 모드', j.mode === 'joint-compare', j.mode);
  T('특례 납세의무자 = 배우자(75세) 선택', j.joint.repKey === 'spouse', j.joint.repKey);
  T('특례 세액 ≈ 2,269,440 (연령40%+보유50%→80%)', near(j.joint.special.total, 2269440, 만), `${j.joint.special.total}`);
  T('최종 종부세 = 배우자 특례 (개별납부 492만보다 유리)', near(j.total, 2269440, 만), `${(j.total / 만).toFixed(1)}만`);
  T('개별납부 합산 ≈ 4,924,800 (비교 표시용)', near(j.joint.indivTotal, 4924800, 만), `${j.joint.indivTotal}`);
  // 지분이 다르면 법정(지분 큰 자) — 선택 없음
  const inp2 = inputOf([house({
    official: 35, acqPrice: 10, acqDate: '2010-05', ownerType: 'joint',
    shares: { me: 60, spouse: 40, other: 0 }, livePeriods: [{ from: '2010-05', to: '' }]
  })], { people: { me: { age: 55 }, spouse: { age: 75 } } });
  const j2 = E.holdSim(inp2, 'current')[0].jong;
  T('60:40 — 법정 납세의무자(지분 큰 본인) 고정', j2.joint.repKey === 'me', j2.joint.repKey);
}

/* ───────────────────────────────────────────────────────────────────
   이슈 5 · 상속주택만 한 채 보유 시 0주택 처리 오류
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[이슈 5] 상속주택 단독 보유 — 1세대 1주택으로 판정되어야 함');
{
  const inp = inputOf([house({
    official: 15, acqPrice: 12, acqDate: '2024-03', acqCause: 'inherit',
    flags: { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false }
  })], { people: { me: { age: 58 }, spouse: {} } });
  const cur = E.holdSim(inp, 'current');
  const p26 = cur[0].jong.persons[0];
  T('2026 — 1주택 기본공제 12억(비거주) 적용', p26.deduct === 12 * 억, E.won(p26.deduct));
  T('2026 종부세 ≈ 691,200 (버그 시 1,526,400)', near(cur[0].jong.total, 691200, 5000), `${cur[0].jong.total}`);
  // 특례기간이 끝나도 1주택 지위 유지 (원래 1주택이므로 변화 없어야)
  T('2029 이후에도 동일하게 1주택', cur[4].jong.persons[0].deduct === 12 * 억, E.won(cur[4].jong.persons[0].deduct));
  const ref = E.holdSim(inp, 'reform');
  T('정부안 — 비거주 1주택 공제 9억', ref[2].jong.persons[0].deduct === 9 * 억, E.won(ref[2].jong.persons[0].deduct));

  // 일반 1채 + 상속 1채: 기존(특례로 1주택) 동작 유지 — GC-3a와 동일 구조
  const both = inputOf([
    house({ id: 'n1', official: 15, acqPrice: 6, acqDate: '2013-06', livePeriods: [{ from: '2013-06', to: '' }] }),
    house({ id: 'i1', official: 12, acqPrice: 12, acqDate: '2024-03', acqCause: 'inherit', flags: { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false } })
  ], { situation: 'two', people: { me: { age: 58 }, spouse: {} } });
  T('일반+상속 — 1주택 특례 유지 (14억, 정부안 2028)', E.holdSim(both, 'reform')[2].jong.persons[0].deduct === 14 * 억, '');

  // 양도 판정: 상속주택 자체를 양도하면 그 주택을 특례 제외할 수 없음 → 2주택 과세
  const sellInherit = JSON.parse(JSON.stringify(both));
  sellInherit.purposes = ['hold', 'sell'];
  sellInherit.sell = { houseId: 'i1', date: '2026-10-15', price: 14, cost: 0 };
  const si = E.sellSim(sellInherit, 'current').rows[0];
  T('상속주택 자체 양도 — 1세대1주택 비과세 아님', !si.yangdo.exempt, `exempt=${si.yangdo.exempt}`);
  // 일반주택 양도 시에는 특례 제외로 비과세 가능 (보유·거주 요건 충족)
  const sellNormal = JSON.parse(JSON.stringify(both));
  sellNormal.purposes = ['hold', 'sell'];
  sellNormal.sell = { houseId: 'n1', date: '2026-10-15', price: 11, cost: 0 };
  const sn = E.sellSim(sellNormal, 'current').rows[0];
  T('일반주택 양도 — 상속 특례 제외로 비과세(12억 이하)', sn.yangdo.total === 0 && sn.yangdo.taxRatio === 0, `total=${sn.yangdo.total}`);
}

/* ───────────────────────────────────────────────────────────────────
   이슈 6 · 입력 검증
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[이슈 6A] 지방저가·인구감소 특례 요건 검증');
{
  const seoul = inputOf([
    house({ id: 'a', official: 15, livePeriods: [{ from: '2016-05', to: '' }] }),
    house({ id: 'b', official: 20, region: '서울', flags: { temp2: false, inherit: false, lowLocal: true, rental: false, popDecline: false } })
  ], { situation: 'two' });
  const stat = E.holdSim(seoul, 'current')[0].jong;
  T('서울 20억 주택에 지방저가 플래그 — 제외 미적용(다주택 과세)', stat.persons[0].deduct === 9 * 억, E.won(stat.persons[0].deduct));
  const rural = inputOf([
    house({ id: 'a', official: 15, livePeriods: [{ from: '2016-05', to: '' }] }),
    house({ id: 'b', official: 2.5, region: '그 외 지방', adjNow: 'no', flags: { temp2: false, inherit: false, lowLocal: true, rental: false, popDecline: false } })
  ], { situation: 'two' });
  T('지방 2.5억 — 요건 충족 시 제외(1주택 공제 12억)', E.holdSim(rural, 'current')[0].jong.persons[0].deduct === 12 * 억, '');
}
console.log('\n[이슈 6B] 제3자 지분 — 양도세 총액에서 제외');
{
  const inp = inputOf([house({
    id: 't1', official: 15, acqPrice: 5, acqDate: '2015-05',
    ownerType: 'other', shares: { me: 50, spouse: 0, other: 50 }
  })], { purposes: ['hold', 'sell'] });
  inp.sell = { houseId: 't1', date: '2026-10-15', price: 20, cost: 0 };
  const yd = E.sellSim(inp, 'current').rows[0].yangdo;
  // 1주택·2015년 취득(2017-08-03 이전 → 거주요건 없음) → 12억 초과분 안분 과세, 본인 지분 50%만
  const refHalf = R.refYangdo({ year: 2026, scen: 'current', sale: 20 * 억, acq: 5 * 억, cost: 0, holdY: 11.4, liveY: 0, isOne: true, needLive: false, heavy: false, share: 0.5 });
  T('총액 = 본인 지분(50%)분만', near(yd.total, refHalf.total, 2 * 만), `${(yd.total / 만).toFixed(1)}만 vs ref ${(refHalf.total / 만).toFixed(1)}만`);
  T('제3자 소유자 행이 세액 합산에 없음', !yd.owners.some(o => o.key === 'other'), JSON.stringify(yd.owners.map(o => o.key)));
}
console.log('\n[이슈 6C] 증여 지분이 증여자 보유 지분 초과 시 차단');
{
  const inp = inputOf([house({ id: 'g1', official: 15, ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, livePeriods: [{ from: '2016-05', to: '' }] })],
    { purposes: ['hold', 'gift'] });
  inp.gift = { type: 'general', relation: 'child', houseId: 'g1', share: 100, value: 20, debt: 0, prior: 0, date: '2026-10' };
  const v = E.validateInput(inp);
  T('본인 50% 보유 · 100% 증여 입력 → 계산 불가 오류', v.errors.some(e => e.code === 'GIFT_OVER'), JSON.stringify(v.errors.map(e => e.code)));
  inp.gift.share = 50;
  T('50% 증여는 허용', !E.validateInput(inp).errors.some(e => e.code === 'GIFT_OVER'), '');
  // 공동명의 전환도 동일 검증
  const inp2 = inputOf([house({ id: 'j1', official: 15, ownerType: 'joint', shares: { me: 40, spouse: 60, other: 0 } })], { purposes: ['hold', 'joint'] });
  inp2.joint = { houseId: 'j1', share: 50, prior: 0 };
  T('본인 40% 보유 · 50% 이전 검토 → 오류', E.validateInput(inp2).errors.some(e => e.code === 'JOINT_OVER'), '');
}

/* ───────────────────────────────────────────────────────────────────
   §7 · 장기보유특별공제 앵커 (정상 동작 회귀 방지 — 지시서 제시 독립값)
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[§7] 장특공제 앵커 — 정상 동작 유지 확인');
{
  const mk = (livePeriods, adjAcq) => {
    const inp = inputOf([house({ id: 'L1', official: 33, acqPrice: 10, acqDate: '2010-05', adjAcq, livePeriods })], { purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'L1', date: '2026-10-15', price: 50, cost: 3000 };
    return inp;
  };
  const a = E.sellSim(mk([{ from: '2010-05', to: '' }], 'yes'), 'current').rows[0].yangdo;
  T('50억 · 보유·거주 16년 — 장특 80%', near(a.ltcgRate, 0.80, 1e-9), a.ltcgRate);
  T('양도세 ≈ 2억 3,810만 (지방세 포함)', near(a.total, 23810 * 만, 15 * 만), `${(a.total / 만).toFixed(0)}만`);
  // 참고: 지시서 §7(b) 사례(보유 16년 + 취득 당시 조정 → 거주요건)는 법과 양립 불가 —
  // 거주 2년 요건은 2017-08-03 이후 취득분에만 적용(소득세법 시행령 §154① 부칙).
  // 2010년 취득이면 비거주라도 비과세가 맞으므로, 요건이 실제로 걸리는 2018년 취득으로 검증한다.
  const b0 = E.sellSim(mk([], 'yes'), 'current').rows[0].yangdo;
  T('2010년 취득 · 비거주 — 거주요건 없음 → 비과세(12억 초과분 과세)', b0.exempt === true, `ex=${b0.exempt}`);
  const mk18 = (livePeriods) => {
    const inp = inputOf([house({ id: 'L1', official: 33, acqPrice: 10, acqDate: '2018-05', adjAcq: 'yes', livePeriods })], { purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'L1', date: '2026-10-15', price: 50, cost: 3000 };
    return inp;
  };
  const b = E.sellSim(mk18([]), 'current').rows[0].yangdo;
  const refB = R.refYangdo({ year: 2026, scen: 'current', sale: 50 * 억, acq: 10 * 억, cost: 3000 * 만, holdY: 8.42, liveY: 0, isOne: true, needLive: true, heavy: false });
  T('2018년 취득 · 비거주·조정 — 비과세 미적용 + 일반 장특 16%(보유 8년)', !b.exempt && near(b.ltcgRate, 0.16, 1e-9), `ex=${b.exempt} rate=${b.ltcgRate}`);
  T('양도세 = 참조 일치 (거주요건 미충족 전액 과세)', near(b.total, refB.total, 2 * 만), `${(b.total / 만).toFixed(0)}만 vs ${(refB.total / 만).toFixed(0)}만`);
  // 경계: 거주 23개월(미충족) vs 24개월(충족) — 2018년 취득(거주요건 있음)
  const c = E.sellSim(mk18([{ from: '2024-11', to: '' }]), 'current').rows[0].yangdo; // 23개월
  T('거주 1.92년 — 2년 요건 미충족(비과세 아님)', !c.exempt, `ex=${c.exempt}`);
  const c2 = E.sellSim(mk18([{ from: '2024-10', to: '' }]), 'current').rows[0].yangdo; // 정확 24개월
  T('거주 정확 2.0년 — 요건 충족(비과세 전환, 부동소수점 무오류)', c2.exempt === true, `ex=${c2.exempt}`);
  const inp48 = inputOf([house({ id: 'L2', official: 20, acqPrice: 8, acqDate: '2016-10', adjAcq: 'yes', livePeriods: [{ from: '2024-10', to: '' }] })], { purposes: ['hold', 'sell'] });
  inp48.sell = { houseId: 'L2', date: '2026-10-15', price: 25, cost: 0 };
  const d = E.sellSim(inp48, 'current').rows[0].yangdo;
  T('보유 10년 + 거주 2년 — 장특 48% (40%+8%)', near(d.ltcgRate, 0.48, 1e-9), d.ltcgRate);
}

/* ───────────────────────────────────────────────────────────────────
   §9 · 기존 수정 사항 회귀 방지
   ─────────────────────────────────────────────────────────────────── */
console.log('\n[§9] 회귀 방지 — 세액공제 한도·장특 한도·부담부 무상분');
{
  // 종부 세액공제 절대한도: 2027 800만 / 2028+ 600만
  const p27 = E.jongbuPerson({ year: 2027, scen: 'reform', pubSum: 45 * 억, houseCount: 1, hasAdj: true, isOne: true, oneLive: true, liveShare: 1, age: 67, holdY: 21, liveY: 21, aggPBase: 45 * 억 * 0.6, avgFair: 0.6, propMainPaid: 1017 * 만, prevTotal: 0 });
  T('2027 세액공제 한도 800만', p27.creditCap === 800 * 만 && near(p27.credit, 800 * 만, 1), `cap=${p27.creditCap} credit=${p27.credit}`);
  const p28 = E.jongbuPerson({ year: 2028, scen: 'reform', pubSum: 45 * 억, houseCount: 1, hasAdj: true, isOne: true, oneLive: true, liveShare: 1, age: 68, holdY: 22, liveY: 22, aggPBase: 45 * 억 * 0.6, avgFair: 0.6, propMainPaid: 1017 * 만, prevTotal: 0 });
  T('2028 세액공제 한도 600만', p28.creditCap === 600 * 만 && near(p28.credit, 600 * 만, 1), `cap=${p28.creditCap}`);
  // 장특 금액한도: 2028 20억 / 2029+ 10억 (정부안)
  const y28 = E.yangdoCore({ year: 2028, scen: 'reform', sale: 60 * 억, acq: 10 * 억, cost: 0, holdY: 20, liveY: 20, isOne: true, needLive: false, heavyCount: 0, fullPrice: 60 * 억, owners: [{ key: 'me', share: 1, age: 60 }] });
  T('2028 장특 한도 20억 작동', y28.owners[0].ltcgCapped && near(y28.owners[0].ltcg, 20 * 억, 1), `ltcg=${(y28.owners[0].ltcg / 억).toFixed(2)}억`);
  const y29 = E.yangdoCore({ year: 2029, scen: 'reform', sale: 60 * 억, acq: 10 * 억, cost: 0, holdY: 21, liveY: 21, isOne: true, needLive: false, heavyCount: 0, fullPrice: 60 * 억, owners: [{ key: 'me', share: 1, age: 61 }] });
  T('2029 장특 한도 10억 작동', y29.owners[0].ltcgCapped && near(y29.owners[0].ltcg, 10 * 억, 1), `ltcg=${(y29.owners[0].ltcg / 억).toFixed(2)}억`);
  // 부담부증여 무상분 취득세 과세가액 = 가액 − 채무
  const gInp = inputOf([house({ id: 'bd1', official: 6, acqPrice: 4, acqDate: '2019-03', adjNow: 'no', region: '그 외 지방' })], { situation: 'two', purposes: ['hold', 'gift'] });
  gInp.houses.push(house({ id: 'bd0', official: 12, livePeriods: [{ from: '2016-05', to: '' }] }));
  gInp.gift = { type: 'burden', relation: 'child', houseId: 'bd1', share: 100, value: 9, debt: 3, prior: 0, date: '2026-10' };
  const gf = E.giftFull(gInp);
  T('부담부 무상분 취득세 과세가액 6억(9−3) 기준', near(gf.at.main, 6 * 억 * 0.035, 1000), `main=${(gf.at.main / 만).toFixed(0)}만`);
  T('부담부 증여세 = 참조 일치', near(gf.gt.tax, R.refGift(9 * 억, 3 * 억, 'child', 0).tax, 1000), '');
}

console.log(`\n이슈 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
