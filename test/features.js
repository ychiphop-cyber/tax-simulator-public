'use strict';
/* ═══════════════════════════════════════════════════════════════════
   2026-08-15 v3.1.0 최소 범위 개선 — 회귀·신규 기능 테스트
   ① 공동명의 표시 불변식(표시 전용 재집계가 엔진 합계와 일치하는지)
   ③ 최대 15주택 입력 시 계산 정상
   ④ 상생임대 간편 특례(거주요건 면제) — 기대값은 test/reference.js(법정 산식)
   기본값(sangsaeng 미지정) 경로는 기존과 완전히 동일해야 한다.
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const R = require('./reference.js');
const { 억, 만 } = E;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
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

/* ── ④ 상생임대 특례: 거주요건 면제 (소득세법 시행령 §155의3) ── */
console.log('\n[④ 상생임대] 거주요건 면제 간이 반영');
{
  // 취득 당시 조정지역(2018-05 취득) · 거주 0년 · 1주택 · 2026-10 매도 20억(취득 10억)
  const mk = sang => {
    const inp = inputOf([house({ id: 'x', official: 14, acqPrice: 10, acqDate: '2018-05', sangsaeng: sang })],
      { situation: 'one_away', purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'x', date: '2026-10-15', price: 20, cost: 0, sameYearOther: false, seniorMove: false };
    return inp;
  };
  const holdY = E.yearsBetween('2018-05', '2026-10');

  // 기본값(미지정): 거주요건 미충족 → 비과세 없음 (기존 동작과 동일해야 함)
  const base = E.sellSim(mk(undefined), 'current').rows[0].yangdo;
  const refBase = R.refYangdo({ year: 2026, scen: 'current', sale: 20 * 억, acq: 10 * 억, cost: 0, holdY, liveY: 0, isOne: true, needLive: true });
  T('미지정 — 비과세 없음(기존 동일)', base.exempt === false && near(base.total, refBase.total), `${(base.total / 만).toFixed(0)}만 vs ${(refBase.total / 만).toFixed(0)}만`);

  // '아니오'/'잘 모르겠어요' — 기본값과 완전 동일
  const no = E.sellSim(mk('no'), 'current').rows[0].yangdo;
  const unk = E.sellSim(mk('unknown'), 'current').rows[0].yangdo;
  T("'아니오' = 미지정", near(no.total, base.total, 1), String(no.total));
  T("'잘 모르겠어요' = 미지정 (자동 판정 안 함)", near(unk.total, base.total, 1), String(unk.total));

  // '예' — 비과세(12억 초과분 과세) + 표2 보유분 공제, 참조 산식과 일치
  const yes = E.sellSim(mk('yes'), 'current').rows[0].yangdo;
  const refYes = R.refYangdo({ year: 2026, scen: 'current', sale: 20 * 억, acq: 10 * 억, cost: 0, holdY, liveY: 0, isOne: true, needLive: true, liveWaived: true });
  T("'예' — 1세대1주택 비과세 적용", yes.exempt === true, `exempt=${yes.exempt}`);
  T("'예' — 12억 초과분만 과세(비율 40%)", near(yes.taxRatio, 0.40, 1e-9), `ratio=${yes.taxRatio}`);
  T("'예' — 장특 표2 보유분 적용(8년×4%=32%)", near(yes.ltcgRate, 0.32, 1e-9), `ltcg=${yes.ltcgRate}`);
  T("'예' — 세액 = 참조 산식", near(yes.total, refYes.total), `${(yes.total / 만).toFixed(1)}만 vs ${(refYes.total / 만).toFixed(1)}만`);
  T("'예' ≤ 미지정 (면제는 유리하기만)", yes.total <= base.total + 1, `${yes.total} vs ${base.total}`);
  T("'예' — 안내 문구 포함", yes.notes.some(n => n.includes('상생임대')), yes.notes.join('|'));

  // 수기 검산: 차익 10억 × 40% = 4억, 장특 32% = 1.28억, 기본공제 250만
  // 과표 2.695억 → 38% 구간(누진공제 1,994만) = 8,247만 → 지방세 포함 9,071.7만
  T("'예' — 수기 검산 9,071.7만", near(yes.total, 9071.7 * 만, 2 * 만), `${(yes.total / 만).toFixed(1)}만`);

  // 12억 이하 → 전액 비과세
  const inpLow = mk('yes'); inpLow.sell.price = 11;
  const low = E.sellSim(inpLow, 'current').rows[0].yangdo;
  T("'예' + 양도가 11억 — 전액 비과세", low.total === 0 && low.taxRatio === 0, `${low.total}`);

  // 취득 당시 비조정(거주요건 원래 없음): '예'는 표2 거주요건만 면제 → 보유분 4%/년
  const mkNa = sang => {
    const inp = inputOf([house({ id: 'x', official: 14, acqPrice: 10, acqDate: '2018-05', adjAcq: 'no', sangsaeng: sang })],
      { situation: 'one_away', purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'x', date: '2026-10-15', price: 20, cost: 0 };
    return inp;
  };
  const naBase = E.sellSim(mkNa(undefined), 'current').rows[0].yangdo;
  const naYes = E.sellSim(mkNa('yes'), 'current').rows[0].yangdo;
  T('비조정 취득 — 미지정도 비과세(기존 동일)', naBase.exempt === true && near(naBase.ltcgRate, 0.16, 1e-9), `ltcg=${naBase.ltcgRate}`);
  T("비조정 취득 + '예' — 표2 보유분 32%로 상향", near(naYes.ltcgRate, 0.32, 1e-9), `ltcg=${naYes.ltcgRate}`);

  // 다주택이면 상생임대 표시와 무관 (1세대1주택 특례가 아님)
  const inp2 = inputOf([
    house({ id: 'x', official: 14, acqPrice: 10, acqDate: '2018-05', sangsaeng: 'yes' }),
    house({ official: 9, acqPrice: 4, acqDate: '2020-01' })
  ], { situation: 'two', purposes: ['hold', 'sell'] });
  inp2.sell = { houseId: 'x', date: '2026-03-15', price: 20, cost: 0 };
  const multi = E.sellSim(inp2, 'current').rows[0].yangdo;
  T('2주택 — 상생임대 표시해도 비과세 없음', multi.exempt === false, `exempt=${multi.exempt}`);

  // 부담부증여 증여자 양도분에도 동일 반영 (오류 없이 계산)
  const gi = inputOf([house({ id: 'x', official: 14, acqPrice: 6, acqDate: '2018-05', sangsaeng: 'yes' })],
    { situation: 'one_away', purposes: ['hold', 'gift'] });
  gi.gift = { type: 'burden', relation: 'child', houseId: 'x', share: 100, value: 18, debt: 5, prior: 0, date: '2026-10' };
  const g = E.giftFull(gi);
  T('부담부증여 — 상생임대 반영 계산 정상', g && g.giverYangdo && isFinite(g.giverYangdo.total), g && g.giverYangdo && String(g.giverYangdo.total));
}

/* ── ③ 최대 15주택 ── */
console.log('\n[③ 15주택] 다주택 확장 계산 정상');
{
  const hs = [];
  for (let i = 0; i < 15; i++) hs.push(house({ id: 'h' + i, official: 3 + i * 0.5, acqPrice: 1 + i * 0.2, acqDate: '2015-01' }));
  hs[0].livePeriods = [{ from: '2015-01', to: '' }];
  const inp = inputOf(hs, { situation: 'multi', purposes: ['hold', 'sell'] });
  inp.sell = { houseId: 'h0', date: '2027-07-15', price: 10, cost: 0 };

  for (const scen of ['current', 'reform']) {
    const rows = E.holdSim(inp, scen);
    T(`15주택 holdSim(${scen}) — 5개 연도 산출`, rows.length === 5 && rows.every(r => isFinite(r.holdTax) && r.holdTax >= 0));
    T(`15주택(${scen}) — 주택별 재산세 15건`, rows[0].prop.rows.length === 15);
    T(`15주택(${scen}) — 보유세 = 재산세+종부세`, rows.every(r => near(r.holdTax, r.prop.total + r.jong.total, 1)));
  }
  // 재산세 참조 대조 (다주택 표준세율 60% 경로, 2026)
  const r26 = E.holdSim(inp, 'current')[0];
  let refSum = 0;
  hs.forEach(h => { refSum += R.refProp(h.official * 억, h.official * 억, false, 2026).total; });
  T('15주택 재산세 = Σ참조 물건별', near(r26.prop.total, refSum, 100), `${(r26.prop.total / 만).toFixed(1)}만 vs ${(refSum / 만).toFixed(1)}만`);
  // 양도: 3주택 이상 중과 상한(+30%p) 유지
  const sell = E.sellSim(inp, 'current');
  const r27 = sell.rows.find(r => r.year === 2027);
  T('15주택 양도(2027, 조정) — 중과 +30%p', near(r27.yangdo.surcharge || 0, 0.30, 1e-9), `sur=${r27.yangdo.surcharge}`);
  T('15주택 양도 — 유한한 세액', sell.rows.every(r => isFinite(r.grand)));
  // 1주택 대조: 기존 경로 불변
  const one = E.holdSim(inputOf([house({ official: 8, livePeriods: [{ from: '2016-06', to: '' }] })]), 'current');
  T('1주택 기존 경로 — 2026 재산세 특례세율', near(one[0].prop.total, R.refProp(8 * 억, 8 * 억, true, 2026).total, 100));
}

/* ── ① 공동명의 표시 불변식 — 표시용 재집계가 엔진 합계와 일치 ── */
console.log('\n[① 공동명의] 명의자별 재집계 = 엔진 합계 (표시 전용, 로직 불변 확인)');
{
  // ui.js personHoldOf와 동일한 재집계 (검증용 복제)
  function personHold(r, key) {
    let prop = 0;
    r.prop.rows.forEach(pr => { prop += pr.pt.total * (((pr.h.shares || {})[key]) || 0) / 100; });
    let jong = 0;
    const j = r.jong;
    if (j.mode === 'joint-compare') {
      if (j.joint.best === 'indiv') { const x = j.joint.indiv.find(v => v.key === key); jong = x ? x.r.total : 0; }
      else jong = (j.joint.repKey === key) ? j.joint.special.total : 0;
    } else if (j.persons) {
      j.persons.forEach(p => { if ((p.taxpayer || 'me') === key) jong += p.total; });
    }
    return prop + jong;
  }
  const cases = [
    ['부부 50:50 1주택(특례비교)', inputOf([house({ official: 25.6, ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, livePeriods: [{ from: '2016-06', to: '' }] })])],
    ['부부 70:30 1주택', inputOf([house({ official: 20, ownerType: 'joint', shares: { me: 70, spouse: 30, other: 0 }, livePeriods: [{ from: '2016-06', to: '' }] })])],
    ['제3자 50% 포함', inputOf([house({ official: 20, ownerType: 'other', shares: { me: 40, spouse: 10, other: 50 }, livePeriods: [{ from: '2016-06', to: '' }] })])],
    ['2주택 혼합 명의', inputOf([
      house({ official: 15, ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, livePeriods: [{ from: '2016-06', to: '' }] }),
      house({ official: 10, ownerType: 'spouse', shares: { me: 0, spouse: 100, other: 0 }, acqDate: '2019-03' })
    ], { situation: 'two' })]
  ];
  for (const [name, inp] of cases) {
    for (const scen of ['current', 'reform']) {
      const rows = E.holdSim(inp, scen);
      let ok = true, det = '';
      for (const r of rows) {
        const sum = personHold(r, 'me') + personHold(r, 'spouse') + personHold(r, 'other');
        if (!near(sum, r.holdTax, 10)) { ok = false; det = `${r.year}: 인별합 ${sum} vs 전체 ${r.holdTax}`; break; }
      }
      T(`${name} (${scen}) — 인별 합 = 전체`, ok, det);
    }
  }
  // 양도 인별: owners 합 = 전체
  const ji = inputOf([house({ id: 'x', official: 20, acqPrice: 6, acqDate: '2014-05', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, livePeriods: [{ from: '2014-05', to: '' }] })],
    { purposes: ['hold', 'sell'] });
  ji.sell = { houseId: 'x', date: '2026-10-15', price: 30, cost: 0 };
  const yr = E.sellSim(ji, 'current').rows[0].yangdo;
  const ownSum = yr.owners.reduce((s, o) => s + o.total, 0);
  T('양도 공동명의 — 인별 owners 합 = 전체', near(ownSum, yr.total, 10), `${ownSum} vs ${yr.total}`);
  T('양도 공동명의 — 본인·배우자 각각 존재', yr.owners.length === 2 && yr.owners.every(o => o.total >= 0));
}

console.log(`\n기능 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
