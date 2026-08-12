'use strict';
/* 골든 케이스 갱신값 산출기 — 엔진을 쓰지 않고 test/reference.js(법정 산식)만으로
   과표상한 교정(이슈 3) 영향 셀을 재계산한다. 산출 근거 기록용으로 저장소에 남긴다. */
const R = require('./reference.js');
const { 억, 만 } = R;
const f = v => (v / 만).toFixed(2) + '만';

/* 공통: 연도 시퀀스 계산기 — 1주택(재산세 특례비율), flat 공시 */
function propYears(pub, years, oneHH) {
  const out = {};
  for (const y of years) out[y] = R.refProp(pub, pub, oneHH, y); // flat → prevPub = pub
  return out;
}

/* ── GC-1: 25.6억 · 부부 50:50 · 비거주 (본인55/배우자53) ── */
function gc1(live) {
  const pub = 25.6 * 억, years = [2025, 2026, 2027, 2028, 2029, 2030];
  const prop = propYears(pub, years, true);
  const res = {};
  for (const scen of ['current', 'reform']) {
    let prevIndiv = { me: 0, spouse: 0 }, prevSp = { me: 0, spouse: 0 };
    for (const y of years) {
      const P = prop[y];
      const liveShare = live ? 1 : 0;
      const mk = (prev) => R.refJongPerson({
        year: y, scen: y === 2025 ? 'current' : scen,
        pubSum: pub / 2, houseCount: 1, hasAdj: true, isOne: false, liveShare,
        age: 0, holdY: 0, liveY: 0,
        aggPBase: (pub / 2) * P.fair, propMainPaid: P.main / 2, prevTotal: prev
      });
      const me = mk(prevIndiv.me), sp = mk(prevIndiv.spouse);
      prevIndiv = { me: me.burdenBase, spouse: sp.burdenBase };
      const indivTotal = me.total + sp.total;
      // 특례 (대표 나이 55/53 — 둘 다 60 미만, 보유 y-2016, 거주 live? y-2016 : 0)
      const holdY = y - 2016 + 1 / 12;
      const spc = {};
      for (const k of ['me', 'spouse']) {
        const r = R.refJongPerson({
          year: y, scen: y === 2025 ? 'current' : scen,
          pubSum: pub, houseCount: 1, hasAdj: true, isOne: true, oneLive: live, liveShare,
          age: (k === 'me' ? 55 : 53) + (y - 2026), holdY, liveY: live ? holdY : 0,
          aggPBase: pub * P.fair, propMainPaid: P.main, prevTotal: prevSp[k]
        });
        prevSp[k] = r.burdenBase; spc[k] = r;
      }
      const spBest = Math.min(spc.me.total, spc.spouse.total);
      const jong = Math.min(indivTotal, spBest);
      if (y >= 2026) {
        res[`${scen}${y}`] = { prop: P.total, jong, hold: P.total + jong, indivTotal, spBest };
      }
    }
  }
  return res;
}

/* ── GC-2: 45억 단독 · 거주 · 66세 · 2006-03 취득 ── */
function gc2() {
  const pub = 45 * 억, years = [2025, 2026, 2027, 2028];
  const prop = propYears(pub, years, true);
  const res = {};
  for (const scen of ['current', 'reform']) {
    let prev = 0;
    for (const y of years) {
      const P = prop[y];
      const holdY = y - 2006 + 3 / 12;
      const r = R.refJongPerson({
        year: y, scen: y === 2025 ? 'current' : scen,
        pubSum: pub, houseCount: 1, hasAdj: true, isOne: true, oneLive: true, liveShare: 1,
        age: 66 + (y - 2026), holdY, liveY: holdY,
        aggPBase: pub * P.fair, propMainPaid: P.main, prevTotal: prev
      });
      prev = r.burdenBase;
      if (y >= 2026) res[`${scen}${y}`] = { prop: P.total, jong: r.total, hold: P.total + r.total, detail: r };
    }
  }
  return res;
}

/* ── GC-2 공동명의 전환 절감 (정부안 2027~2030 평균) ── */
function gc2Convert() {
  const pub = 45 * 억, years = [2025, 2026, 2027, 2028, 2029, 2030];
  const prop = propYears(pub, years, true);
  // before: 단독 (위와 동일 체인)
  const before = {};
  {
    let prev = 0;
    for (const y of years) {
      const P = prop[y];
      const holdY = y - 2006 + 3 / 12;
      const r = R.refJongPerson({
        year: y, scen: y === 2025 ? 'current' : 'reform',
        pubSum: pub, houseCount: 1, hasAdj: true, isOne: true, oneLive: true, liveShare: 1,
        age: 66 + (y - 2026), holdY, liveY: holdY,
        aggPBase: pub * P.fair, propMainPaid: P.main, prevTotal: prev
      });
      prev = r.burdenBase; before[y] = r.total;
    }
  }
  // after: 부부 50:50 거주 — min(개별 합, 특례 best(66세/63세))
  const after = {};
  {
    let prevI = { me: 0, spouse: 0 }, prevS = { me: 0, spouse: 0 };
    for (const y of years) {
      const P = prop[y];
      const holdY = y - 2006 + 3 / 12;
      const mk = prev => R.refJongPerson({
        year: y, scen: y === 2025 ? 'current' : 'reform',
        pubSum: pub / 2, houseCount: 1, hasAdj: true, isOne: false, liveShare: 1,
        age: 0, holdY, liveY: holdY,
        aggPBase: (pub / 2) * P.fair, propMainPaid: P.main / 2, prevTotal: prev
      });
      const me = mk(prevI.me), sp = mk(prevI.spouse);
      prevI = { me: me.burdenBase, spouse: sp.burdenBase };
      const spc = {};
      for (const k of ['me', 'spouse']) {
        const r = R.refJongPerson({
          year: y, scen: y === 2025 ? 'current' : 'reform',
          pubSum: pub, houseCount: 1, hasAdj: true, isOne: true, oneLive: true, liveShare: 1,
          age: (k === 'me' ? 66 : 63) + (y - 2026), holdY, liveY: holdY,
          aggPBase: pub * P.fair, propMainPaid: P.main, prevTotal: prevS[k]
        });
        prevS[k] = r.burdenBase; spc[k] = r.total;
      }
      after[y] = Math.min(me.total + sp.total, spc.me, spc.spouse);
    }
  }
  const saves = [2027, 2028, 2029, 2030].map(y => before[y] - after[y]);
  return { annual: saves.reduce((a, b) => a + b, 0) / 4, saves, before, after };
}

/* ── T-002b: 15억 단독 · 거주 · 58세(2026) · 2018-06 취득 — 2028 정부안 ── */
function t002b() {
  const pub = 15 * 억;
  const prop = propYears(pub, [2025, 2026, 2027, 2028], true);
  let prev = 0, out = null;
  for (const y of [2025, 2026, 2027, 2028]) {
    const P = prop[y];
    const holdY = y - 2018;
    const r = R.refJongPerson({
      year: y, scen: y === 2025 ? 'current' : 'reform',
      pubSum: pub, houseCount: 1, hasAdj: true, isOne: true, oneLive: true, liveShare: 1,
      age: 58 + (y - 2026), holdY, liveY: holdY,
      aggPBase: pub * P.fair, propMainPaid: P.main, prevTotal: prev
    });
    prev = r.burdenBase;
    if (y === 2028) out = { prop: P.total, jong: r.total, hold: P.total + r.total };
  }
  return out;
}

const away = gc1(false), lived = gc1(true), g2 = gc2(), cv = gc2Convert(), tb = t002b();
console.log('=== GC-1 (비거주 joint) — 현행/정부안 보유세 ===');
for (const y of [2026, 2027, 2028, 2029, 2030]) console.log(`${y}: cur ${f(away['current' + y].hold)}  ref ${f(away['reform' + y].hold)}  (재산세 ${f(away['current' + y].prop)})`);
console.log('2028 정부안 개별합:', f(away.reform2028.indivTotal), '특례best:', f(away.reform2028.spBest));
console.log('=== GC-1b (거주) 2028 정부안:', f(lived.reform2028.hold), ' / 2028 현행:', f(lived.current2028.hold));
console.log('=== GC-2 — 현행/정부안 ===');
for (const y of [2026, 2027, 2028]) console.log(`${y}: cur ${f(g2['current' + y].hold)}  ref ${f(g2['reform' + y].hold)}  (재산세 ${f(g2['current' + y].prop)})`);
console.log('2028 정부안 종부 상세:', JSON.stringify({ base: g2.reform2028.detail.base / 억, gross: f(g2.reform2028.detail.gross), pc: f(g2.reform2028.detail.propCredit), credit: f(g2.reform2028.detail.credit), total: f(g2.reform2028.detail.total) }));
console.log('=== GC-2 전환 연평균 절감:', f(cv.annual), '연도별', cv.saves.map(f).join(' '));
console.log('=== T-002b 2028:', JSON.stringify({ prop: f(tb.prop), jong: tb.jong, hold: tb.hold }));
