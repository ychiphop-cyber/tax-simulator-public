'use strict';
/* ═══════════════════════════════════════════════════════════════════
   대량 스윕 테스트 (지시서 §10) — 세목별 20개 이상, 기대값은 엔진이 아니라
   test/reference.js(법정 산식 독립 구현)로 산출해 대조한다.
   금액 기준: 원 단위 절사 없이 계산값 비교(±1만원), 지방소득세·농특세 포함 여부는
   각 세목 표기를 따름 (양도세=지방소득세 포함, 종부세=농특세 포함, 재산세=도시·교육 포함).
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const R = require('./reference.js');
const { 억, 만 } = E;

let pass = 0, fail = 0, count = { 보유세: 0, 양도세: 0, 증여: 0, 상속: 0, 취득세: 0 };
function T(cat, name, cond, detail) {
  count[cat]++;
  if (cond) pass++;
  else { fail++; console.log(`  ✗ [${cat}] ${name} — ${detail || ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 만 : tol);

function house(over) {
  return Object.assign({
    id: 'h' + Math.random().toString(36).slice(2, 7), name: '', area85: false, region: '서울',
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

/* ── 1) 보유세: 재산세 전량 참조 대조 (가격 8종 × 성장률 5종 × 1주택, 전 연도) ── */
{
  for (const pubE of [3, 5.5, 8, 12, 15, 25.6, 45, 80]) {
    for (const g of [-10, 0, 5, 20, 50]) {
      const inp = inputOf([house({ official: pubE, acqPrice: pubE / 2, acqDate: '2014-01', livePeriods: [{ from: '2014-01', to: '' }] })]);
      inp.assumptions.officialGrowth = g;
      const rows = E.holdSim(inp, 'current');
      let prevPub = pubE * 억 / (1 + g / 100), ok = true, det = '';
      for (let i = 0; i < rows.length; i++) {
        const pub = pubE * 억 * Math.pow(1 + g / 100, i);
        const rf = R.refProp(pub, prevPub, true, 2026 + i);
        const pt = rows[i].prop.rows[0].pt;
        if (!near(pt.total, rf.total, 100)) { ok = false; det = `${2026 + i}: ${pt.total} vs ${rf.total}`; break; }
        prevPub = pub;
      }
      T('보유세', `재산세 1주택 공시${pubE}억 g${g}%`, ok, det);
    }
  }
  // 다주택(2채) — 재산세 60% 고정 경로
  for (const [a, b] of [[15, 12], [8, 6], [30, 10], [5, 3]]) {
    const inp = inputOf([house({ official: a, livePeriods: [{ from: '2015-01', to: '' }] }), house({ official: b })], { situation: 'two' });
    const rows = E.holdSim(inp, 'current');
    let ok = true;
    for (let i = 0; i < rows.length; i++) {
      const r1 = R.refProp(a * 억, a * 억, false, 2026 + i);
      const r2 = R.refProp(b * 억, b * 억, false, 2026 + i);
      if (!near(rows[i].prop.total, r1.total + r2.total, 100)) { ok = false; break; }
    }
    T('보유세', `재산세 2주택 ${a}+${b}억`, ok);
  }
  // 종부세 참조 대조 — 단독 1주택 (거주/비거주 × 가격) 2026 현행/2028 정부안
  for (const pubE of [10, 13, 15, 20, 35, 60]) {
    for (const live of [true, false]) {
      const inp = inputOf([house({ official: pubE, acqPrice: 5, acqDate: '2012-05', livePeriods: live ? [{ from: '2012-05', to: '' }] : [] })], { people: { me: { age: 62 }, spouse: {} } });
      const cur = E.holdSim(inp, 'current')[0].jong.total;
      const P26 = R.refProp(pubE * 억, pubE * 억, true, 2026);
      const rf26 = R.refJongPerson({ year: 2026, scen: 'current', pubSum: pubE * 억, houseCount: 1, hasAdj: true, isOne: true, oneLive: live, liveShare: live ? 1 : 0, age: 62, holdY: 14, liveY: live ? 14 : 0, aggPBase: pubE * 억 * P26.fair, propMainPaid: P26.main, prevTotal: 0 });
      T('보유세', `종부 1주택 ${pubE}억 ${live ? '거주' : '비거주'} 2026`, near(cur, rf26.total, 만), `${cur} vs ${rf26.total}`);
    }
  }
}

/* ── 2) 양도세: 참조 대조 24케이스 ── */
{
  const cases = [];
  // 1주택 거주기간 스윕 (2018 취득 — 거주요건 있음)
  for (const liveFrom of ['2018-05', '2020-05', '2024-10', '2024-11', null]) {
    cases.push({ name: `1주택 live=${liveFrom || '없음'}`, houses: [house({ id: 'x', official: 33, acqPrice: 10, acqDate: '2018-05', livePeriods: liveFrom ? [{ from: liveFrom, to: '' }] : [] })], sell: { houseId: 'x', date: '2026-10-15', price: 50, cost: 3000 }, isOne: true, needLive: true, acq: 10, liveFrom });
  }
  // 초고가 · 저가 경계
  for (const price of [11.9, 12, 12.1, 30, 80]) {
    cases.push({ name: `1주택 가액 ${price}억`, houses: [house({ id: 'x', official: price * 0.6, acqPrice: price / 2, acqDate: '2015-05', livePeriods: [{ from: '2015-05', to: '' }] })], sell: { houseId: 'x', date: '2026-10-15', price, cost: 0 }, isOne: true, needLive: false, acq: price / 2 });
  }
  // 다주택 조정 — 유예 전후 × 2/3주택
  for (const [date, n] of [['2026-03-15', 2], ['2026-07-15', 2], ['2026-03-15', 3], ['2026-07-15', 3], ['2027-03-15', 2], ['2028-07-15', 3]]) {
    const hs = [house({ id: 'x', official: 14, acqPrice: 5, acqDate: '2011-01' }), house({ official: 9, acqPrice: 3 })];
    if (n === 3) hs.push(house({ official: 7, acqPrice: 2 }));
    cases.push({ name: `조정 ${n}주택 ${date}`, houses: hs, sell: { houseId: 'x', date, price: 20, cost: 0 }, isOne: false, needLive: true, acq: 5, heavyDate: date, heavyN: n });
  }
  // 정부안 연도별 (2027/2028/2029) 1주택 거주
  for (const scenY of [0, 1, 2, 3]) {
    cases.push({ name: `정부안 경로 y+${scenY}`, houses: [house({ id: 'x', official: 30, acqPrice: 8, acqDate: '2010-03', livePeriods: [{ from: '2010-03', to: '' }] })], sell: { houseId: 'x', date: '2026-11-15', price: 45, cost: 0 }, isOne: true, needLive: false, acq: 8, scen: 'reform', rowIdx: scenY });
  }
  // 공동명의 50:50 / 제3자 50%
  cases.push({ name: '부부 50:50', houses: [house({ id: 'x', official: 20, acqPrice: 6, acqDate: '2014-05', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, livePeriods: [{ from: '2014-05', to: '' }] })], sell: { houseId: 'x', date: '2026-10-15', price: 30, cost: 0 }, isOne: true, needLive: false, acq: 6, shares: [0.5, 0.5] });
  cases.push({ name: '제3자 50%', houses: [house({ id: 'x', official: 20, acqPrice: 6, acqDate: '2014-05', ownerType: 'other', shares: { me: 50, spouse: 0, other: 50 }, livePeriods: [{ from: '2014-05', to: '' }] })], sell: { houseId: 'x', date: '2026-10-15', price: 30, cost: 0 }, isOne: true, needLive: false, acq: 6, shares: [0.5] });
  // 단기 보유
  cases.push({ name: '단기 0.5년', houses: [house({ id: 'x', official: 10, acqPrice: 9, acqDate: '2026-04' })], sell: { houseId: 'x', date: '2026-10-15', price: 12, cost: 0 }, isOne: true, needLive: true, acq: 9 });
  cases.push({ name: '단기 1.5년', houses: [house({ id: 'x', official: 10, acqPrice: 9, acqDate: '2025-04' })], sell: { houseId: 'x', date: '2026-10-15', price: 12, cost: 0 }, isOne: true, needLive: true, acq: 9 });

  for (const c of cases) {
    const inp = inputOf(c.houses, { situation: c.houses.length > 1 ? 'two' : 'one_live', purposes: ['hold', 'sell'] });
    inp.sell = c.sell;
    const scen = c.scen || 'current';
    const idx = c.rowIdx || 0;
    const row = E.sellSim(inp, scen).rows[idx];
    const Y = 2026 + idx;
    const saleYM = `${Y}-${c.sell.date.slice(5, 7)}`;
    const h = c.houses[0];
    const holdY = E.yearsBetween(h.acqDate, saleYM) || 0;
    const liveY = E.liveYearsOf(h.livePeriods, saleYM);
    const heavy = c.heavyDate ? !E.heavySuspendedAt(`${Y}${c.heavyDate.slice(4)}`) : false;
    const shares = c.shares || [1];
    let refTotal = 0;
    for (const sh of shares) {
      refTotal += R.refYangdo({
        year: Y, scen, sale: c.sell.price * 억, acq: c.acq * 억, cost: (c.sell.cost || 0) * 만,
        holdY, liveY, isOne: c.isOne, needLive: c.needLive,
        heavy, heavyCount: c.heavyN || 2, share: sh
      }).total;
    }
    T('양도세', c.name + (c.scen ? `/${scen}${Y}` : ''), near(row.yangdo.total, refTotal, 2 * 만), `${(row.yangdo.total / 만).toFixed(1)}만 vs ${(refTotal / 만).toFixed(1)}만`);
  }
}

/* ── 3) 증여·부담부: 참조 대조 22케이스 ── */
{
  let n = 0;
  for (const rel of ['spouse', 'child', 'minor', 'parent', 'other']) {
    for (const [valueE, debtE] of [[10, 0], [10, 3], [3, 0]]) {
      if (++n > 15 && rel === 'other') break;
      const inp = inputOf([
        house({ id: 'g0', official: 15, livePeriods: [{ from: '2016-05', to: '' }] }),
        house({ id: 'g1', official: valueE * 0.6, acqPrice: valueE / 2, acqDate: '2018-03', adjNow: 'no', region: '그 외 지방' })
      ], { situation: 'two', purposes: ['hold', 'gift'] });
      inp.gift = { type: debtE ? 'burden' : 'general', relation: rel, houseId: 'g1', share: 100, value: valueE, debt: debtE, prior: 0, date: '2026-10' };
      const g = E.giftFull(inp);
      const rf = R.refGift(valueE * 억, debtE * 억, rel, 0);
      T('증여', `${rel} ${valueE}억/채무${debtE}억 증여세`, near(g.gt.tax, rf.tax, 5000), `${g.gt.tax} vs ${rf.tax}`);
    }
  }
  // 10년 합산
  for (const prior of [1, 5, 12]) {
    const inp = inputOf([house({ id: 'g1', official: 12, acqPrice: 6, acqDate: '2015-01', livePeriods: [{ from: '2015-01', to: '' }] })], { purposes: ['hold', 'gift'] });
    inp.gift = { type: 'general', relation: 'child', houseId: 'g1', share: 50, value: 20, debt: 0, prior, date: '2026-10' };
    const g = E.giftFull(inp);
    const rf = R.refGift(10 * 억, 0, 'child', prior * 억);
    T('증여', `10년 합산 prior=${prior}억`, near(g.gt.tax, rf.tax, 5000), `${g.gt.tax} vs ${rf.tax}`);
  }
  // 배우자 지분 · 일부 지분
  for (const share of [30, 50, 70]) {
    const inp = inputOf([house({ id: 'g1', official: 20.7, acqPrice: 8, acqDate: '2012-01', livePeriods: [{ from: '2012-01', to: '' }] })], { purposes: ['hold', 'gift'] });
    inp.gift = { type: 'spouse_share', relation: 'spouse', houseId: 'g1', share, value: 30, debt: 0, prior: 0, date: '2026-10' };
    const g = E.giftFull(inp);
    const rf = R.refGift(30 * 억 * share / 100, 0, 'spouse', 0);
    T('증여', `배우자 지분 ${share}%`, near(g.gt.tax, rf.tax, 5000), `${g.gt.tax} vs ${rf.tax}`);
  }
  // 부담부 채무 경계 (채무=평가액 → 증여세 0)
  {
    const inp = inputOf([house({ id: 'g0', official: 15, livePeriods: [{ from: '2016-05', to: '' }] }), house({ id: 'g1', official: 5, acqPrice: 4, acqDate: '2019-01', adjNow: 'no', region: '그 외 지방' })], { situation: 'two', purposes: ['hold', 'gift'] });
    inp.gift = { type: 'burden', relation: 'child', houseId: 'g1', share: 100, value: 8, debt: 8, prior: 0, date: '2026-10' };
    T('증여', '채무=가액 → 증여세 0', E.giftFull(inp).gt.tax === 0, '');
  }
}

/* ── 4) 상속주택 특례: 시나리오 매트릭스 21케이스 ── */
{
  const mk = (opts) => {
    const hs = [];
    if (opts.normal) hs.push(house({ id: 'n1', official: 15, acqPrice: 6, acqDate: '2013-06', livePeriods: [{ from: '2013-06', to: '' }] }));
    hs.push(house({
      id: 'i1', official: opts.pub || 12, acqPrice: opts.pub || 12, acqDate: opts.acq || '2024-03', acqCause: 'inherit',
      region: opts.region || '서울', adjNow: opts.region ? 'no' : 'yes',
      shares: { me: opts.share || 100, spouse: 0, other: 100 - (opts.share || 100) },
      flags: { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false }
    }));
    return inputOf(hs, { situation: hs.length > 1 ? 'two' : 'one_live', people: { me: { age: 58 }, spouse: {} } });
  };
  // 단독 상속 — 항상 1주택
  for (const y of [0, 1, 2, 3, 4]) {
    const rows = E.holdSim(mk({ normal: false }), 'current');
    T('상속', `단독 상속 ${2026 + y} — 1주택 공제 12억`, rows[y].jong.persons[0].deduct === 12 * 억, E.won(rows[y].jong.persons[0].deduct));
  }
  // 일반+상속 — 5년 내 1주택, 5년 후 다주택 (2024-03 상속 → 2029 전환)
  for (const [y, expOne] of [[0, true], [1, true], [2, true], [3, false], [4, false]]) {
    const rows = E.holdSim(mk({ normal: true }), 'current');
    const ded = rows[y].jong.persons[0].deduct;
    T('상속', `일반+상속 ${2026 + y} — ${expOne ? '1주택(12억)' : '다주택(9억)'}`, expOne ? ded === 12 * 억 : ded === 9 * 억, E.won(ded));
  }
  // 무기한 예외 3종
  T('상속', '지분 40% — 만료 없음', E.inheritExpiryYear(mk({ normal: true, share: 40 })) === null, '');
  T('상속', '수도권 저가(5.9억) — 만료 없음', E.inheritExpiryYear(mk({ normal: true, pub: 5.9 })) === null, '');
  T('상속', '지방 2.9억 — 만료 없음', E.inheritExpiryYear(mk({ normal: true, pub: 2.9, region: '그 외 지방' })) === null, '');
  T('상속', '수도권 6.1억 — 5년 후 만료(2029)', (E.inheritExpiryYear(mk({ normal: true, pub: 6.1 })) || {}).year === 2029, '');
  // 상속 시점별 만료 연도
  // 만료는 5년 경과 후 도래하는 첫 과세기준일(6/1)부터: 2022-07+5년=2027-07 → 2028년 기준일부터 산입
  for (const [acq, expY] of [['2022-07', 2028], ['2023-05', 2028], ['2025-01', 2030], ['2021-05', 2026]]) {
    const e = E.inheritExpiryYear(mk({ normal: true, acq }));
    T('상속', `상속 ${acq} → 만료 ${expY}`, (e || {}).year === expY, JSON.stringify(e));
  }
  // 양도 판정 분리
  {
    const both = mk({ normal: true });
    both.purposes = ['hold', 'sell'];
    both.sell = { houseId: 'i1', date: '2026-10-15', price: 14, cost: 0 };
    T('상속', '상속주택 자체 양도 — 자기 제외 불가(비과세 아님)', !E.sellSim(both, 'current').rows[0].yangdo.exempt, '');
    const both2 = mk({ normal: true });
    both2.purposes = ['hold', 'sell'];
    both2.sell = { houseId: 'n1', date: '2026-10-15', price: 11, cost: 0 };
    T('상속', '일반주택 양도(5년 내) — 특례 제외로 비과세', E.sellSim(both2, 'current').rows[0].yangdo.total === 0, '');
    const both3 = mk({ normal: true });
    both3.purposes = ['hold', 'sell'];
    both3.sell = { houseId: 'n1', date: '2030-10-15', price: 11, cost: 0 };
    T('상속', '일반주택 양도(5년 후 행) — 2주택 과세', E.sellSim(both3, 'current').rows[4].yangdo.total > 0, '');
  }
  // 종부 vs 양도 판정 대비 — 동일 입력에서 종부는 특례, 양도(상속 대상)는 일반
  {
    const b = mk({ normal: true });
    T('상속', '종부(2026) 1주택 판정 vs 양도(상속주택) 다주택 판정 병존',
      E.holdSim(b, 'current')[0].jong.persons[0].deduct === 12 * 억, '');
  }
}

/* ── 5) 취득세: 참조 대조 26케이스 ── */
{
  let i = 0;
  for (const price of [3, 6, 7.5, 9, 12]) {
    for (const [cnt, adj] of [[1, false], [2, true], [2, false], [3, true], [4, false]]) {
      if (++i > 22) break;
      const a = E.acquisitionTax({ price: price * 억, housesAfter: cnt, adj, big85: i % 2 === 0, temp2: false, firstHome: false });
      const rf = R.refAcq(price * 억, cnt, adj, i % 2 === 0, false, false);
      T('취득세', `${price}억 ${cnt}주택 ${adj ? '조정' : '비조정'}`, near(a.total, rf.total, 1000), `${a.total} vs ${rf.total}`);
    }
  }
  T('취득세', '일시적2주택 표준세율', near(E.acquisitionTax({ price: 12 * 억, housesAfter: 2, adj: true, big85: false, temp2: true, firstHome: false }).total, R.refAcq(12 * 억, 2, true, false, true, false).total, 1000), '');
  T('취득세', '생애최초 200만 감면', near(E.acquisitionTax({ price: 5 * 억, housesAfter: 1, adj: false, big85: false, temp2: false, firstHome: true }).total, R.refAcq(5 * 억, 1, false, false, false, true).total, 1000), '');
  T('취득세', '생애최초 12억 초과 미적용', near(E.acquisitionTax({ price: 13 * 억, housesAfter: 1, adj: false, big85: false, temp2: false, firstHome: true }).total, R.refAcq(13 * 억, 1, false, false, false, true).total, 1000), '');
  T('취득세', '증여취득 3.5%+0.3%', near(E.giftAcquisitionTax({ base: 6 * 억, officialFull: 2 * 억, adj: false, big85: false, giverIsOne: false, toLineal: true }).total, 6 * 억 * 0.038, 1000), '');
}

const cats = Object.entries(count).map(([k, v]) => `${k} ${v}`).join(' · ');
console.log(`\n스윕 테스트: ${pass} 통과 / ${fail} 실패 (${cats})`);
process.exit(fail ? 1 : 0);
