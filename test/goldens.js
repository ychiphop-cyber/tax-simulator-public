'use strict';
/* ═══════════════════════════════════════════════════════════════════
   골든 케이스 회귀 테스트 — 수정 지시서(2026-08-11) 1장
   3개 실사례를 8·3 세제개편안 상세본·현행 법령과 수기 대조해 고정한 값.
   ⚠ 이 기대값을 코드에 맞추어 수정하지 말 것. 값이 달라지면 코드가
     바뀐 것이므로 원인을 먼저 보고한다. (지시서 §7)
   허용 오차: 화면 반올림 단위(만원) 기준 ±1만원 = ±10,000원

   [2026-08-12 갱신] 점검 지시서 이슈 3(재산세 과세표준상한 산식 교정, 지방세법
   §110의2: 상한액 = 직전연도 시가표준액×당해 공정시장가액비율 + 당해 과표×5%)에
   따라 2027년 이후 셀을 갱신했다. 상승률 0%에서는 상한이 걸리지 않으므로 옛 값
   (793만 등)은 잘못된 상한식의 산물이었다. 갱신값은 test/gen_expected.js(엔진과
   독립된 reference.js 법정 산식)로 산출했고, GC-1 2027 현행(재산세 876.72만 +
   종부 142.32만 = 1,019.0만)은 수기 검산과 일치한다. 종부세 상세(공제·한도 등)
   골든은 전부 원값 그대로다.
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const 만 = E.만, 억 = E.억;

let pass = 0, fail = 0;
const TOL = 1 * 만;
function T(name, actual, expected만) {
  const exp = expected만 * 만;
  if (Math.abs(actual - exp) <= TOL) { pass++; console.log(`  ✓ ${name} (${(actual / 만).toFixed(1)}만)`); }
  else { fail++; console.log(`  ✗ ${name} — 기대 ${expected만}만, 실제 ${(actual / 만).toFixed(2)}만`); }
}
function TB(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}

/* UI 입력(liveMode/liveFrom) → 엔진 입력(livePeriods) 실체화 — ui.js numInp와 동일 규칙 */
function mat(ui) {
  const inp = JSON.parse(JSON.stringify(ui));
  inp.houses = inp.houses.map(h => {
    const periods = [];
    for (const p of (h.pastPeriods || [])) if (p.from && p.to) periods.push({ from: p.from, to: p.to });
    if (h.liveMode === 'now') periods.push({ from: h.liveFrom || h.acqDate || (inp.assumptions.baseYear - 10) + '-01', to: '' });
    return Object.assign({}, h, { livePeriods: periods });
  });
  return inp;
}
const BASE_ASSUMP = { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true };
function house(over) {
  return Object.assign({
    id: 'h1', name: '', area85: false, region: '서울',
    adjNow: 'yes', adjAcq: 'yes', adjSale: 'yes',
    priceMode: 'official', official: 0, market: '',
    acqPrice: 0, acqDate: '',
    ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 }, acqCause: 'buy',
    liveMode: 'none', liveFrom: '', pastPeriods: [],
    flags: { temp2: false, inherit: false, lowLocal: false, rental: false, popDecline: false }
  }, over);
}
function inputOf(over) {
  return Object.assign({
    situation: 'one_live',
    rights: { presale: false, occupancy: false, inherited: false },
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses: [],
    purposes: ['hold'],
    sell: {}, acquire: {}, joint: { houseId: null, share: 50, prior: 0 }, gift: {},
    assumptions: Object.assign({}, BASE_ASSUMP)
  }, over);
}

/* ── GC-1 · 비거주 1주택 부부 공동명의 (공시 25.6억) ───────────────── */
console.log('\nGC-1 비거주 1주택 · 부부 공동명의 50/50 · 공시 25.6억');
{
  const inp = mat(inputOf({
    situation: 'one_away',
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses: [house({ official: 25.6, acqPrice: 14, acqDate: '2016-05', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, liveMode: 'none' })]
  }));
  const cur = E.holdSim(inp, 'current');
  const ref = E.holdSim(inp, 'reform');
  T('2026 현행 합계 814만', cur[0].holdTax, 814);
  T('2026 재산세 639만', cur[0].prop.total, 639);
  T('2026 종부세 175만', cur[0].jong.total, 175);
  T('2027 현행 1,019만 (상한 미작동·특례비율 일몰)', cur[1].holdTax, 1019);
  T('2028 현행 1,019만', cur[2].holdTax, 1019);
  T('2029 현행 1,019만', cur[3].holdTax, 1019);
  T('2030 현행 1,019만', cur[4].holdTax, 1019);
  T('2027 정부안 1,435.8만', ref[1].holdTax, 1435.8);
  T('2028 정부안 1,659.7만', ref[2].holdTax, 1659.7);
  T('2029 정부안 1,659.7만', ref[3].holdTax, 1659.7);
  T('2030 정부안 1,659.7만', ref[4].holdTax, 1659.7);
  const j = ref[2].jong;
  TB('2028 joint-compare 모드', j.mode === 'joint-compare', j.mode);
  const me = j.joint.indiv[0].r;
  T('  개별납부(1인) 과표 7억400만', me.base, 70400);
  T('  개별납부(1인) 산출세액 495만', me.gross, 495);
  T('  개별납부(1인) 재산세공제 169만', me.propCredit, 169);
  T('  개별납부(1인) 합계 391만', me.total, 391);
  TB('  개별납부 기본공제 4억(비거주)', me.deduct === 4 * 억, E.won(me.deduct));
  TB('  개별납부 FMV 80%', Math.abs(me.fair - 0.80) < 1e-9, me.fair);
  T('  부부 개별 합산 783만', j.joint.indivTotal, 783);
  const sp = j.joint.special;
  T('  특례 과표 11억6,200만', sp.base, 116200);
  T('  특례 합계 974만', sp.total, 974);
  TB('  특례 기본공제 9억(비거주)', sp.deduct === 9 * 억, E.won(sp.deduct));
  TB('  판정: 개별납부 유리', j.joint.best === 'indiv', j.joint.best);
}

/* ── GC-1b · GC-1에서 거주만 변경 ──────────────────────────────────── */
console.log('\nGC-1b 거주 여부만 변경 (실거주)');
{
  const inp = mat(inputOf({
    situation: 'one_live',
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses: [house({ official: 25.6, acqPrice: 14, acqDate: '2016-05', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, liveMode: 'now', liveFrom: '2016-05' })]
  }));
  const cur = E.holdSim(inp, 'current');
  const ref = E.holdSim(inp, 'reform');
  T('2026 현행 814만 (GC-1과 동일)', cur[0].holdTax, 814);
  T('2028 정부안 1,068.3만', ref[2].holdTax, 1068.3);
  TB('2028 현행 대비 +49만 내외', Math.abs((ref[2].holdTax - cur[2].holdTax) - 49.3 * 만) <= TOL, ((ref[2].holdTax - cur[2].holdTax) / 만).toFixed(1) + '만');
  const j = ref[2].jong;
  TB('개별납부 기본공제 각 9억(거주)', j.joint.indiv.every(x => x.r.deduct === 9 * 억), E.won(j.joint.indiv[0].r.deduct));
  TB('특례 기본공제 14억(실거주)', j.joint.special.deduct === 14 * 억, E.won(j.joint.special.deduct));
}

/* ── GC-2 · 강남 초고가 1주택 · 단독 · 공동명의 전환 검토 ─────────── */
console.log('\nGC-2 초고가 1주택 · 단독 · 공시 45억 · 66세/거주 20년 · 공동명의 전환');
{
  const h = house({ id: 'gc2h', official: 45, acqPrice: 12, acqDate: '2006-03', ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 }, liveMode: 'now', liveFrom: '2006-03' });
  const inp = mat(inputOf({
    situation: 'one_live',
    people: { me: { age: 66 }, spouse: { age: 63 } },
    houses: [h],
    purposes: ['hold', 'joint'],
    joint: { houseId: 'gc2h', share: 50, prior: 0 }
  }));
  const cur = E.holdSim(inp, 'current');
  const ref = E.holdSim(inp, 'reform');
  T('2026 현행 합계 1,568만', cur[0].holdTax, 1568);
  T('2026 재산세 1,180만', cur[0].prop.total, 1180);
  T('2026 종부세 388만', cur[0].jong.total, 388);
  T('2027 현행 1,958.1만', cur[1].holdTax, 1958.1);
  T('2028 현행 1,958.1만', cur[2].holdTax, 1958.1);
  T('2027 정부안 2,947.3만', ref[1].holdTax, 2947.3);
  T('2028 정부안 3,949.4만', ref[2].holdTax, 3949.4);
  const p = ref[2].jong.persons[0];
  T('  2028 과표 21억7,000만', p.base, 217000);
  T('  2028 산출세액 3,080만', p.gross, 3080);
  T('  2028 재산세공제 521만', p.propCredit, 521);
  TB('  세액공제율 80% 표시 유지', Math.abs(p.creditRate - 0.80) < 1e-9, p.creditRate);
  T('  세액공제 차감 600만 (한도)', p.credit, 600);
  TB('  한도 적용 플래그', p.creditCap === 600 * 만, String(p.creditCap));
  T('  종부세 합계 2,351만', p.total, 2351);
  T('  재산세 1,598.4만 (45억×60%, 상한 미작동)', ref[2].prop.total, 1598.4);
  const jc = E.jointConvertAnalysis(inp);
  T('전환: 이전 지분 평가액 32억6,087만', jc.value, 326087);
  T('전환: 증여세 8억7,722만', jc.gt.tax, 87722);
  T('전환: 증여 취득세 1억2,391만', jc.at.total, 12391);
  T('전환: 비용 합계 10억113만', jc.cost, 100113);
  TB('전환: 연평균 절감 458.6만 내외', Math.abs(jc.annual - 458.6 * 만) <= TOL, (jc.annual / 만).toFixed(1) + '만');
  TB('전환: 손익분기 60년 이상', jc.breakeven === null || jc.breakeven > 60, String(jc.breakeven));
}

/* ── GC-3 · 상속 2주택 (특례 적용 / 종료) ─────────────────────────── */
function gc3Input(inheritFlag) {
  return mat(inputOf({
    situation: 'two',
    rights: { presale: false, occupancy: false, inherited: true },
    people: { me: { age: 58 }, spouse: { age: 56 } },
    houses: [
      house({ id: 'g3h1', official: 15, acqPrice: 6, acqDate: '2013-06', ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 }, liveMode: 'now', liveFrom: '2013-06' }),
      house({ id: 'g3h2', official: 12, acqPrice: 12, acqDate: '2024-03', ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 }, acqCause: 'inherit', liveMode: 'none', flags: { temp2: false, inherit: inheritFlag, lowLocal: false, rental: false, popDecline: false } })
    ]
  }));
}
console.log('\nGC-3a 상속 2주택 · 특례 적용 (flags.inherit=true)');
{
  const inp = gc3Input(true);
  const cur = E.holdSim(inp, 'current');
  const ref = E.holdSim(inp, 'reform');
  T('2026 현행 1,173만', cur[0].holdTax, 1173);
  T('2028 정부안 1,049만', ref[2].holdTax, 1049);
  const p = ref[2].jong.persons[0];
  TB('  1세대1주택 판정 (기본공제 14억)', p.deduct === 14 * 억, E.won(p.deduct));
  TB('  FMV 70%', Math.abs(p.fair - 0.70) < 1e-9, p.fair);
  T('  과표 9억1,000만', p.base, 91000);
  T('  산출 763만', p.gross, 763);
  T('  재산세공제 218만', p.propCredit, 218);
  TB('  세액공제율 70%', Math.abs(p.creditRate - 0.70) < 1e-9, p.creditRate);
  T('  종부세 합계 196만', p.total, 196);
  T('  재산세 853만', ref[2].prop.total, 853);
}
console.log('\nGC-3b 상속 특례 종료 상태 (flags.inherit=false)');
{
  const inp = gc3Input(false);
  const cur = E.holdSim(inp, 'current');
  const ref = E.holdSim(inp, 'reform');
  T('2026 현행 1,550만', cur[0].holdTax, 1550);
  T('2026 재산세 853만', cur[0].prop.total, 853);
  T('2026 종부세 697만', cur[0].jong.total, 697);
  T('2027 현행 1,550만', cur[1].holdTax, 1550);
  T('2028 현행 1,550만', cur[2].holdTax, 1550);
  T('2027 정부안 2,202만', ref[1].holdTax, 2202);
  T('2028 정부안 2,758만', ref[2].holdTax, 2758);
  const p = ref[2].jong.persons[0];
  T('  기본공제 6억7,778만 (4+5×15/27)', p.deduct, 67778);
  TB('  FMV 80%', Math.abs(p.fair - 0.80) < 1e-9, p.fair);
  T('  과표 16억1,778만', p.base, 161778);
  T('  산출 1,976만', p.gross, 1976);
  T('  재산세공제 388만', p.propCredit, 388);
  T('  종부세 합계 1,905만', p.total, 1905);
}

/* ── P0-2 · 상속 특례 5년 만료의 연도별 반영 (지시서 §2 본안) ─────────
   골든 값이 아니라 동작 검증: 2024-03 상속 → 2029년 6월 1일부터 다주택 전환. */
console.log('\nP0-2 상속 특례 만료 — 2029년부터 다주택 전환');
{
  const inp = gc3Input(true);
  const exp = E.inheritExpiryYear(inp);
  TB('만료 연도 2029 판정', exp && exp.year === 2029, JSON.stringify(exp));
  const ref = E.holdSim(inp, 'reform');
  const cur = E.holdSim(inp, 'current');
  TB('2028까지는 1주택 특례 (기본공제 14억)', ref[2].jong.persons[0].deduct === 14 * 억, E.won(ref[2].jong.persons[0].deduct));
  TB('2029 정부안 — 다주택 기본공제(6.78억)로 전환', Math.abs(ref[3].jong.persons[0].deduct - 67778 * 만) <= TOL, E.won(ref[3].jong.persons[0].deduct));
  TB('2029 정부안 — FMV 80%로 전환', Math.abs(ref[3].jong.persons[0].fair - 0.80) < 1e-9, String(ref[3].jong.persons[0].fair));
  TB('2029 정부안 보유세가 2028 대비 급증', ref[3].holdTax > ref[2].holdTax + 300 * 만, `${(ref[2].holdTax / 만).toFixed(0)}만 → ${(ref[3].holdTax / 만).toFixed(0)}만`);
  TB('2029 현행도 다주택 전환으로 증가', cur[3].holdTax > cur[2].holdTax + 100 * 만, `${(cur[2].holdTax / 만).toFixed(0)}만 → ${(cur[3].holdTax / 만).toFixed(0)}만`);
  TB('2030도 다주택 유지', ref[4].jong.persons[0].deduct < 14 * 억, E.won(ref[4].jong.persons[0].deduct));
  // 무기한 예외: 지분 40% 이하
  const inp40 = gc3Input(true);
  inp40.houses[1].shares = { me: 40, spouse: 0, other: 60 };
  TB('지분 40% 이하 — 만료 없음', E.inheritExpiryYear(inp40) === null, JSON.stringify(E.inheritExpiryYear(inp40)));
  // 무기한 예외: 지분 상당 공시가 저가 (수도권 6억)
  const inpLow = gc3Input(true);
  inpLow.houses[1].official = 5.5;
  TB('지분 공시가 6억 이하(수도권) — 만료 없음', E.inheritExpiryYear(inpLow) === null, JSON.stringify(E.inheritExpiryYear(inpLow)));
  // [2026-08-13 지시서 오류 8] 상속개시일 미입력 시 특례를 '적용하지 않는다'로 반전 —
  // 필수정보 없이 유리한 자동 적용 금지. 미입력 → 주택 수 포함(다주택 공제) + 안내.
  const inpNoDate = gc3Input(true);
  inpNoDate.houses[1].acqDate = '';
  TB('상속개시일 미입력 — 특례 미적용(다주택 판정)', E.inheritExpiryYear(inpNoDate) === null && E.holdSim(inpNoDate, 'reform')[4].jong.persons[0].deduct < 14 * 억, '');
  // 결론 문장에 전환 안내 포함
  const valid = E.validateInput(inp);
  const concl = E.conclusionOf(inp, cur, ref, valid, E.sensitivity(inp));
  TB('결론 extra에 2029 전환 문구', !!(concl.extra && concl.extra.includes('2029')), String(concl.extra).slice(0, 60));
}

/* ── P1-2 · 재산세 특례비율 유지/일몰 토글 ─────────────────────────── */
console.log('\nP1-2 재산세 1주택 특례비율 가정 토글');
{
  const mk = keep => {
    const inp = mat(inputOf({
      situation: 'one_live',
      houses: [house({ official: 25.6, acqPrice: 14, acqDate: '2016-05', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, liveMode: 'none' })]
    }));
    inp.assumptions.propFairKeep = keep;
    return inp;
  };
  const sunset = E.holdSim(mk(false), 'current');
  const keep = E.holdSim(mk(true), 'current');
  T('기본(일몰) 2027 = 1,019만', sunset[1].holdTax, 1019);
  TB('유지 가정 시 2027 재산세 감소', keep[1].prop.total < sunset[1].prop.total - 10 * 만,
    `${(keep[1].prop.total / 만).toFixed(0)}만 vs ${(sunset[1].prop.total / 만).toFixed(0)}만`);
  TB('유지 가정 2027 공정비율 45%', Math.abs(keep[1].prop.rows[0].pt.fair - 0.45) < 1e-9, String(keep[1].prop.rows[0].pt.fair));
  TB('2026년은 두 가정 동일', Math.abs(keep[0].holdTax - sunset[0].holdTax) < 1, '');
}

console.log(`\n골든 케이스: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
