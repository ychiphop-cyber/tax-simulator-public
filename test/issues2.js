'use strict';
/* ═══════════════════════════════════════════════════════════════════
   2026-08-13 유지보수 지시서 — 세법 오류 8건 + 핵심 회귀 사례
   기준: 2026년 세제개편안 상세본(p68~74)·문답자료(p48~54) 원문 대조.
   기대 금액은 지시서 수기 검산값 및 법정 산식 직접 계산으로 산출.
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const { 억, 만 } = E;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 만 : tol);

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

/* ── 오류 1 · 입력한 매도연도(2035) 반영 ── */
console.log('\n[오류 1] 2035년 매도 입력이 시뮬레이션에 반영');
{
  const inp = inputOf([house({ id: 'x', official: 15, acqPrice: 7, acqDate: '2019-01', livePeriods: [{ from: '2019-02', to: '' }] })], { purposes: ['hold', 'sell'] });
  inp.sell = { houseId: 'x', date: '2035-01-15', price: 22, cost: 3000 };
  const sim = E.sellSim(inp, 'reform');
  T('2035년 행이 존재', sim.rows.some(r => r.year === 2035), JSON.stringify(sim.rows.map(r => r.year)));
  T('비교 구간 = 2031~2035 (입력 연도 중심)', sim.years[0] === 2031 && sim.years[4] === 2035, JSON.stringify(sim.years));
  const r35 = sim.rows.find(r => r.year === 2035);
  T('2035 누적 보유세 = 2026~2034 반영(>0)', r35.cum > 500 * 만, `cum=${(r35.cum / 만).toFixed(0)}만`);
  T('2035 세율 체계 = 2029~ 정부안', r35.yangdo.label.includes('2029'), r35.yangdo.label);
  // 기본 구간 내 입력은 기존 5개 연도 유지
  inp.sell.date = '2027-03-15';
  const sim2 = E.sellSim(inp, 'reform');
  T('구간 내 입력은 2026~2030 유지', sim2.years[0] === 2026 && sim2.years.length === 5, JSON.stringify(sim2.years));
}

/* ── 오류 2 · 미래 전입 예정 ── */
console.log('\n[오류 2] 미래 전입 예정일의 연도별 거주 판정');
{
  const mk = from => inputOf([house({ id: 'x', official: 20, acqPrice: 9, acqDate: '2019-01', livePeriods: [{ from, to: '' }] })]);
  const ref27 = E.holdSim(mk('2027-01'), 'reform');
  T('전입 2027-01: 2027년 기준일(6/1) 거주 → 공제 14억', ref27[1].jong.persons[0].deduct === 14 * 억, E.won(ref27[1].jong.persons[0].deduct));
  const ref30 = E.holdSim(mk('2030-01'), 'reform');
  T('전입 2030-01: 2027년은 비거주 → 공제 12억 (9·1 수정)', ref30[1].jong.persons[0].deduct === 12 * 억, E.won(ref30[1].jong.persons[0].deduct));
  T('전입 2030-01: 2029년도 비거주 → 12억 (9·1 수정)', ref30[3].jong.persons[0].deduct === 12 * 억, E.won(ref30[3].jong.persons[0].deduct));
  T('전입 2030-01: 2030년부터 거주 → 14억', ref30[4].jong.persons[0].deduct === 14 * 억, E.won(ref30[4].jong.persons[0].deduct));
  T('liveNowOf 시점 인식: 2026-06엔 비거주', E.liveNowOf([{ from: '2027-01', to: '' }], '2026-06') === false, '');
  T('futureMoveIn 감지', E.futureMoveIn([{ from: '2027-01', to: '' }], '2026-08') === '2027-01', '');
  T('거주기간은 전입일부터만 기산 (2035-01 기준 8.0년)', near(E.liveYearsOf([{ from: '2027-01', to: '' }], '2035-01'), 8.0, 0.01), String(E.liveYearsOf([{ from: '2027-01', to: '' }], '2035-01')));
  const v = E.validateInput(mk('2027-01'));
  T('확인 문구: 실거주 예정 안내', v.confirms.some(c => c.code === 'FUTURE_MOVEIN'), JSON.stringify(v.confirms.map(c => c.code)));
}

/* ── 오류 3 · '26년 양도분 중과 완화 특례규정 (상세본 p72) ── */
console.log("\n[오류 3] '26.5.10~ 양도분 — 정부안 신고 시 +5/+10%p 완화");
{
  const mk = n => {
    const hs = [house({ id: 'x', official: 14, acqPrice: 5, acqDate: '2011-01' }), house({ official: 9, acqPrice: 3 })];
    if (n === 3) hs.push(house({ official: 7, acqPrice: 2 }));
    const inp = inputOf(hs, { situation: 'two', purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'x', date: '2026-06-15', price: 20, cost: 0 };
    return inp;
  };
  const r2 = E.sellSim(mk(2), 'reform').rows[0];
  T('정부안 · 2주택 2026-06 양도 → +5%p (경과 특례)', near(r2.yangdo.surcharge, 0.05, 1e-9), String(r2.yangdo.surcharge));
  T('경과 특례 플래그·안내 표시', r2.yangdo.surTransition === true && r2.yangdo.notes.some(n => n.includes('특례규정')), '');
  T('장특공제 배제는 유지', r2.yangdo.ltcgRate === 0, String(r2.yangdo.ltcgRate));
  const r3 = E.sellSim(mk(3), 'reform').rows[0];
  T('정부안 · 3주택 → +10%p', near(r3.yangdo.surcharge, 0.10, 1e-9), String(r3.yangdo.surcharge));
  const c2 = E.sellSim(mk(2), 'current').rows[0];
  T('현행 유지 시나리오 → +20%p (경과규정 없음)', near(c2.yangdo.surcharge, 0.20, 1e-9), String(c2.yangdo.surcharge));
  // 2027년 양도: 정부안 본칙 +5%p (기존 세율표) — 회귀 확인
  const inp27 = mk(2); inp27.sell.date = '2027-06-15';
  const r27 = E.sellSim(inp27, 'reform').rows.find(r => r.year === 2027);
  T('2027년 양도 → +5%p (본칙)', near(r27.yangdo.surcharge, 0.05, 1e-9), String(r27.yangdo.surcharge));
}

/* ── 오류 4 · 고령자 특례 요건 검증 + 한도 안분 (조특법 §71의3) ── */
console.log('\n[오류 4] 고령자 지방이주 특례 — 요건 검증·한도 지분 안분');
{
  const mk = (live, joint) => {
    const inp = inputOf([house({
      id: 'x', official: 30, acqPrice: 8, acqDate: '2010-03',
      ownerType: joint ? 'joint' : 'me',
      shares: joint ? { me: 50, spouse: 50, other: 0 } : { me: 100, spouse: 0, other: 0 },
      livePeriods: live ? [{ from: '2010-03', to: '' }] : []
    })], { people: { me: { age: 67 }, spouse: { age: 66 } }, purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'x', date: '2027-03-15', price: 45, cost: 0, seniorMove: true };
    return inp;
  };
  // 거주 0년 → 미적용 + 사유 표시 (기존 버그: 그래도 5억 전액 감면)
  const r0 = E.sellSim(mk(false, false), 'reform').rows.find(r => r.year === 2027);
  T('거주 0년 — 특례 미적용', r0.yangdo.owners[0].senior === 0, String(r0.yangdo.owners[0].senior));
  T('미충족 사유 표시(계속 거주·총 거주)', r0.yangdo.notes.some(n => n.includes('미적용') && n.includes('거주')), JSON.stringify(r0.yangdo.notes.slice(-2)));
  // 요건 충족 단독 — 50% 감면, 한도 5억
  const r1 = E.sellSim(mk(true, false), 'reform').rows.find(r => r.year === 2027);
  T('요건 충족(단독) — 감면 적용', r1.yangdo.owners[0].senior > 0, '');
  T('  감면 = min(산출×50%, 5억)', near(r1.yangdo.owners[0].senior, Math.min(r1.yangdo.owners[0].gross * 0.5, 5 * 억), 1), '');
  // 50:50 공동명의 — 한도 각 2.5억 안분 (문답 p50)
  const rj = E.sellSim(mk(true, true), 'reform').rows.find(r => r.year === 2027);
  const caps = rj.yangdo.owners.map(o => Math.min(o.gross * 0.5, 2.5 * 억));
  T('50:50 — 인별 한도 2.5억 안분', rj.yangdo.owners.every((o, i) => near(o.senior, caps[i], 1)),
    JSON.stringify(rj.yangdo.owners.map(o => (o.senior / 억).toFixed(2))));
  T('  부부 합산 감면 ≤ 5억 (10억 아님)', rj.yangdo.owners.reduce((s, o) => s + o.senior, 0) <= 5 * 억 + 1, '');
  // 2029년 양도 → 적용기간 밖
  const inpLate = mk(true, false); inpLate.sell.date = '2029-03-15';
  const rl = E.sellSim(inpLate, 'reform').rows.find(r => r.year === 2029);
  T('2029년 양도 — 적용기간 밖 미적용', rl.yangdo.owners[0].senior === 0, '');
}

/* ── 오류 5 · 일시적 2주택 처분기한 (상세본 p73-74) ── */
console.log('\n[오류 5] 일시적 2주택 — 처분기한 계산·자동 해제');
{
  const mk = newAcq => inputOf([
    house({ id: 'old', official: 15, acqPrice: 6, acqDate: '2013-06', livePeriods: [{ from: '2013-06', to: '' }] }),
    house({ id: 'new', official: 12, acqPrice: 12, acqDate: newAcq, flags: { temp2: true, inherit: false, lowLocal: false, rental: false, popDecline: false } })
  ], { situation: 'two' });
  // '26.8.3 이전 취득 → 경과조치 3년: 2024-06 + 3년 = 2027-06 → 2027 기준일까지 1주택, 2028부터 2주택
  const a = E.holdSim(mk('2024-06'), 'reform');
  T("'24-06 취득(경과 3년): 2027까지 1주택(14억)", a[1].jong.persons[0].deduct === 14 * 억, E.won(a[1].jong.persons[0].deduct));
  T("  2028부터 특례 해제(다주택)", a[2].jong.persons[0].deduct < 14 * 억, E.won(a[2].jong.persons[0].deduct));
  T('  2029·2030도 다주택 유지 (기존 버그: 무기한 1주택)', a[3].jong.persons[0].deduct < 14 * 억 && a[4].jong.persons[0].deduct < 14 * 억, '');
  // '26.8.3 이후 취득 + 조정지역 → 2년: 2026-09 + 2년 = 2028-09 → 2028까지 1주택, 2029부터 해제
  const b = E.holdSim(mk('2026-09'), 'reform');
  T("'26-09 취득(조정 2년): 2028까지 1주택", b[2].jong.persons[0].deduct === 14 * 억, E.won(b[2].jong.persons[0].deduct));
  T('  2029부터 해제', b[3].jong.persons[0].deduct < 14 * 억, E.won(b[3].jong.persons[0].deduct));
  T('처분기한 계산기: 2026-09→2028-09', (E.temp2Deadline(mk('2026-09').houses) || {}).until === '2028-09', JSON.stringify(E.temp2Deadline(mk('2026-09').houses)));
  T('처분기한 계산기: 2024-06→2027-06 (3년)', (E.temp2Deadline(mk('2024-06').houses) || {}).until === '2027-06', '');
  // 비조정이면 '26.8.3 이후에도 3년
  const inpNa = mk('2026-09'); inpNa.houses.forEach(h => { h.adjNow = 'no'; });
  T('비조정 신규취득 — 3년 유지', (E.temp2Deadline(inpNa.houses) || {}).years === 3, '');
}

/* ── 오류 6 · 지방 특례 지역 판정 (상세본 p70-71) ── */
console.log('\n[오류 6] 광역시 제외·취득시기·가액 검증');
{
  const mk = (region, pub, acq) => inputOf([
    house({ id: 'a', official: 15, livePeriods: [{ from: '2016-05', to: '' }] }),
    house({ id: 'b', official: pub, region, adjNow: 'no', acqDate: acq, flags: { temp2: false, inherit: false, lowLocal: false, rental: false, popDecline: true } })
  ], { situation: 'two' });
  T('부산(광역시) 3.5억 — 인구감소 체크에도 미적용(다주택)', E.holdSim(mk('부산·대구 등 광역시', 3.5, '2026-03'), 'current')[0].jong.persons[0].deduct === 9 * 억, '');
  T('지방 3.5억 · 2026-03 취득 — 적용(1주택 12억)', E.holdSim(mk('그 외 지방', 3.5, '2026-03'), 'current')[0].jong.persons[0].deduct === 12 * 억, '');
  T("지방 3.5억 · 2025-06 취득 — '26.1.1 이전이라 미적용", E.holdSim(mk('그 외 지방', 3.5, '2025-06'), 'current')[0].jong.persons[0].deduct === 9 * 억, '');
  T('지방 5억 — 자동 인정 상한(4억) 초과라 미적용 + 안내', E.holdSim(mk('그 외 지방', 5, '2026-03'), 'current')[0].jong.persons[0].deduct === 9 * 억, '');
  const v = E.validateInput(mk('부산·대구 등 광역시', 3.5, '2026-03'));
  T('미적용 사유 안내(광역시·요건)', v.confirms.some(c => c.code === 'SPECIAL_INVALID'), '');
  T('지방 저가주택도 광역시 제외', E.lowLocalEligible(house({ region: '부산·대구 등 광역시', official: 2.5 })) === false, '');
}

/* ── 오류 7 · 기본공제 잔여액 방식 (문답 p48-49) ── */
console.log('\n[오류 7] 같은 해 다른 양도 기본공제 — 잔여액만 차감');
{
  const mk = (used, liveFrom) => {
    const inp = inputOf([house({ id: 'x', official: 18, acqPrice: 8, acqDate: '2014-05', livePeriods: [{ from: liveFrom, to: '' }] })], { purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'x', date: '2027-10-15', price: 25, cost: 0, sameYearOther: used != null, usedBasicDed: used };
    return inp;
  };
  // 10년 거주·30억 이하 → 확대 한도 2,500만: 토지에 250만 사용 → 잔여 2,250만 (문답 예시 그대로)
  const a = E.sellSim(mk(250, '2014-05'), 'reform').rows.find(r => r.year === 2027).yangdo.owners[0];
  T('확대공제 대상: 한도 2,500만·기사용 250만·잔여 2,250만', a.bdLimit === 2500 * 만 && a.bdUsed === 250 * 만 && near(a.basicDed, 2250 * 만, 1), JSON.stringify({ L: a.bdLimit, U: a.bdUsed, R: a.basicDed }));
  // 일반 공제: 250만 전액 기사용 → 잔여 0 (음수 없음)
  const b = E.sellSim(mk(250, '2020-05'), 'reform').rows.find(r => r.year === 2027).yangdo.owners[0];
  T('일반 공제: 250만 사용 → 잔여 0', b.bdLimit === 250 * 만 && near(b.basicDed, 0, 1), JSON.stringify({ L: b.bdLimit, R: b.basicDed }));
  // 기사용 500만 입력해도 한도 내로 클램프
  const c = E.sellSim(mk(500, '2020-05'), 'reform').rows.find(r => r.year === 2027).yangdo.owners[0];
  T('기사용 과다 입력 — 음수 공제 없음', c.basicDed === 0, String(c.basicDed));
  // 미사용(체크 안함) → 전액
  const d = E.sellSim(mk(null, '2014-05'), 'reform').rows.find(r => r.year === 2027).yangdo.owners[0];
  T('미체크 — 확대공제 2,500만 전액', near(d.basicDed, 2500 * 만, 1), String(d.basicDed));
}

/* ── 오류 8 · 상속개시일 누락 (goldens에서 판정 반전 검증) + 안내 ── */
console.log('\n[오류 8] 상속개시일 누락 시 특례 미적용');
{
  const inp = inputOf([
    house({ id: 'n1', official: 15, acqPrice: 6, acqDate: '2013-06', livePeriods: [{ from: '2013-06', to: '' }] }),
    house({ id: 'i1', official: 12, acqPrice: 12, acqDate: '', acqCause: 'inherit', flags: { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false } })
  ], { situation: 'two' });
  T('미입력 → 다주택 판정(특례 미적용)', E.holdSim(inp, 'reform')[2].jong.persons[0].deduct < 14 * 억, '');
  const v = E.validateInput(inp);
  T('누락 안내 문구(불리한 방향 명시)', v.confirms.some(c => c.msg.includes('상속개시일') && c.msg.includes('적용하지 않았')), '');
  inp.houses[1].acqDate = '2024-03';
  T('입력하면 특례 반영(14억)', E.holdSim(inp, 'reform')[2].jong.persons[0].deduct === 14 * 억, '');
}

/* ── §2 핵심 회귀 사례 · 서울 50:50 · 2019 취득 7억 · 2035-01-15 매도 22억 · 2027-01 전입 ── */
console.log('\n[§2 핵심 사례] 서울 공동명의 · 2035년 매도 · 2027년 전입');
{
  const mk = liveFrom => {
    const inp = inputOf([house({
      id: 'k', official: 14, acqPrice: 7, acqDate: '2019-01',
      ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 },
      livePeriods: liveFrom ? [{ from: liveFrom, to: '' }] : []
    })], { situation: 'one_away', purposes: ['hold', 'sell'] });
    inp.sell = { houseId: 'k', date: '2035-01-15', price: 22, cost: 3000 };
    return inp;
  };
  const ref = E.sellSim(mk('2027-01'), 'reform');
  const r35 = ref.rows.find(r => r.year === 2035);
  T('① 2035년 결과 생성', !!r35, '');
  T('② 완성 거주연수 8.0년 (2027-01~2035-01)', near(r35.liveY, 8.0, 0.01), String(r35.liveY));
  T('③ 개편 장특 = 거주 연 8% × 전체 실거주 8년 = 64%', near(r35.yangdo.ltcgRate, 0.64, 1e-9), String(r35.yangdo.ltcgRate));
  T('⑤ 개편 세액 ≈ 5,672만 (지방세 포함, 수기 검산)', near(r35.yangdo.total, 5672 * 만, 15 * 만), `${(r35.yangdo.total / 만).toFixed(0)}만`);
  const cur35 = E.sellSim(mk('2027-01'), 'current').rows.find(r => r.year === 2035);
  T('현행 장특 = 보유40% + 거주32% = 72%', near(cur35.yangdo.ltcgRate, 0.72, 1e-9), String(cur35.yangdo.ltcgRate));
  T('현행 세액 ≈ 3,614만 (수기 검산)', near(cur35.yangdo.total, 3614 * 만, 15 * 만), `${(cur35.yangdo.total / 만).toFixed(0)}만`);
  // ④ 2029년부터 새로 세지 않음 — 7년 거주(전입 2028-01)면 56%
  const r7 = E.sellSim(mk('2028-01'), 'reform').rows.find(r => r.year === 2035);
  T('④ 거주 7년(2028 전입) → 56% (2029년부터 다시 세지 않음)', near(r7.yangdo.ltcgRate, 0.56, 1e-9), String(r7.yangdo.ltcgRate));
  T('  개편 7년 세액 ≈ 7,730만', near(r7.yangdo.total, 7730 * 만, 15 * 만), `${(r7.yangdo.total / 만).toFixed(0)}만`);
  // 계속 비거주 — 거주요건 미충족 전액 과세
  const rNo = E.sellSim(mk(null), 'reform').rows.find(r => r.year === 2035);
  T('비거주 지속 — 비과세 미적용, 세액 ≈ 5억 9,776만', !rNo.yangdo.exempt && near(rNo.yangdo.total, 59776 * 만, 40 * 만), `${(rNo.yangdo.total / 만).toFixed(0)}만`);
  // ⑥⑦ 공동명의 안분
  const ow = r35.yangdo.owners;
  T('⑥ 부부 각자 과세표준·세액 동일 안분', ow.length === 2 && near(ow[0].tax, ow[1].tax, 1), '');
  T('⑥ 기본공제 인별 250만', ow.every(o => o.basicDed === 250 * 만), JSON.stringify(ow.map(o => o.basicDed)));
  T('⑦ 장특 한도 10억 — 인별 5억 안분(미도달 확인)', ow.every(o => o.ltcgCap === 5 * 억 && !o.ltcgCapped), JSON.stringify(ow.map(o => o.ltcgCap)));
  // ⑧ 개편/현행 비교 존재
  T('⑧ 개편 vs 현행 비교 가능 (값 상이)', Math.abs(r35.yangdo.total - cur35.yangdo.total) > 500 * 만, '');
}

console.log(`\n신규 이슈 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
