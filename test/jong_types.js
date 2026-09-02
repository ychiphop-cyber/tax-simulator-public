'use strict';
/* ═══════════════════════════════════════════════════════════════════
   종부세 보유형태별 기본공제 회귀 테스트 (2026-09-02 지시서 §10·§13)
   4가지 보유형태를 절대 같은 로직으로 처리하지 않는지 검증한다.
     TYPE 1  SINGLE_OWNER_ONE_HOUSEHOLD_HOME      1세대1주택 단독명의   실거주 14억 / 비거주 12억
     TYPE 2  JOINT_OWNER_ONE_HOUSEHOLD_HOME       부부 공동명의 1주택   개별납부 각 9억 / 각 6억 (+특례 비교)
     TYPE 3  MULTI_HOME_HOUSEHOLD_INDIVIDUAL_OWNER 부부 각 1채·일반 다주택 4억 + 5억 × 거주주택가액비율
   기대값은 2026.9.1 수정 정부안 조문 구조에서 직접 산출한 정액이며 엔진 출력 복사가 아니다.
   ═══════════════════════════════════════════════════════════════════ */
const E = require('../src/engine.js');
const { 억, 만 } = E;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1 : tol);

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
    situation: houses.length === 1 ? 'one_live' : houses.length === 2 ? 'two' : 'multi', rights: {},
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses, purposes: ['hold'],
    sell: {}, acquire: {}, joint: {}, gift: {},
    assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true, propFairKeep: true }
  }, over || {});
}
const LIVE = [{ from: '2016-05', to: '' }];
const ME = { ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 } };
const SP = { ownerType: 'spouse', shares: { me: 0, spouse: 100, other: 0 } };
const JOINT = (me, sp) => ({ ownerType: 'joint', shares: { me, spouse: sp, other: 0 } });

/* 2027 수정 정부안 기준 납세자별 공제 추출 */
function deds(inp, year = 2027) {
  const r = E.holdSim(inp, 'reform').find(x => x.year === year);
  const out = { mode: r.jong.mode, me: null, spouse: null, meType: null, spType: null, r };
  if (r.jong.mode === 'joint-compare') {
    for (const x of r.jong.joint.indiv) { out[x.key] = x.r.deduct; out[x.key === 'me' ? 'meType' : 'spType'] = x.r.taxpayerType; }
    out.special = r.jong.joint.special.deduct;
  } else {
    for (const p of r.jong.persons) { out[p.taxpayer] = p.deduct; out[p.taxpayer === 'me' ? 'meType' : 'spType'] = p.taxpayerType; }
  }
  return out;
}
const f = v => v == null ? '-' : (v / 억).toFixed(v % 억 === 0 ? 0 : 2) + '억';

/* ── 표 §13 + T1~T7 ── */
console.log('\n[보유형태 표] 2027 수정 정부안 기본공제');
const table = [];
function row(label, inp, expMe, expSp, rule) {
  const d = deds(inp);
  const okMe = expMe == null ? d.me == null : near(d.me, expMe);
  const okSp = expSp == null ? d.spouse == null : near(d.spouse, expSp);
  table.push({ label, me: f(d.me), sp: f(d.spouse), rule, ok: okMe && okSp, type: d.meType || d.spType });
  T(`${label} — 남편 ${f(expMe)} / 아내 ${f(expSp)}`, okMe && okSp, `실제 ${f(d.me)} / ${f(d.spouse)} (${d.mode})`);
  return d;
}
// T1 / T2 — TYPE 1
const t1 = row('1세대1주택 남편 단독·거주', inputOf([house(Object.assign({ official: 20, livePeriods: LIVE }, ME))]), 14 * 억, null, '1세대1주택');
T('T1 유형 = one(SINGLE_OWNER_ONE_HOUSEHOLD_HOME)', t1.meType === 'one', t1.meType);
const t2 = row('1세대1주택 남편 단독·비거주', inputOf([house(Object.assign({ official: 20 }, ME))], { situation: 'one_away' }), 12 * 억, null, '1세대1주택');
T('T2 유형 = one', t2.meType === 'one', t2.meType);
// T3 / T4 — TYPE 2
const t3 = row('부부 공동명의 1주택·거주', inputOf([house(Object.assign({ official: 20, livePeriods: LIVE }, JOINT(50, 50)))]), 9 * 억, 9 * 억, '공동명의 개별납부');
T('T3 joint-compare + 특례 14억 병행 계산', t3.mode === 'joint-compare' && t3.special === 14 * 억, `${t3.mode} / ${f(t3.special)}`);
T('T3 유형 = jointOneIndiv', t3.meType === 'jointOneIndiv' && t3.spType === 'jointOneIndiv', `${t3.meType}/${t3.spType}`);
const t4 = row('부부 공동명의 1주택·비거주', inputOf([house(Object.assign({ official: 20 }, JOINT(50, 50)))], { situation: 'one_away' }), 6 * 억, 6 * 억, '공동명의 개별납부');
T('T4 joint-compare + 특례 12억 병행 계산', t4.mode === 'joint-compare' && t4.special === 12 * 억, `${t4.mode} / ${f(t4.special)}`);
// T5 / T6 / T7 — TYPE 3 (부부 각 1채)
const mkPair = (liveA, liveB) => inputOf([
  house(Object.assign({ id: 'A', official: 12, livePeriods: liveA ? LIVE : [] }, ME)),
  house(Object.assign({ id: 'B', official: 9, acqDate: '2019-03', livePeriods: liveB ? LIVE : [] }, SP))
]);
const t5 = row('남편 A·아내 B, A 거주', mkPair(true, false), 9 * 억, 4 * 억, '그 외 납세자');
T('T5 per-taxpayer 모드 (joint-compare 아님)', t5.mode === 'per-taxpayer', t5.mode);
T('T5 유형 = multi(MULTI_HOME_HOUSEHOLD_INDIVIDUAL_OWNER) 양쪽', t5.meType === 'multi' && t5.spType === 'multi', `${t5.meType}/${t5.spType}`);
const t6 = row('남편 A·아내 B, B 거주', mkPair(false, true), 4 * 억, 9 * 억, '그 외 납세자');
const t7 = row('남편 A·아내 B, 모두 비거주', mkPair(false, false), 4 * 억, 4 * 억, '그 외 납세자');
T('T7 per-taxpayer', t7.mode === 'per-taxpayer', t7.mode);

/* ── T10 — 부부 각 1채에 1세대1주택 공제(12/14억)·공동명의 공제(6/9억+특례)가 절대 적용되지 않음 ── */
console.log('\n[T10] 부부 각 1채 — 1세대1주택·공동명의 규정 오적용 방지');
{
  for (const [nm, inp] of [['A 거주', mkPair(true, false)], ['B 거주', mkPair(false, true)], ['모두 비거주', mkPair(false, false)]]) {
    for (const y of [2027, 2028, 2030]) {
      const d = deds(inp, y);
      T(`T10 ${nm} ${y} — 14억/12억 아님`, d.me !== 14 * 억 && d.me !== 12 * 억 && d.spouse !== 14 * 억 && d.spouse !== 12 * 억, `${f(d.me)}/${f(d.spouse)}`);
      T(`T10 ${nm} ${y} — 유형 multi (one/jointOneIndiv 아님)`, d.meType === 'multi' && d.spType === 'multi', `${d.meType}/${d.spType}`);
      T(`T10 ${nm} ${y} — 특례 비교 모드 아님`, d.mode === 'per-taxpayer', d.mode);
    }
  }
  // 세대 판정 필드
  const d = deds(mkPair(true, false));
  T('T10 세대 주택수 2 · 1세대1주택 아님', d.r.jong.oneStatus.one === false, JSON.stringify(d.r.jong.oneStatus));
  // 현행법(2026): 각자 9억 (1세대1주택 12억 아님)
  const cur = E.holdSim(mkPair(true, false), 'current')[0];
  T('T10 현행 2026 — 각자 9억 (12억 아님)', cur.jong.persons.every(p => p.deduct === 9 * 억), cur.jong.persons.map(p => f(p.deduct)).join('/'));
}

/* ── T8 / T9 — 한 사람이 여러 채: 거주주택가액 비율 ── */
console.log('\n[T8·T9] 1인 다주택 — 4억 + 5억 × 거주주택가액비율');
{
  const two = (a, b) => inputOf([
    house(Object.assign({ id: 'A', official: a, livePeriods: LIVE }, ME)),
    house(Object.assign({ id: 'B', official: b, acqDate: '2019-03' }, ME))
  ]);
  const d8 = deds(two(10, 10));
  T('T8 A10·B10, A 거주 → 비중 50% → 6.5억', near(d8.me, 6.5 * 억), f(d8.me));
  T('T8 아내 납세자 없음', d8.spouse == null, f(d8.spouse));
  const d9 = deds(two(15, 5));
  T('T9 A15·B5, A 거주 → 비중 75% → 7.75억', near(d9.me, 7.75 * 억), f(d9.me));
  const d9b = deds(two(5, 15));
  T('T9b A5·B15, A 거주 → 비중 25% → 5.25억', near(d9b.me, 5.25 * 억), f(d9b.me));
  T('거주주택 있음 ≠ 무조건 9억', d8.me !== 9 * 억 && d9.me !== 9 * 억, '');
  // 3채 전부 보유·1채 거주 (12/6/2 → 60%)
  const three = inputOf([
    house(Object.assign({ id: 'A', official: 12, livePeriods: LIVE }, ME)),
    house(Object.assign({ id: 'B', official: 6, acqDate: '2019-03' }, ME)),
    house(Object.assign({ id: 'C', official: 2, acqDate: '2021-01' }, ME))
  ]);
  const d3 = deds(three);
  T('3주택 12/6/2, A 거주 → 60% → 7억', near(d3.me, 7 * 억), f(d3.me));
}

/* ── §7 복합 보유: 남편 A 100% + B 50%, 아내 B 50%, A 거주 ── */
console.log('\n[§7] 복합 보유 — 납세자별 소유·지분가액으로 각각 산출');
{
  const inp = inputOf([
    house(Object.assign({ id: 'A', official: 12, livePeriods: LIVE }, ME)),
    house({ id: 'B', official: 8, acqDate: '2019-03', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 } })
  ]);
  const d = deds(inp);
  // 남편: A 12억(거주) + B 지분 4억 → 거주비중 12/16 = 75% → 4 + 5×0.75 = 7.75억
  T('§7 남편 = 4억 + 5억 × (12 ÷ 16) = 7.75억', near(d.me, 7.75 * 억), f(d.me));
  // 아내: B 지분 4억(비거주) → 0% → 4억
  T('§7 아내 = 4억 (소유주택 전부 비거주)', near(d.spouse, 4 * 억), f(d.spouse));
  T('§7 per-taxpayer · 세대 2주택', d.mode === 'per-taxpayer' && d.r.jong.oneStatus.one === false, d.mode);
  // 반대: 부부가 B(공동명의)에 거주 → 남편 4/16=25% → 5.25억, 아내 100% → 9억
  const inp2 = inputOf([
    house(Object.assign({ id: 'A', official: 12 }, ME)),
    house({ id: 'B', official: 8, acqDate: '2019-03', ownerType: 'joint', shares: { me: 50, spouse: 50, other: 0 }, livePeriods: LIVE })
  ]);
  const d2 = deds(inp2);
  T('§7-b B 거주: 남편 = 4억 + 5억 × 25% = 5.25억', near(d2.me, 5.25 * 억), f(d2.me));
  T('§7-b B 거주: 아내 = 9억 (보유분 전부 거주용)', near(d2.spouse, 9 * 억), f(d2.spouse));
}

/* ── 납세자별 설명 필드 (§8·§9·§12) ── */
console.log('\n[§8·§9·§12] 납세자별 데이터·유형·설명 필드');
{
  const d = deds(mkPair(true, false));
  const me = d.r.jong.persons.find(p => p.taxpayer === 'me'), sp = d.r.jong.persons.find(p => p.taxpayer === 'spouse');
  T('household 필드', d.r.jong.household && d.r.jong.household.householdHouseCount === 2 && d.r.jong.household.isHouseholdOneHome === false && d.r.jong.household.residenceHouseId === 'A', JSON.stringify(d.r.jong.household));
  T('남편 owner 필드', me.owner && me.owner.ownedHouses.length === 1 && near(me.owner.totalOwnedValue, 12 * 억) && near(me.owner.residentialOwnedValue, 12 * 억) && near(me.owner.residentialValueRatio, 1, 1e-9) && near(me.owner.taxpayerDeduction, 9 * 억), JSON.stringify(me.owner));
  T('아내 owner 필드', sp.owner && near(sp.owner.totalOwnedValue, 9 * 억) && sp.owner.residentialOwnedValue === 0 && sp.owner.residentialValueRatio === 0 && near(sp.owner.taxpayerDeduction, 4 * 억), JSON.stringify(sp.owner));
  T('유형 상수 dedType', me.dedType === 'MULTI_HOME_HOUSEHOLD_INDIVIDUAL_OWNER', me.dedType);
  T('설명 문구 — 세대 2주택·비율 100%·9억', /2주택/.test(me.dedWhy) && /100%/.test(me.dedWhy) && /9억/.test(me.dedWhy), me.dedWhy);
  T('아내 설명 — 비거주·4억', /비거주/.test(sp.dedWhy) && /4억/.test(sp.dedWhy), sp.dedWhy);
  const one = deds(inputOf([house(Object.assign({ official: 20, livePeriods: LIVE }, ME))])).r.jong.persons[0];
  T('1세대1주택 dedType', one.dedType === 'SINGLE_OWNER_ONE_HOUSEHOLD_HOME' && /1세대 1주택/.test(one.dedWhy) && /14억/.test(one.dedWhy), `${one.dedType} / ${one.dedWhy}`);
  const jt = deds(inputOf([house(Object.assign({ official: 20 }, JOINT(50, 50)))], { situation: 'one_away' })).r.jong.joint.indiv[0].r;
  T('공동명의 dedType + 설명', jt.dedType === 'JOINT_OWNER_ONE_HOUSEHOLD_HOME' && /공동/.test(jt.dedWhy) && /6억/.test(jt.dedWhy), `${jt.dedType} / ${jt.dedWhy}`);
}

/* ── 경계: 세대 기준 1주택(상속주택 제외)인데 상속주택을 배우자가 따로 보유 ── */
console.log('\n[경계] 남편 A 단독(거주) + 아내 상속주택 B 단독 — 세대 1주택(§8④ 상속 제외)');
{
  const INH = { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false };
  const mk = (owner) => inputOf([
    house(Object.assign({ id: 'A', official: 12, livePeriods: LIVE }, ME)),
    house(Object.assign({ id: 'B', official: 8, acqDate: '2024-03', acqCause: 'inherit', flags: INH, inheritDate: '2024-03' }, owner)) // 8억: 수도권 저가(6억 이하) 무기한 특례를 피해 5년 만료 경로를 검증
  ]);
  const cross = deds(mk(SP));   // 상속주택을 아내가 보유
  T('경계 세대 판정 = 1주택(상속 제외)', cross.r.jong.oneStatus.one === true && cross.r.jong.oneStatus.excluded === 1, JSON.stringify(cross.r.jong.oneStatus));
  T('경계 남편 = 1세대 1주택자 → 실거주 14억', near(cross.me, 14 * 억) && cross.meType === 'one', `${f(cross.me)} ${cross.meType}`);
  T('경계 아내(상속주택만) = 그 외 납세자 → 4억', near(cross.spouse, 4 * 억) && cross.spType === 'multi', `${f(cross.spouse)} ${cross.spType}`);
  const spW = cross.r.jong.persons.find(p => p.taxpayer === 'spouse').dedWhy;
  T('경계 아내 설명 — 세대 1주택이지만 소유자 아님', /세대 기준으로는 1주택/.test(spW) && /4억/.test(spW), spW);
  const same = deds(mk(ME));    // 남편이 둘 다 보유 (기존 GC-3a 구조) — 결과 불변
  T('동일 소유자(남편 A+상속 B) = 1세대 1주택 14억 (기존 동일)', near(same.me, 14 * 억) && same.meType === 'one', `${f(same.me)} ${same.meType}`);
  // 특례 만료(2029~) 후에는 둘 다 다주택 규칙
  const late = deds(mk(SP), 2030);
  T('상속 특례 만료 후(2030) — 남편 9억(거주 100%) · 아내 4억', near(late.me, 9 * 억) && near(late.spouse, 4 * 억) && late.meType === 'multi', `${f(late.me)}/${f(late.spouse)}`);
}

/* ── 납세자별 과세 문턱 (thresholds) ── */
console.log('\n[문턱] 종부세 인별 과세 — 납세자별 문턱 표시');
{
  const byKey = (thr, k) => thr.persons.find(p => p.key === k);
  // 부부 각 1채, A 거주: 남편 12억 보유 → 현행 9억 / 개편 9억(거주 100%), 아내 9억 보유 → 현행 9억 / 개편 4억
  const th = E.thresholds(mkPair(true, false));
  T('부부 각 1채 — mode per-taxpayer', th.mode === 'per-taxpayer', th.mode);
  const me = byKey(th, 'me'), sp = byKey(th, 'spouse');
  T('남편 문턱 현행 9억 · 개편 9억(비율 100%)', me.current.deduct === 9 * 억 && me.reform.deduct === 9 * 억 && near(me.reform.ratio, 1, 1e-9), `${f(me.current.deduct)}/${f(me.reform.deduct)}`);
  T('아내 문턱 현행 9억 · 개편 4억(비율 0%)', sp.current.deduct === 9 * 억 && sp.reform.deduct === 4 * 억 && sp.reform.ratio === 0, `${f(sp.current.deduct)}/${f(sp.reform.deduct)}`);
  T('남편 지분 공시 12억 → 개편 문턱 이미 초과', near(me.pubShare, 12 * 억) && me.reform.over === true, JSON.stringify(me.reform));
  T('아내 지분 공시 9억 → 개편 문턱(4억) 초과', near(sp.pubShare, 9 * 억) && sp.reform.over === true && sp.current.over === false, JSON.stringify(sp.reform));
  T('유형 표기 multi', me.reform.type === 'multi' && me.reform.dedType === 'MULTI_HOME_HOUSEHOLD_INDIVIDUAL_OWNER', me.reform.dedType);
  // 1인 2주택 10+10, A 거주 → 개편 6.5억, 현재 대비 상승률 = 6.5/20 − 1 (이미 초과)
  const one2 = E.thresholds(inputOf([house(Object.assign({ id: 'A', official: 10, livePeriods: LIVE }, ME)), house(Object.assign({ id: 'B', official: 10, acqDate: '2019-03' }, ME))]));
  T('1인 2주택 — 납세자 1명 · 개편 문턱 6.5억', one2.persons.length === 1 && near(one2.persons[0].reform.deduct, 6.5 * 억), f(one2.persons[0].reform.deduct));
  // 1주택 단독·공동명의는 기존 필드 유지
  const t1 = E.thresholds(inputOf([house(Object.assign({ official: 20, livePeriods: LIVE }, ME))]));
  T('1세대1주택 단독 — mode one · 개편 14억 (기존 필드)', t1.mode === 'one' && t1.reform.pub === 14 * 억 && byKey(t1, 'me').reform.deduct === 14 * 억, `${t1.mode} ${f(t1.reform.pub)}`);
  const tj = E.thresholds(inputOf([house(Object.assign({ official: 20 }, JOINT(50, 50)))], { situation: 'one_away' }));
  T('공동명의 비거주 — mode joint-one · 실효 문턱 12억 · 인별 공제 6억', tj.mode === 'joint-one' && tj.reform.pub === 12 * 억 && byKey(tj, 'me').reform.deduct === 6 * 억, `${tj.mode} ${f(tj.reform.pub)}`);
  // 상속 경계: 남편 1세대1주택자(14억), 아내 상속주택만(4억)
  const INH = { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false };
  const te = E.thresholds(inputOf([house(Object.assign({ id: 'A', official: 12, livePeriods: LIVE }, ME)), house(Object.assign({ id: 'B', official: 8, acqDate: '2024-03', acqCause: 'inherit', flags: INH, inheritDate: '2024-03' }, SP))]));
  T('상속 경계 문턱 — 남편 one 14억 · 아내 multi 4억', byKey(te, 'me').reform.type === 'one' && byKey(te, 'me').reform.deduct === 14 * 억 && byKey(te, 'spouse').reform.deduct === 4 * 억, `${byKey(te, 'me').reform.type} ${f(byKey(te, 'me').reform.deduct)} / ${f(byKey(te, 'spouse').reform.deduct)}`);
}

/* ── 검증 표 출력 (§13 보고용) ── */
console.log('\n| 보유상황 | 남편 공제 | 아내 공제 | 적용 규칙 | 결과 |');
console.log('|---|---:|---:|---|---|');
for (const r of table) console.log(`| ${r.label} | ${r.me} | ${r.sp} | ${r.rule} | ${r.ok ? '일치' : '불일치'} |`);

console.log(`\n보유형태 테스트: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
