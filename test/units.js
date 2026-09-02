'use strict';
/* PRD v2.0 §9 검증 시나리오 단위 테스트 (T-001~T-012) — rules-2026.08.09-r3 기준 */
const E = require('../src/engine.js');
const { 억, 만 } = E;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

function baseInput(over) {
  return Object.assign({
    situation: 'one_live',
    rights: {},
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses: [{
      id: 'h1', name: '주택 1', area85: false, region: '서울',
      adjNow: 'yes', adjAcq: 'yes', adjSale: 'yes',
      priceMode: 'official', official: 8, market: 0,
      acqPrice: 6, acqDate: '2016-05',
      shares: { me: 100, spouse: 0, other: 0 },
      livePeriods: [{ from: '2016-06', to: '' }],
      flags: {}
    }],
    purposes: ['hold'],
    sell: {}, acquire: {}, joint: {}, gift: {},
    assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true }
  }, over || {});
}

console.log('\nT-001 공시가 8억 실거주 1주택 → 2026 현행·2027 정부안 모두 종부세 0');
{
  const inp = baseInput();
  const cur = E.holdSim(inp, 'current');
  const ref = E.holdSim(inp, 'reform');
  T('2026 현행 종부세 0', cur[0].jong.total === 0, `got ${cur[0].jong.total}`);
  T('2027 정부안 종부세 0', ref[1].jong.total === 0, `got ${ref[1].jong.total}`);
  T('2028 정부안 종부세 0', ref[2].jong.total === 0, `got ${ref[2].jong.total}`);
}

console.log('\nT-002 공시가 15억 · 60세 · 10년 거주 · 2028 정부안 → 종부세 10.8만원(농특세 포함) · 보유세 353.7만원');
{
  // 정부 문답 공식 사례 — 단위 검증 (2026년 재산세 특례 공정비율 45% 기준)
  const pt = E.propertyTax(15 * 억, true, true);
  const j = E.jongbuPerson({
    year: 2028, scen: 'reform', pubSum: 15 * 억, houseCount: 1, hasAdj: true,
    isOne: true, oneLive: true, liveShare: 1, age: 60, holdY: 10, liveY: 10,
    aggPBase: 15 * 억 * pt.fair, avgFair: pt.fair, propMainPaid: pt.main, prevTotal: 0
  });
  T('재산세 공정비율 45%', pt.fair === 0.45, `got ${pt.fair}`);
  T('재산세 본세 207만', approx(pt.main, 207 * 만, 1), `got ${pt.main}`);
  T('재산세 합계 342.9만', approx(pt.total, 342.9 * 만, 1000), `got ${pt.total}`);
  T('종부 과세표준 7,000만', approx(j.base, 7000 * 만, 1), `got ${j.base}`);
  T('공제할 재산세액 12.6만', approx(j.propCredit, 12.6 * 만, 100), `got ${j.propCredit}`);
  T('세액공제율 60%', approx(j.creditRate, 0.60, 0.001), `got ${j.creditRate}`);
  T('종부세 합계(농특 포함) ≈ 10.8만 (10.75만)', approx(j.total, 10.75 * 만, 500), `got ${j.total}`);
  const holdTotal = pt.total + j.total;
  T('보유세 합계 ≈ 353.7만', approx(holdTotal, 353.65 * 만, 1000), `got ${holdTotal}`);
  T('표시단위 종부세 10.8만', Math.round(j.total / 1000) === 108, `got ${Math.round(j.total / 1000)}`);
  T('표시단위 보유세 353.7만', Math.round(holdTotal / 1000) === 3537, `got ${Math.round(holdTotal / 1000)}`);
}

console.log('\nT-002b 파이프라인 검증 — 2026년 58세·거주 8년 시작 → 2028년 60세·10년');
{
  const inp = baseInput({ people: { me: { age: 58 }, spouse: {} } });
  inp.houses[0].official = 15;
  inp.houses[0].acqDate = '2018-06';
  inp.houses[0].livePeriods = [{ from: '2018-06', to: '' }];
  const ref = E.holdSim(inp, 'reform');
  const r28 = ref[2];
  // 2027년 이후 1주택 공정시장가액비율 특례 60% 복귀 가정(P0-3A')으로 파이프라인 수치가
  // 공식사례 단순계산(353.7만)과 달라짐 — 단위 검증(T-002)은 그대로 유지됨.
  // [2026-08-12] 과세표준상한 산식 교정(§110의2): 상승률 0%에서는 상한 미작동 →
  // 재산세 482.4만(15억×60% 과표 9억) + 종부 8.74만 = 491.14만 (test/gen_expected.js 산출)
  T('2028 종부세 ≈ 8.74만', approx(r28.jong.total, 87360, 500), `got ${r28.jong.total}`);
  T('2028 보유세 ≈ 491.14만', approx(r28.holdTax, 4911360, 1500), `got ${r28.holdTax}`);
}

console.log('\nT-003 2027년 3주택 이상 → 중과 체계 최고 5% 적용');
{
  const P = E.jongParams(2027, 'reform');
  const t3 = P.table(3), t2 = P.table(2);
  T('3주택 표 최고 5%', t3[t3.length - 1][1] === 0.05, `got ${t3[t3.length - 1][1]}`);
  T('2주택 표 최고 3.5%', t2[t2.length - 1][1] === 0.035, `got ${t2[t2.length - 1][1]}`);
}

console.log('\nT-004 2028 비중과·비조정 다주택 장특공제 — 보유 연1%·최대15% vs 거주 연2%·최대30% 중 큰 값');
{
  const P = E.yangdoParams(2028, 'reform');
  T('mode max', P.gen.mode === 'max');
  T('보유 1%/15%', P.gen.hold === 0.01 && P.gen.holdMax === 0.15, JSON.stringify(P.gen));
  T('거주 2%/30%', P.gen.live === 0.02 && P.gen.liveMax === 0.30, JSON.stringify(P.gen));
  const yd = E.yangdoCore({
    year: 2028, scen: 'reform', sale: 10 * 억, acq: 5 * 억, cost: 0,
    holdY: 20, liveY: 10, isOne: false, needLive: false, heavyCount: 0,
    owners: [{ key: 'me', share: 1, age: 50 }]
  });
  T('장특율 20% (거주 기준 우세)', approx(yd.ltcgRate, 0.20, 1e-9), `got ${yd.ltcgRate}`);
}

console.log('\nT-005 2029년 1주택 — 보유공제 없이 거주 연8%·최대 80%');
{
  const P = E.yangdoParams(2029, 'reform');
  T('one live 8%/80%, hold 0', P.one.live === 0.08 && P.one.liveMax === 0.80 && P.one.hold === 0, JSON.stringify(P.one));
  const yd = E.yangdoCore({
    year: 2029, scen: 'reform', sale: 20 * 억, acq: 8 * 억, cost: 0,
    holdY: 12, liveY: 12, isOne: true, needLive: false, heavyCount: 0,
    fullPrice: 20 * 억,
    owners: [{ key: 'me', share: 1, age: 55 }]
  });
  T('장특율 = 8%×12 → 80% 상한', approx(yd.ltcgRate, 0.80, 1e-9), `got ${yd.ltcgRate}`);
}

console.log('\nT-006 공동명의 1주택 — 개별납부와 특례 모두 계산·차액 표시');
{
  const inp = baseInput();
  inp.houses[0].official = 20;
  inp.houses[0].shares = { me: 50, spouse: 50, other: 0 };
  const cur = E.holdSim(inp, 'current');
  const j = cur[0].jong;
  T('joint-compare 모드', j.mode === 'joint-compare', j.mode);
  T('개별납부 2인 계산', j.joint.indiv.length === 2);
  T('특례 계산 존재', j.joint.special && j.joint.special.deduct === 12 * 억, JSON.stringify(j.joint.special && j.joint.special.deduct));
  T('유리한 쪽 선택(개별)', j.joint.best === 'indiv', j.joint.best);
  T('총액 = min', approx(j.total, Math.min(j.joint.indivTotal, j.joint.special.total), 1));
  const ref = E.holdSim(inp, 'reform');
  T('정부안에도 비교 존재', ref[2].jong.mode === 'joint-compare');
}

console.log('\nT-007 지분 합계 99.9% → 계산 중단');
{
  const inp = baseInput();
  inp.houses[0].shares = { me: 50, spouse: 49.9, other: 0 };
  const v = E.validateInput(inp);
  T('blocked', v.blocked === true);
  T('SHARE_SUM 오류', v.errors.some(e => e.code === 'SHARE_SUM'));
}

console.log('\nT-009 6월 1일 전후 매도 → 해당 연도 보유세 납세의무 변화');
{
  const inp = baseInput({ purposes: ['hold', 'sell'] });
  inp.houses[0].official = 15;
  inp.sell = { houseId: 'h1', date: '2027-04', price: 25, cost: 3000 };
  const may = E.sellSim(inp, 'current');
  inp.sell.date = '2027-07';
  const jul = E.sellSim(inp, 'current');
  T('5월 매도 시 그해 보유세 < 7월 매도', may.rows[1].hold < jul.rows[1].hold,
    `${may.rows[1].hold} vs ${jul.rows[1].hold}`);
}

console.log('\nT-010 배우자 지분 증여 → 증여세·취득세·이월과세 경고 동시');
{
  const inp = baseInput({ purposes: ['hold', 'gift'] });
  inp.houses[0].official = 12;
  inp.gift = { type: 'spouse_share', relation: 'spouse', houseId: 'h1', share: 50, value: 20, debt: 0, prior: 0, date: '2026-10' };
  const g = E.giftFull(inp);
  T('증여세 6,790만', approx(g.gt.tax, 6790 * 만, 1000), `got ${g.gt.tax}`);
  T('취득세 존재', g.at.total > 0);
  T('이월과세 경고', g.warnings.some(w => w.includes('이월과세')));
  T('총비용 = 증여세+취득세', approx(g.total, g.gt.tax + g.at.total, 1));
}

console.log('\nT-011 부담부증여 → 채무부분 증여자 양도세 총비용 포함');
{
  const inp = baseInput({ purposes: ['hold', 'gift'] });
  inp.situation = 'two';
  inp.houses.push({
    id: 'h2', name: '주택 2', area85: false, region: '경기',
    adjNow: 'no', adjAcq: 'no', adjSale: 'no',
    priceMode: 'official', official: 6, market: 0,
    acqPrice: 4, acqDate: '2019-03',
    shares: { me: 100, spouse: 0, other: 0 },
    livePeriods: [], flags: {}
  });
  inp.gift = { type: 'burden', relation: 'child', houseId: 'h2', share: 100, value: 9, debt: 3, prior: 0, date: '2026-10' };
  const g = E.giftFull(inp);
  T('증여자 양도세 계산됨', g.giverYangdo && g.giverYangdo.total > 0, g.giverYangdo && g.giverYangdo.total);
  T('총비용에 양도세 포함', approx(g.total, g.gt.tax + g.at.total + (g.atOnerous ? g.atOnerous.total : 0) + g.giverYangdo.total, 1));
  T('증여세 1.0185억', approx(g.gt.tax, 1.0185 * 억, 5000), `got ${g.gt.tax}`);
}

console.log('\nT-012 공시가격 기준 ±5% → 3개 민감도·신뢰도 전환');
{
  const inp = baseInput();
  inp.houses[0].official = 13.5;
  const sens = E.sensitivity(inp);
  T('3개 시나리오', sens.rows.length === 3);
  T('경계 근접 감지', sens.nearBoundary === true);
  const v = E.validateInput(inp);
  const c = E.confidenceGrade(inp, v, sens);
  T('신뢰도 B (확정값·경계 근접)', c.grade === 'B', c.grade);
  inp.houses[0].priceMode = 'market';
  inp.houses[0].market = 13.5 / 0.69;
  const v2 = E.validateInput(inp);
  const c2 = E.confidenceGrade(inp, v2, E.sensitivity(inp));
  T('신뢰도 C (추정값+경계 근접)', c2.grade === 'C', c2.grade);
}

console.log('\n추가 — 임계점 역산·비거주 1주택·취득세');
{
  const inp = baseInput();
  const thr = E.thresholds(inp);
  T('현행 문턱 12억', thr.current.pub === 12 * 억, thr.current.pub);
  T('정부안 실거주 문턱 14억', thr.reform.pub === 14 * 억, thr.reform.pub);
  T('시세 환산 ≈ 20.3억', approx(thr.reform.market, 14 * 억 / 0.69, 1e4), thr.reform.market);

  const away = baseInput({ situation: 'one_away' });
  away.houses[0].livePeriods = [];
  away.houses[0].official = 10;
  const refAway = E.holdSim(away, 'reform');
  // 9·1 수정 정부안: 비거주 1주택 기본공제 12억 유지(8·3안 9억 철회) → 10억은 정부안에서도 비과세
  T('비거주 1주택 10억 — 정부안 비과세(공제 12억, 9·1 수정)', refAway[1].jong.total === 0 && refAway[1].jong.persons[0].deduct === 12 * 억, refAway[1].jong.total);
  const curAway = E.holdSim(away, 'current');
  T('비거주 1주택 10억 — 현행 비과세(공제 12억)', curAway[0].jong.total === 0);

  const a = E.acquisitionTax({ price: 12 * 억, housesAfter: 2, adj: true, big85: true, temp2: true, firstHome: false });
  T('일시적2주택 표준세율(3%)', approx(a.rate, 0.03, 1e-9), a.rate);
  const a2 = E.acquisitionTax({ price: 12 * 억, housesAfter: 2, adj: true, big85: true, temp2: false, firstHome: false });
  T('조정 2주택 8%', a2.rate === 0.08, a2.rate);
}

console.log('\n공동명의 전환 분석');
{
  const inp = baseInput();
  inp.houses[0].official = 18;
  inp.joint = { houseId: 'h1', share: 50 };
  const j = E.jointConvertAnalysis(inp);
  T('전환비용 > 0', j.cost > 0, j.cost);
  T('절감 시계열 존재', j.savings.reform.length === 5);
  T('경고 포함(이월과세)', j.warnings.some(w => w.includes('이월과세')));
}

console.log(`\n단위 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
