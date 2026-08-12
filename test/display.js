'use strict';
/* P1-1 표시 정합성(역산) 검사 — 지시서 §3
   "표시된 본세로부터 역산한 과표"와 "표시된 과표"가 모든 연도·모든 케이스에서 일치해야 한다.
   화면은 pt.rawBase / pt.base / pt.main / pt.city / pt.edu 를 그대로 출력하므로,
   이 필드들 사이의 산식 일관성을 검사하면 화면의 모든 줄이 역산 가능함이 보장된다. */
const E = require('../src/engine.js');
const 억 = E.억, 만 = E.만;

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name} — ${detail || ''}`); }
}

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
    people: { me: { age: 60 }, spouse: { age: 58 } },
    houses, purposes: ['hold'],
    sell: {}, acquire: {}, joint: {}, gift: {},
    assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true }
  }, over || {});
}

const FIXTURES = [
  ['GC-1형 공동 25.6억', inputOf([house({ official: 25.6, shares: { me: 50, spouse: 50, other: 0 } })])],
  ['GC-2형 단독 45억 실거주', inputOf([house({ official: 45, livePeriods: [{ from: '2006-03', to: '' }] })])],
  ['GC-3형 2주택(상속)', inputOf([
    house({ id: 'a', official: 15, livePeriods: [{ from: '2013-06', to: '' }] }),
    house({ id: 'b', official: 12, acqDate: '2024-03', flags: { temp2: false, inherit: true, lowLocal: false, rental: false, popDecline: false } })
  ])],
  ['9억 이하 특례세율', inputOf([house({ official: 8, livePeriods: [{ from: '2016-06', to: '' }] })])],
  ['도시지역분 제외', inputOf([house({ official: 20 })], { assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: false } })],
  ['상승률 3%', inputOf([house({ official: 14, livePeriods: [{ from: '2016-06', to: '' }] })], { assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 3, officialGrowth: 3, urban: true } })]
];

for (const [name, inp] of FIXTURES) {
  for (const scen of ['current', 'reform']) {
    const rows = E.holdSim(inp, scen);
    rows.forEach(r => {
      r.prop.rows.forEach((pr, i) => {
        const pt = pr.pt, tag = `${name}/${scen}/${r.year}/주택${i + 1}`;
        // 명목 과표 = 공시 × 표시 비율
        T(`${tag} rawBase = pub×fair`, Math.abs(pt.rawBase - pr.pub * pt.fair) < 1, `${pt.rawBase} vs ${pr.pub * pt.fair}`);
        // 상한 플래그 ⇔ base < rawBase
        T(`${tag} capped 플래그 일관`, pt.capped === (pt.base < pt.rawBase - 0.5), `capped=${pt.capped} base=${pt.base} raw=${pt.rawBase}`);
        if (pt.capped) T(`${tag} 상한액=최종과표`, Math.abs(pt.base - pt.capBase) < 0.5, `base=${pt.base} cap=${pt.capBase}`);
        // 표시 과표에서 본세·도시·교육 역산
        const table = pt.useSpec ? E.PROP.rateSpec : E.PROP.rateStd;
        T(`${tag} 본세 역산`, Math.abs(pt.main - E.progressive(pt.base, table)) < 1, `${pt.main} vs ${E.progressive(pt.base, table)}`);
        T(`${tag} 도시 역산`, Math.abs(pt.city - (inp.assumptions.urban !== false ? pt.base * E.PROP.urban : 0)) < 1, String(pt.city));
        T(`${tag} 교육 역산`, Math.abs(pt.edu - pt.main * E.PROP.edu) < 1, String(pt.edu));
        T(`${tag} 합계 일관`, Math.abs(pt.total - (pt.main + pt.city + pt.edu)) < 1, String(pt.total));
      });
      // 종부세 표시줄 역산: 과표 = (공시합 − 공제) × FMV, 산출 = 구간누적
      const persons = r.jong.mode === 'joint-compare'
        ? r.jong.joint.indiv.map(x => x.r).concat([r.jong.joint.special])
        : r.jong.persons;
      persons.forEach((p, pi) => {
        if (p.base <= 0) return;
        const tag = `${name}/${scen}/${r.year}/납세자${pi + 1}`;
        T(`${tag} 종부 과표 역산`, Math.abs(p.base - (p.pubSum - p.deduct) * p.fair) < 1, `${p.base}`);
        const P = E.jongParams(r.year, scen);
        T(`${tag} 종부 산출 역산`, Math.abs(p.gross - E.bracketed(p.base, P.table(p.houseCount))) < 1, `${p.gross}`);
        T(`${tag} 농특세 20%`, Math.abs(p.rural - p.tax * 0.20) < 1, `${p.rural}`);
      });
    });
  }
}
console.log(`표시 역산 검사: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
