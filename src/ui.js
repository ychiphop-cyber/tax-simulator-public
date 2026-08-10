/* =====================================================================
   UI 레이어 — 6단계 진단 위저드 + 세무 검토보고서형 결과
   (계산은 전부 엔진 함수 호출 — UI는 숫자를 만들지 않는다)
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'taxdx_pub_v2'; // 공개형 전용 키 — 비밀번호판(taxdx_v2)과 상태 분리

/* ══════════ 공개형 설정 — 이 블록만 수정하면 됩니다 (PRD §9.4) ══════════ */
const CONFIG = {
  BLOG_HOME: 'https://m.blog.naver.com/marbin1982',
  BLOG_QNA_URL: 'https://blog.naver.com/marbin1982/224374566862', // 질문 허브 글 — 비우면 질문 CTA 자동 숨김
  YOUTUBE_CHANNEL: 'https://youtube.com/channel/UCAQphoJnr83PI1a8JUAlecQ?si=tIWvMYcCiA1r2iFD',
  YOUTUBE_FEATURE_URL: '', // 8·3 해설 영상 업로드 후 URL 입력 — 비어 있으면 영상 CTA 숨김
  GA4_ID: ''               // GA4 측정 ID 입력 시에만 이벤트 전송 (이벤트명·유입경로만, 입력값은 전송하지 않음)
};
const VERSION = {
  current: 'v2.3', updated: '2026-08-11',
  log: [
    ['v2.3', '2026-08-11', '문구 개편 — ‘결과 심층 분석’ 명칭, 질문 CTA 문구 정리, 유튜브 CTA 신설'],
    ['v2.2', '2026-08-11', '계산 엔진 동기화(r3) — 부담부증여 취득세 과표, 분양권·입주권 주택수 산입, 특례주택 판정, 재산세 과표상한(5%), 공동명의 개별납부 조정지역 80% 등 반영'],
    ['v2.1', '2026-08-11', '블로그 질문 허브 연결 — 계산 근거 직후·페이지 끝 질문 CTA 활성화'],
    ['v2.0', '2026-08-10', '공개형 전환 — 비밀번호 제거, 핵심 결과/닥터마빈 결과 해석 2단 구조, 질문 CTA·업데이트 내역 신설'],
    ['v1.0', '2026-08-09', '최초 공개 — 6단계 진단, 재산세·종부세·양도세·취득세·증여세, 공동명의 비교, 정부 공식사례 회귀 검증']
  ]
};
/* 비식별 이벤트 수집 — 이벤트명·유입경로(src)·횟수만. 사용자 입력값(가격·주소 등)은 어디에도 보내지 않는다. */
const SRC_TAG = (() => { try { return new URLSearchParams(location.search).get('src') || 'direct'; } catch (e) { return 'direct'; } })();
const seenEv = {};
function track(ev, once) {
  try {
    if (once && seenEv[ev]) return;
    seenEv[ev] = 1;
    if (CONFIG.GA4_ID && typeof window.gtag === 'function') window.gtag('event', ev, { src: SRC_TAG });
    const k = 'taxdx_pub_stats', st = JSON.parse(localStorage.getItem(k) || '{}');
    st[ev] = (st[ev] || 0) + 1;
    localStorage.setItem(k, JSON.stringify(st));
  } catch (e) { }
}
if (CONFIG.GA4_ID) {
  const sc = document.createElement('script');
  sc.async = true;
  sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CONFIG.GA4_ID);
  document.head.appendChild(sc);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', CONFIG.GA4_ID, { anonymize_ip: true });
}

/* ── 상태 ── */
let SEQ = 1;
function newHouse() {
  return {
    id: 'h' + (SEQ++) + '_' + Math.random().toString(36).slice(2, 6),
    name: '', area85: false, region: '서울',
    adjNow: 'yes', adjAcq: 'yes', adjSale: 'yes',
    priceMode: 'official', official: '', market: '',
    acqPrice: '', acqDate: '',
    ownerType: 'me', shares: { me: 100, spouse: 0, other: 0 }, acqCause: 'buy',
    liveMode: 'none', liveFrom: '', pastPeriods: [],
    flags: { temp2: false, inherit: false, lowLocal: false, rental: false, popDecline: false }
  };
}
function defaultInput() {
  return {
    situation: null,
    rights: { presale: false, occupancy: false, inherited: false },
    people: { me: { age: 55 }, spouse: { age: 53 } },
    houses: [newHouse()],
    purposes: ['hold'],
    sell: { houseId: null, date: '2027-03', price: '', cost: 3000, sameYearOther: false, seniorMove: false },
    acquire: { price: 9, housesAfter: 2, adj: true, big85: false, temp2: true, first: false },
    joint: { houseId: null, share: 50, prior: 0 },
    gift: { type: 'general', relation: 'child', houseId: null, share: 100, value: '', debt: 0, prior: 0, date: '2026-10' },
    assumptions: { baseYear: 2026, policyView: 'both', marketGrowth: 0, officialGrowth: 0, urban: true }
  };
}
let S = { step: 1, inp: defaultInput() };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && saved.inp && saved.inp.houses) { S = saved; SEQ = (saved.seq || 50); }
} catch (e) { }
function save() { S.seq = SEQ; try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { } }

const SIT_LABEL = {
  one_live: '1주택 · 실거주', one_away: '1주택 · 비거주', two: '2주택',
  multi: '3주택 이상', unsure: '주택 수 판정 필요'
};
const PP_LABEL = { hold: '계속 보유', sell: '매도', acquire: '신규 취득', joint: '공동명의 검토', gift: '증여' };
const REGIONS = ['서울', '경기', '인천', '부산·대구 등 광역시', '그 외 지방'];
const OWN_LABEL = { me: '본인 단독', spouse: '배우자 단독', joint: '부부 공동', other: '기타 공동' };

/* ── 엔진 입력 변환 (문자→숫자, 거주기간 실체화) ── */
function num(v, d = 0) { const n = parseFloat(v); return isFinite(n) ? n : d; }
function numInp() {
  const raw = JSON.parse(JSON.stringify(S.inp));
  const inp = raw;
  inp.people.me.age = num(raw.people.me.age, 55);
  inp.people.spouse.age = num(raw.people.spouse.age, 53);
  inp.houses = raw.houses.map((h, i) => {
    const periods = [];
    for (const p of (h.pastPeriods || [])) if (p.from && p.to) periods.push({ from: p.from, to: p.to });
    if (h.liveMode === 'now') periods.push({ from: h.liveFrom || h.acqDate || (inp.assumptions.baseYear - 10) + '-01', to: '' });
    return Object.assign({}, h, {
      name: h.name || `주택 ${i + 1}`,
      official: num(h.official), market: num(h.market),
      acqPrice: num(h.acqPrice),
      shares: { me: num(h.shares.me), spouse: num(h.shares.spouse), other: num(h.shares.other) },
      livePeriods: periods
    });
  });
  inp.sell.price = num(raw.sell.price); inp.sell.cost = num(raw.sell.cost);
  inp.sell.houseId = raw.sell.houseId || (inp.houses[0] && inp.houses[0].id);
  inp.acquire.price = num(raw.acquire.price); inp.acquire.housesAfter = num(raw.acquire.housesAfter, 2);
  inp.joint.share = num(raw.joint.share, 50); inp.joint.prior = num(raw.joint.prior);
  inp.joint.houseId = raw.joint.houseId || (inp.houses[0] && inp.houses[0].id);
  inp.gift.share = num(raw.gift.share, 100); inp.gift.value = num(raw.gift.value);
  inp.gift.debt = num(raw.gift.debt); inp.gift.prior = num(raw.gift.prior);
  inp.gift.houseId = raw.gift.houseId || (inp.houses[0] && inp.houses[0].id);
  inp.assumptions.marketGrowth = num(raw.assumptions.marketGrowth);
  inp.assumptions.officialGrowth = num(raw.assumptions.officialGrowth);
  return inp;
}
/* UI 차원의 추가 확인 항목 */
function uiConfirms(inp) {
  const out = [];
  S.inp.houses.forEach((h, i) => {
    const nm = h.name || `주택 ${i + 1}`;
    if (h.liveMode === 'now' && !h.liveFrom) out.push({ code: 'LIVE_FROM', msg: `${nm} — 전입 시기 미입력. 취득일부터 거주한 것으로 가정했습니다.` });
  });
  if (S.inp.purposes.includes('joint')) {
    const h = S.inp.houses.find(x => x.id === S.inp.joint.houseId) || S.inp.houses[0];
    if (h && h.ownerType !== 'me') out.push({ code: 'JOINT_TARGET', msg: '공동명의 검토 — 대상 주택이 본인 단독명의가 아닙니다. 전환 분석은 본인 지분 기준으로 계산됩니다.' });
  }
  return out;
}

/* ── 위저드 내비게이션 ── */
const STEP_LABELS = ['상황', '주택', '명의·거주', '목적', '가정', '확인', '결과'];
function go(n) {
  S.step = Math.max(1, Math.min(7, n));
  renderAll();
  window.scrollTo({ top: 0 });
  save();
}
function validateStep(n) {
  const inp = S.inp;
  if (n === 1 && !inp.situation) return '상황을 하나 선택해 주세요.';
  if (n === 2) {
    for (let i = 0; i < inp.houses.length; i++) {
      const h = inp.houses[i];
      const v = h.priceMode === 'market' ? num(h.market) : num(h.official);
      if (!(v > 0)) return `${h.name || '주택 ' + (i + 1)}의 ${h.priceMode === 'market' ? '시세' : '공시가격'}를 입력해 주세요.`;
    }
  }
  if (n === 3) {
    for (let i = 0; i < inp.houses.length; i++) {
      const h = inp.houses[i];
      const sum = num(h.shares.me) + num(h.shares.spouse) + num(h.shares.other);
      if (Math.abs(sum - 100) > 0.01) return `${h.name || '주택 ' + (i + 1)}의 지분 합계가 ${sum}%입니다. 100%로 맞춰 주세요.`;
    }
    if (!(num(inp.people.me.age) >= 19)) return '본인 나이를 입력해 주세요.';
  }
  if (n === 4) {
    if (inp.purposes.includes('sell') && !(num(inp.sell.price) > 0)) return '매도 — 예상 양도가액을 입력해 주세요.';
    if (inp.purposes.includes('acquire') && !(num(inp.acquire.price) > 0)) return '신규 취득 — 취득가액을 입력해 주세요.';
  }
  return null;
}

/* ── 스텝 1 ── */
function seedHouses(sit) {
  const want = sit === 'two' ? 2 : sit === 'multi' ? 3 : 1;
  const hs = S.inp.houses;
  if (sit !== 'unsure') {
    while (hs.length < want) hs.push(newHouse());
    while (hs.length > want) hs.pop();
  }
  if (sit === 'one_live') { hs[0].liveMode = 'now'; }
  if (sit === 'one_away') { hs[0].liveMode = 'none'; }
  if (sit === 'two' || sit === 'multi') { if (hs[0].liveMode === 'none') hs[0].liveMode = 'now'; }
}
function renderStep1() {
  $$('#sitCards .opt').forEach(b => b.classList.toggle('sel', b.dataset.sit === S.inp.situation));
  $$('#step1 [data-right]').forEach(c => { c.checked = !!S.inp.rights[c.dataset.right]; });
}

/* ── 스텝 2 ── */
function adjSeg(hIdx, key, val) {
  const opts = [['yes', '예'], ['no', '아니오'], ['unknown', '모름']];
  return `<div class="seg sm" role="group">${opts.map(([v, l]) =>
    `<button type="button" data-h="${hIdx}" data-adj="${key}" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</div>`;
}
function renderStep2() {
  const wrap = $('#houseCards');
  wrap.innerHTML = S.inp.houses.map((h, i) => {
    const isMarket = h.priceMode === 'market';
    const conv = isMarket
      ? (num(h.market) > 0 ? `공시가격 추정 ≈ <b>${(num(h.market) * 0.69).toFixed(2).replace(/\.?0+$/, '')}억원</b> (시세 × 69%, 2026 공동주택 참고값)` : '시세 × 69%를 공시가격으로 추정합니다')
      : (num(h.official) > 0 ? `시세 환산 참고 ≈ ${(num(h.official) / 0.69).toFixed(1)}억원` : '부동산공시가격알리미의 공시가격을 입력하세요');
    return `<div class="hcard" data-hcard="${i}">
      <div class="hhead">
        <div class="hno">${i + 1}</div>
        <input class="hname" data-h="${i}" data-k="name" value="${esc(h.name)}" placeholder="주택 ${i + 1} (예: 마포 아파트)">
        <button class="iconb" data-dup="${i}">복제</button>
        <button class="iconb" data-del="${i}" ${S.inp.houses.length === 1 ? 'disabled' : ''}>삭제</button>
      </div>
      <div class="grid2">
        <div>
          <label class="mini">소재지</label>
          <select data-h="${i}" data-k="region">${REGIONS.map(r => `<option ${h.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        </div>
        <div>
          <label class="mini">전용면적</label>
          <div class="chips" style="margin-top:8px"><label class="chip"><input type="checkbox" data-h="${i}" data-k="area85" ${h.area85 ? 'checked' : ''}><span>85㎡ 초과</span></label></div>
        </div>
      </div>
      <h3 class="mini-h">규제지역(조정대상지역) — 시점별로 다를 수 있습니다</h3>
      <div class="adjrow"><span class="lbl">현재</span>${adjSeg(i, 'adjNow', h.adjNow)}</div>
      <div class="adjrow"><span class="lbl">취득 당시</span>${adjSeg(i, 'adjAcq', h.adjAcq)}</div>
      <div class="adjrow"><span class="lbl">양도 시점(예정)</span>${adjSeg(i, 'adjSale', h.adjSale)}</div>
      <h3 class="mini-h">가격</h3>
      <div class="seg sm" role="group">
        <button type="button" data-h="${i}" data-pmode="official" aria-pressed="${!isMarket}">실제 공시가격</button>
        <button type="button" data-h="${i}" data-pmode="market" aria-pressed="${isMarket}">시세로 추정 (×69%)</button>
      </div>
      <div class="grid2" style="margin-top:10px">
        <div>
          <label class="mini">${isMarket ? '현재 시세' : '2026년 공시가격'}
            <span class="inline-num"><input type="number" step="0.1" min="0" data-h="${i}" data-k="${isMarket ? 'market' : 'official'}" value="${esc(isMarket ? h.market : h.official)}"><em>억원</em></span>
          </label>
          <p class="subtle">${conv}</p>
        </div>
        <div>
          <label class="mini">취득가액
            <span class="inline-num"><input type="number" step="0.1" min="0" data-h="${i}" data-k="acqPrice" value="${esc(h.acqPrice)}"><em>억원</em></span>
          </label>
        </div>
        <div class="full">
          <label class="mini">취득 시기</label>
          <input type="month" data-h="${i}" data-k="acqDate" value="${esc(h.acqDate)}">
        </div>
      </div>
      <h3 class="mini-h">특례 해당 여부 (해당 시 표시 — 요건은 결과에서 안내)</h3>
      <div class="chips">
        <label class="chip"><input type="checkbox" data-h="${i}" data-flag="temp2" ${h.flags.temp2 ? 'checked' : ''}><span>일시적 2주택</span></label>
        <label class="chip"><input type="checkbox" data-h="${i}" data-flag="inherit" ${h.flags.inherit ? 'checked' : ''}><span>상속주택</span></label>
        <label class="chip"><input type="checkbox" data-h="${i}" data-flag="lowLocal" ${h.flags.lowLocal ? 'checked' : ''}><span>지방 저가주택</span></label>
        <label class="chip"><input type="checkbox" data-h="${i}" data-flag="rental" ${h.flags.rental ? 'checked' : ''}><span>등록임대</span></label>
        <label class="chip"><input type="checkbox" data-h="${i}" data-flag="popDecline" ${h.flags.popDecline ? 'checked' : ''}><span>인구감소지역</span></label>
      </div>
    </div>`;
  }).join('');
}

/* ── 스텝 3 ── */
function renderStep3() {
  $('#ageMe').value = S.inp.people.me.age;
  $('#ageSpouse').value = S.inp.people.spouse.age;
  const wrap = $('#ownCards');
  wrap.innerHTML = S.inp.houses.map((h, i) => {
    const joint = h.ownerType === 'joint', other = h.ownerType === 'other';
    let shareUI = '';
    if (joint) {
      shareUI = `<div class="grid2" style="margin-top:10px">
        <div><label class="mini">본인 지분<span class="inline-num"><input type="number" min="0" max="100" step="5" data-h="${i}" data-share="me" value="${esc(h.shares.me)}"><em>%</em></span></label></div>
        <div><label class="mini">배우자 지분<span class="inline-num"><input type="number" min="0" max="100" step="5" data-h="${i}" data-share="spouse" value="${esc(h.shares.spouse)}"><em>%</em></span></label></div>
      </div>`;
    } else if (other) {
      shareUI = `<div class="grid2" style="margin-top:10px">
        <div><label class="mini">본인<span class="inline-num"><input type="number" min="0" max="100" step="5" data-h="${i}" data-share="me" value="${esc(h.shares.me)}"><em>%</em></span></label></div>
        <div><label class="mini">배우자<span class="inline-num"><input type="number" min="0" max="100" step="5" data-h="${i}" data-share="spouse" value="${esc(h.shares.spouse)}"><em>%</em></span></label></div>
        <div><label class="mini">제3자<span class="inline-num"><input type="number" min="0" max="100" step="5" data-h="${i}" data-share="other" value="${esc(h.shares.other)}"><em>%</em></span></label></div>
      </div>
      <p class="subtle">제3자 지분의 세금은 이 계산에 포함되지 않습니다 (본인·배우자 몫만 계산).</p>`;
    }
    const sumBad = Math.abs(num(h.shares.me) + num(h.shares.spouse) + num(h.shares.other) - 100) > 0.01;
    const livePast = (h.pastPeriods || []).map((p, pi) => `
      <div class="period-row">
        <input type="month" data-h="${i}" data-pp="${pi}" data-ppk="from" value="${esc(p.from)}">
        <span class="tilde">~</span>
        <input type="month" data-h="${i}" data-pp="${pi}" data-ppk="to" value="${esc(p.to)}">
        <button class="iconb" data-h="${i}" data-ppdel="${pi}">×</button>
      </div>`).join('');
    return `<div class="hcard">
      <div class="hhead"><div class="hno">${i + 1}</div><b style="font-size:14px">${esc(h.name || '주택 ' + (i + 1))}</b></div>
      <label class="mini">명의</label>
      <div class="seg sm" style="margin-top:6px">
        ${['me', 'spouse', 'joint', 'other'].map(o => `<button type="button" data-h="${i}" data-own="${o}" aria-pressed="${h.ownerType === o}">${OWN_LABEL[o]}</button>`).join('')}
      </div>
      ${shareUI}
      ${sumBad ? `<p class="subtle" style="color:var(--accent);font-weight:700">지분 합계가 100%가 아닙니다 — 현재 ${num(h.shares.me) + num(h.shares.spouse) + num(h.shares.other)}%</p>` : ''}
      <div class="grid2" style="margin-top:10px">
        <div>
          <label class="mini">취득 원인</label>
          <select data-h="${i}" data-k="acqCause">
            <option value="buy" ${h.acqCause === 'buy' ? 'selected' : ''}>매매</option>
            <option value="joint_first" ${h.acqCause === 'joint_first' ? 'selected' : ''}>최초 공동취득</option>
            <option value="gift" ${h.acqCause === 'gift' ? 'selected' : ''}>증여</option>
            <option value="inherit" ${h.acqCause === 'inherit' ? 'selected' : ''}>상속</option>
          </select>
        </div>
        <div>
          <label class="mini">거주</label>
          <div class="seg sm" style="margin-top:4px">
            ${[['now', '현재 거주'], ['past', '과거 거주'], ['none', '거주 안 함']].map(([v, l]) => `<button type="button" data-h="${i}" data-live="${v}" aria-pressed="${h.liveMode === v}">${l}</button>`).join('')}
          </div>
        </div>
        ${h.liveMode === 'now' ? `<div class="full">
          <label class="mini">전입 시기 (이 집에 살기 시작한 때)</label>
          <input type="month" data-h="${i}" data-k="liveFrom" value="${esc(h.liveFrom)}">
        </div>` : ''}
        ${h.liveMode !== 'none' ? `<div class="full">
          <label class="mini">과거 거주 기간 (있다면 — 입주 ~ 전출)</label>
          ${livePast}
          <button class="addrow" data-h="${i}" data-ppadd="1">＋ 기간 추가</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
  // 배우자 관련성 표시
  const anySpouse = S.inp.houses.some(h => num(h.shares.spouse) > 0);
  $('#ageSpouseWrap').style.opacity = anySpouse ? 1 : .45;
}

/* ── 스텝 4 ── */
function houseOptions(sel, filter) {
  const list = S.inp.houses.filter(filter || (() => true));
  return list.map((h, i) => `<option value="${h.id}" ${sel === h.id ? 'selected' : ''}>${esc(h.name || '주택 ' + (S.inp.houses.indexOf(h) + 1))}${h.priceMode === 'market' ? ` (시세 ${h.market || '?'}억)` : ` (공시 ${h.official || '?'}억)`}</option>`).join('');
}
function renderStep4() {
  $$('#purposeCards .opt').forEach(b => {
    const on = S.inp.purposes.includes(b.dataset.pp);
    b.classList.toggle('sel', on);
  });
  $('#sellForm').hidden = !S.inp.purposes.includes('sell');
  $('#acquireForm').hidden = !S.inp.purposes.includes('acquire');
  $('#jointForm').hidden = !S.inp.purposes.includes('joint');
  $('#giftForm').hidden = !S.inp.purposes.includes('gift');

  $('#sellHouse').innerHTML = houseOptions(S.inp.sell.houseId);
  if (!S.inp.sell.houseId && S.inp.houses[0]) S.inp.sell.houseId = S.inp.houses[0].id;
  $('#sellDate').value = S.inp.sell.date || '';
  $('#sellPrice').value = S.inp.sell.price;
  $('#sellCost').value = S.inp.sell.cost;
  $('#sellSameYear').checked = !!S.inp.sell.sameYearOther;
  $('#sellSenior').checked = !!S.inp.sell.seniorMove;

  $('#acqPrice2').value = S.inp.acquire.price;
  $('#acqHouses2').value = S.inp.acquire.housesAfter;
  $('#acqAdj2').checked = !!S.inp.acquire.adj;
  $('#acqBig2').checked = !!S.inp.acquire.big85;
  $('#acqTemp2').checked = !!S.inp.acquire.temp2;
  $('#acqFirst2').checked = !!S.inp.acquire.first;

  const soloMine = h => h.ownerType === 'me';
  const soloList = S.inp.houses.filter(soloMine);
  $('#jointHouse').innerHTML = soloList.length ? houseOptions(S.inp.joint.houseId, soloMine) : '<option value="">본인 단독명의 주택이 없습니다</option>';
  if (soloList.length && !soloList.some(h => h.id === S.inp.joint.houseId)) S.inp.joint.houseId = soloList[0].id;
  $('#jointShare').value = S.inp.joint.share;
  $('#jointShareOut').textContent = S.inp.joint.share + '%';
  $('#jointPrior').value = S.inp.joint.prior;

  $$('#giftType button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.inp.gift.type)));
  $('#giftHouse').innerHTML = houseOptions(S.inp.gift.houseId);
  if (!S.inp.gift.houseId && S.inp.houses[0]) S.inp.gift.houseId = S.inp.houses[0].id;
  $('#giftRelWrap').style.display = S.inp.gift.type === 'spouse_share' ? 'none' : '';
  $('#giftRel').value = S.inp.gift.type === 'spouse_share' ? 'spouse' : S.inp.gift.relation;
  $('#giftShare').value = S.inp.gift.share;
  $('#giftValue').value = S.inp.gift.value;
  $('#giftDebtWrap').hidden = S.inp.gift.type !== 'burden';
  $('#giftDebt').value = S.inp.gift.debt;
  $('#giftPrior').value = S.inp.gift.prior;
  $('#giftDate').value = S.inp.gift.date || '';
  const gh = S.inp.houses.find(x => x.id === S.inp.gift.houseId) || S.inp.houses[0];
  if (gh) {
    const mv = gh.priceMode === 'market' ? num(gh.market) : (num(gh.official) > 0 ? num(gh.official) / 0.69 : 0);
    $('#giftValueHint').textContent = mv > 0 ? `비워두면 시세 환산값 약 ${mv.toFixed(1)}억원을 사용합니다. 실제로는 유사 매매사례가액 등 시가 평가가 우선합니다.` : '비워두면 시세 환산값을 사용합니다.';
  }
}

/* ── 스텝 5 ── */
function renderStep5() {
  $$('#policyView button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.inp.assumptions.policyView)));
  $('#gMarket').value = S.inp.assumptions.marketGrowth;
  $('#gMarketOut').textContent = S.inp.assumptions.marketGrowth + '%';
  $('#gOfficial').value = S.inp.assumptions.officialGrowth;
  $('#gOfficialOut').textContent = S.inp.assumptions.officialGrowth + '%';
  $('#optUrban').checked = S.inp.assumptions.urban !== false;
}

/* ── 스텝 6 ── */
function statChip(t) {
  return { ok: '<span class="stat ok">확정</span>', est: '<span class="stat est">추정</span>', chk: '<span class="stat chk">확인 필요</span>', err: '<span class="stat err">계산 불가</span>' }[t];
}
function renderStep6() {
  const inp = numInp();
  const valid = validateInput(inp);
  valid.confirms = valid.confirms.concat(uiConfirms(inp));
  const a = inp.assumptions;

  const hSum = inp.houses.map((h, i) => {
    const priceTxt = h.priceMode === 'market'
      ? `시세 ${h.market}억 → 공시 추정 ${(h.market * 0.69).toFixed(2)}억`
      : `공시가격 ${h.official}억`;
    const adjTxt = v => v === 'yes' ? '규제' : v === 'no' ? '비규제' : '<span style="color:var(--accent)">미확인</span>';
    const flags = Object.entries({ temp2: '일시적2주택', inherit: '상속', lowLocal: '지방저가', rental: '등록임대', popDecline: '인구감소' })
      .filter(([k]) => h.flags[k]).map(([, v]) => v).join('·');
    const liveTxt = h.liveMode === 'now' ? `거주 중 (${h.liveFrom || '전입 시기 미입력'}~)` : h.liveMode === 'past' ? '과거 거주' : '비거주';
    const shareTxt = h.ownerType === 'me' ? '본인 100%' : h.ownerType === 'spouse' ? '배우자 100%'
      : `본인 ${h.shares.me}% · 배우자 ${h.shares.spouse}%${h.shares.other ? ` · 제3자 ${h.shares.other}%` : ''}`;
    return `<div class="sumcard"><div class="shead"><b>${i + 1}. ${esc(h.name)}</b><button class="iconb" data-goto="2">수정</button></div>
      <div class="sbody">${esc(h.region)} · ${priceTxt} · 취득 ${h.acqDate || '<span style="color:var(--accent)">미입력</span>'} (${h.acqPrice ? h.acqPrice + '억' : '취득가 미입력'})<br>
      규제지역 — 현재 ${adjTxt(h.adjNow)} / 취득 시 ${adjTxt(h.adjAcq)} / 양도 시 ${adjTxt(h.adjSale)}<br>
      <b>${shareTxt}</b> · ${liveTxt}${flags ? ` · <span style="color:var(--warn2)">${flags}</span>` : ''}</div></div>`;
  }).join('');

  const ppTxt = inp.purposes.map(p => PP_LABEL[p]).join(' · ');
  let ppDetail = '';
  if (inp.purposes.includes('sell')) {
    const h = inp.houses.find(x => x.id === inp.sell.houseId);
    ppDetail += `<br>매도 — ${esc(h ? h.name : '')} · ${inp.sell.date || '시기 미정'} · ${inp.sell.price || '?'}억 (경비 ${inp.sell.cost || 0}만)`;
  }
  if (inp.purposes.includes('joint')) ppDetail += `<br>공동명의 — 배우자에게 ${inp.joint.share}% 이전 검토`;
  if (inp.purposes.includes('gift')) {
    const rel = inp.gift.type === 'spouse_share' ? '배우자' : ({ spouse: '배우자', child: '자녀(성년)', minor: '자녀(미성년)', parent: '부모', other: '기타' }[inp.gift.relation]);
    ppDetail += `<br>증여 — ${({ general: '일반', spouse_share: '배우자 지분', burden: '부담부' })[inp.gift.type]} · ${rel} · 지분 ${inp.gift.share}%${inp.gift.type === 'burden' ? ` · 채무 ${inp.gift.debt}억` : ''}`;
  }
  if (inp.purposes.includes('acquire')) ppDetail += `<br>신규 취득 — ${inp.acquire.price}억 · 취득 후 ${inp.acquire.housesAfter}주택`;

  $('#confirmSummary').innerHTML = `
    <div class="sumcard"><div class="shead"><b>상황</b><button class="iconb" data-goto="1">수정</button></div>
      <div class="sbody"><b>${SIT_LABEL[inp.situation] || '미선택'}</b> · 본인 ${inp.people.me.age}세${S.inp.houses.some(h => num(h.shares.spouse) > 0) ? ` · 배우자 ${inp.people.spouse.age}세` : ''}
      ${inp.rights.presale ? ' · 분양권' : ''}${inp.rights.occupancy ? ' · 입주권' : ''}${inp.rights.inherited ? ' · 상속주택' : ''}</div></div>
    ${hSum}
    <div class="sumcard"><div class="shead"><b>계산 목적</b><button class="iconb" data-goto="4">수정</button></div>
      <div class="sbody"><b>${ppTxt}</b>${ppDetail}</div></div>
    <div class="sumcard"><div class="shead"><b>가정</b><button class="iconb" data-goto="5">수정</button></div>
      <div class="sbody">${a.policyView === 'both' ? '현행 + 8·3 정부안 비교' : a.policyView === 'current' ? '현행법만' : '8·3 정부안만'} ·
      시세 상승 연 ${a.marketGrowth}% · 공시 상승 연 ${a.officialGrowth}% · 도시지역분 ${a.urban ? '포함' : '제외'}</div></div>`;

  const li = (t, items) => items.map(x => `<li>${statChip(t)}<span>${esc(x.msg)}</span></li>`).join('');
  $('#confirmStatus').innerHTML = `
    <h3 class="mini-h">입력 상태 점검</h3>
    <ul class="statlist">
      ${li('err', valid.errors)}
      ${li('chk', valid.confirms)}
      ${li('est', valid.estimates)}
      ${li('ok', valid.fixed)}
      ${!valid.errors.length && !valid.confirms.length && !valid.estimates.length ? `<li>${statChip('ok')}<span>모든 입력이 확정값입니다.</span></li>` : ''}
    </ul>
    ${valid.errors.length ? `<div class="warnbox"><b>계산할 수 없습니다.</b> 위의 ‘계산 불가’ 항목을 수정하면 결과 버튼이 활성화됩니다.</div>` : ''}`;
  return valid;
}

/* ── 렌더 총괄 ── */
function renderAll() {
  // 스테퍼
  $('#stepper').innerHTML = STEP_LABELS.map((l, i) => {
    const n = i + 1;
    const cls = n === S.step ? 'cur' : n < S.step ? 'done' : '';
    return `<button class="st ${cls}" data-st="${n}" ${n >= S.step ? 'disabled' : ''}><i></i>${l}</button>`;
  }).join('');
  // 섹션 표시
  const ids = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'stepR'];
  ids.forEach((id, i) => { $('#' + id).hidden = (i + 1) !== S.step; });
  // 스텝별 렌더
  if (S.step === 1) renderStep1();
  if (S.step === 2) renderStep2();
  if (S.step === 3) renderStep3();
  if (S.step === 4) renderStep4();
  if (S.step === 5) renderStep5();
  let valid = null;
  if (S.step === 6) valid = renderStep6();
  if (S.step === 7) renderReport();
  // 내비
  $('#btnPrev').style.visibility = S.step === 1 ? 'hidden' : '';
  const next = $('#btnNext');
  $('#navMsg').style.display = 'none';
  if (S.step === 6) {
    next.textContent = '결과 확인하기';
    next.disabled = !!(valid && valid.blocked);
  } else if (S.step === 7) {
    next.textContent = '입력 수정하기';
    next.disabled = false;
  } else {
    next.textContent = '다음';
    next.disabled = false;
  }
  $('#bottnav').style.display = '';
}

/* =====================================================================
   결과 보고서
   ===================================================================== */
const scenBadge = scen => scen === 'current'
  ? '<span class="stat info">현행법 · 확정</span>'
  : '<span class="stat chk">정부안 · 국회 심의 전</span>';
const estBadge = '<span class="stat est">추정</span>';

function svgEl(t, a = {}) { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); return e; }
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
function barChart(host, cfg) {
  host.innerHTML = '';
  const W = host.clientWidth || 340, padL = 48, padR = 12, padT = 26, padB = 34, H = 240;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(...cfg.data.map(d => cfg.mode === 'stack' ? d.total : Math.max(...d.segs.map(s => s.value))), 1));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': cfg.aria || '차트' });
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i / 4);
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: i === 0 ? 'axis' : 'grid' }));
    const t = svgEl('text', { x: padL - 8, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    t.textContent = shortWon(max * i / 4);
    svg.appendChild(t);
  }
  const n = cfg.data.length, slot = plotW / n;
  const barW = cfg.mode === 'stack' ? Math.min(38, slot * 0.5) : Math.min(22, slot * 0.30);
  cfg.data.forEach((d, i) => {
    const cx = padL + slot * (i + 0.5);
    if (cfg.mode === 'stack') {
      let acc = 0; const x = cx - barW / 2;
      d.segs.forEach((s, si) => {
        const h = Math.max(0, (s.value / max) * plotH);
        if (h <= 0) return;
        const y = padT + plotH - ((acc + s.value) / max) * plotH;
        const r = svgEl('rect', { x, y, width: barW, height: Math.max(1, h - (si ? 2 : 0)), rx: 4, fill: `var(--${cfg.series[si].varName})`, class: 'mark' });
        r.dataset.tip = `${d.label} · ${cfg.series[si].label}\n${won(s.value)}`;
        svg.appendChild(r); acc += s.value;
      });
      const lb = svgEl('text', { x: cx, y: Math.max(padT - 6, padT + plotH - (d.total / max) * plotH - 8), class: 'vlabel' + (d.flag ? ' hi' : ''), 'text-anchor': 'middle' });
      lb.textContent = shortWon(d.total); svg.appendChild(lb);
    } else {
      const gw = barW + 4, start = cx - (gw * d.segs.length) / 2;
      d.segs.forEach((s, si) => {
        const h = Math.max(0, (s.value / max) * plotH);
        const r = svgEl('rect', { x: start + gw * si + 2, y: padT + plotH - h, width: barW, height: Math.max(1, h), rx: 4, fill: `var(--${cfg.series[si].varName})`, class: 'mark' });
        r.dataset.tip = `${d.label} · ${cfg.series[si].label}\n${won(s.value)}`;
        svg.appendChild(r);
      });
    }
    const xl = svgEl('text', { x: cx, y: H - padB + 18, class: 'tick' + (d.flag ? ' hi' : ''), 'text-anchor': 'middle' });
    xl.textContent = d.label; svg.appendChild(xl);
    if (d.flag) { const bd = svgEl('text', { x: cx, y: H - padB + 31, class: 'tick hi', 'text-anchor': 'middle' }); bd.textContent = cfg.flagLabel || '최소'; svg.appendChild(bd); }
  });
  host.appendChild(svg);
  let tip = host.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip); }
  svg.querySelectorAll('.mark').forEach(m => {
    m.addEventListener('mouseenter', () => { tip.textContent = m.dataset.tip; tip.style.display = 'block'; });
    m.addEventListener('mousemove', ev => {
      const r = host.getBoundingClientRect();
      tip.style.left = Math.min(r.width - 150, Math.max(4, ev.clientX - r.left - 60)) + 'px';
      tip.style.top = Math.max(0, ev.clientY - r.top - 52) + 'px';
    });
    m.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}
function legendHTML(series) {
  return series.map(s => `<span class="lg"><i style="background:var(--${s.varName})"></i>${s.label}</span>`).join('');
}

let R = null; // 마지막 계산 컨텍스트

function renderReport() {
  const inp = numInp();
  const valid = validateInput(inp);
  valid.confirms = valid.confirms.concat(uiConfirms(inp));
  if (valid.blocked) { go(6); return; }

  const cur = holdSim(inp, 'current');
  const ref = holdSim(inp, 'reform');
  const sens = sensitivity(inp);
  const thr = thresholds(inp);
  const conf = confidenceGrade(inp, valid, sens);
  const concl = conclusionOf(inp, cur, ref, valid, sens);
  const pv = inp.assumptions.policyView;
  const years = cur.map(r => r.year);

  const ctx = { inp, valid, cur, ref, sens, thr, conf, concl, pv, years };
  R = ctx;
  ctx.sell = inp.purposes.includes('sell') ? { cur: sellSim(inp, 'current'), ref: sellSim(inp, 'reform') } : null;
  ctx.gift = inp.purposes.includes('gift') ? giftFull(inp) : null;
  ctx.joint = inp.purposes.includes('joint') ? jointConvertAnalysis(inp) : null;
  ctx.acq = inp.purposes.includes('acquire') ? acquisitionTax({
    // P0-5 (지방세법 §13의3): 취득세 중과 판정 시 세대별 주택수에 분양권·입주권 포함
    price: inp.acquire.price * 억, housesAfter: inp.acquire.housesAfter + rightsCountOf(inp),
    adj: !!inp.acquire.adj,
    big85: !!inp.acquire.big85, temp2: !!inp.acquire.temp2, firstHome: !!inp.acquire.first
  }) : null;

  /* ── RESULT A: 핵심 결과 (즉시 공개) ── */
  const parts = [];
  parts.push(heroHTML(ctx));
  parts.push(compareChartHTML(ctx));
  parts.push(`<div class="expandcard"><button class="expandbtn" id="insightBtn">결과 심층 분석 보기 ↓<span class="sm">왜 달라지나 · 과세 전환점 · 민감도 · 공동명의 · 계산 근거</span></button></div>`);

  /* ── RESULT B: 닥터마빈 인사이트 (클릭 시 같은 페이지에서 펼침 · 무료) ── */
  parts.push('<div id="insightWrap" hidden>');
  parts.push(opinionHTML(ctx));
  parts.push(whyHTML(ctx));
  parts.push(whenHTML(ctx));
  parts.push(sensHTML(ctx));
  const jc = cur.find(r => r.jong.mode === 'joint-compare');
  if (jc || ctx.joint) parts.push(jointHTML(ctx));
  if (ctx.sell) parts.push(sellHTML(ctx));
  if (ctx.gift) parts.push(giftHTML(ctx));
  if (ctx.acq) parts.push(acqHTML(ctx));
  parts.push(detailHTML(ctx));
  parts.push(ctaHTML('main')); // 질문 CTA — 계산 근거 직후 (PRD §3.3)
  parts.push('</div>');

  parts.push(basisHTML(ctx));
  parts.push(ctaHTML('footer')); // 보조 CTA — 페이지 맨 끝 1회
  parts.push(ytCtaHTML());       // 유튜브 CTA — 영상 URL 설정 시 해당 영상으로 교체

  $('#report').innerHTML = parts.join('');
  wireReport(ctx);
  track('calculation_complete', true);
}

/* 유튜브 CTA — YOUTUBE_FEATURE_URL 설정 시 해당 영상으로, 아니면 채널로 연결 */
function ytCtaHTML() {
  const url = CONFIG.YOUTUBE_FEATURE_URL || CONFIG.YOUTUBE_CHANNEL;
  if (!url) return '';
  return `<div class="cta" style="border-color:var(--line);background:var(--surface)">
    <h3 style="color:var(--ink)">세제개편안 핵심 해석 영상</h3>
    <p>8·3 세제개편의 핵심 내용과 해석은 유튜브 「닥터마빈의 재테크 에세이」에서 이어집니다.</p>
    <a class="btn" data-ev="youtube_click" href="${esc(url)}" target="_blank" rel="noopener">${CONFIG.YOUTUBE_FEATURE_URL ? '해석 영상 보기 →' : '유튜브에서 보기 →'}</a>
  </div>`;
}

/* 질문 CTA — BLOG_QNA_URL이 비어 있으면 렌더하지 않는다 (PRD §4.3: 홈으로 임시 연결 금지) */
function ctaHTML(kind) {
  if (!CONFIG.BLOG_QNA_URL) return '';
  const url = esc(CONFIG.BLOG_QNA_URL);
  if (kind === 'main') return `<div class="cta">
    <h3>내 사례가 애매하게 느껴지나요?</h3>
    <p>시뮬레이터 결과가 실제 상황과 다르게 느껴지거나, 계산 기준·세제개편 내용 중 궁금한 점이 있다면 블로그 비밀댓글로 남겨주세요. 질문은 모두 확인하며, 내용 중심으로 가능한 범위에서 답변드리겠습니다.</p>
    <a class="btn" data-ev="question_cta_click" href="${url}" target="_blank" rel="noopener">닥터마빈에게 질문 남기기 →</a>
    <p class="fine">정확한 주소·연락처 등 개인을 식별할 수 있는 정보는 남기지 마세요.</p>
  </div>`;
  return `<div class="cta">
    <p style="margin-bottom:12px">계산 결과·적용 기준·오류가 의심되는 부분은 블로그 비밀댓글로 남겨주세요.</p>
    <a class="btn" data-ev="question_cta_click" href="${url}" target="_blank" rel="noopener">질문 남기기 →</a>
  </div>`;
}

/* 1) 한 줄 결론 */
function heroHTML(c) {
  const est = c.valid.estimates.length > 0;
  const r26 = c.cur[0], ref28 = c.ref[2];
  const diff = ref28.holdTax - c.cur[2].holdTax;
  const tiles = [
    { k: `${c.years[0]}년 보유세 (현행·확정)`, v: won(r26.holdTax), s: `재산세 ${won(r26.prop.total)} + 종부세 ${won(r26.jong.total)}` },
    { k: `${ref28.year}년 보유세 (정부안 가정)`, v: won(ref28.holdTax), s: `현행 유지 대비 ${diff === 0 ? '차이 없음' : (diff > 0 ? '+' : '−') + won(Math.abs(diff))}`, cls: diff > 1000 ? 'up' : diff < -1000 ? 'down' : '' }
  ];
  if (c.sell) {
    const rows = c.pv === 'current' ? c.sell.cur.rows : c.sell.ref.rows;
    const best = rows.reduce((a, b) => b.grand < a.grand ? b : a);
    tiles.push({ k: '세부담 최소 매도 시점', v: best.year + '년', s: `총 세부담 ${won(best.grand)} (${c.pv === 'current' ? '현행' : '정부안'} 기준)` });
  }
  if (c.gift) tiles.push({ k: '증여 총 이전비용', v: won(c.gift.total), s: '증여세+취득세' + (c.gift.giverYangdo ? '+증여자 양도세' : '') });
  if (c.joint && c.joint.breakeven) tiles.push({ k: '공동명의 전환 손익분기', v: c.joint.breakeven > 60 ? '60년 이상' : c.joint.breakeven.toFixed(1) + '년', s: `전환비용 ${won(c.joint.cost)} ÷ 연 절감 ${won(c.joint.annual)}` });
  if (c.acq) tiles.push({ k: '신규 취득세', v: won(c.acq.total), s: `세율 ${(c.acq.rate * 100).toFixed(1).replace(/\.0$/, '')}%${c.acq.heavy ? ' (중과)' : ''}` });

  return `<div class="hero">
    <div class="k">진단 결론 · ${RULES.reviewedAt} 기준</div>
    <div class="big">${esc(c.concl.head)}</div>
    <p class="sub2">${esc(c.concl.sub)}</p>
    <div class="chiprow">
      <span class="grade ${c.conf.grade}">${c.conf.grade}</span>
      <span class="stat ${c.conf.grade === 'A' ? 'ok' : c.conf.grade === 'B' ? 'est' : 'chk'}">신뢰도 ${c.conf.grade} — ${esc(c.conf.why)}</span>
    </div>
    <div class="chiprow">${scenBadge('current')}${scenBadge('reform')}${est ? estBadge : ''}</div>
    <div class="tiles">${tiles.map(t => `<div class="tile"><div class="k">${t.k}</div><div class="tile-val ${t.cls || ''}">${t.v}</div><div class="s">${t.s}</div></div>`).join('')}</div>
  </div>`;
}

/* 2) 현행 vs 정부안 */
function driverText(c) {
  const inp = c.inp;
  const houses = inp.houses;
  const stat = oneStatusOf(houses);
  const mainH = houses.find(h => liveNowOf(h.livePeriods)) || houses[0];
  const live = mainH && liveNowOf(mainH.livePeriods);
  const items = [];
  if (stat.one && live) items.push('기본공제 12억 → <b>14억원</b>(실거주 1주택) — 과세 문턱 상향(감세 요인)');
  if (stat.one && !live) items.push('기본공제 12억 → <b>9억원</b>(비거주 1주택) — 이번 개편에서 부담이 가장 크게 늘어나는 유형');
  if (!stat.one) items.push('다주택 인별 기본공제 9억 → <b>4억 + 5억 × 거주주택 비중</b> — 거주 비중이 낮을수록 불리');
  const hasAdj = houses.some(h => adjYes(h.adjNow));
  if (houses.length >= 3 || (houses.length >= 2 && hasAdj)) items.push('공정시장가액비율 60% → 70%(2027) → <b>80%</b>(2028, 3주택 이상·조정 2주택) — 과세표준 확대(증세 요인)');
  else items.push('공정시장가액비율 60% → <b>70%</b>(2027~) — 과세표준 확대(증세 요인)');
  items.push('종부세 세액공제 기준이 보유기간에서 <b>거주기간</b> 중심으로 이동(2028~)');
  if (houses.length >= 3) items.push('2027년 3주택 이상은 중과 체계(최고 5%)가 유지되고, 2028년 세율 일원화로 통합');
  return items;
}
function compareChartHTML(c) {
  return `<div class="card">
    <h2>연도별 보유세 비교 ${scenBadge('reform')}</h2>
    <p class="hint">같은 입력을 현행 확정법과 8·3 정부안(국회 심의 전)에 각각 적용한 결과입니다. 2026년은 두 시나리오가 같습니다.</p>
    <div class="chart-head"><div class="lgs" id="lgCmp"></div></div>
    <div class="chart" id="chartCmp"></div>
    <p class="subtle">정부안·개인별 사실관계에 따라 실제 결과는 달라질 수 있습니다.</p>
  </div>`;
}

/* B-2) 왜 달라지나 */
function whyHTML(c) {
  return `<div class="card">
    <h2>왜 달라지나 — 증감 원인</h2>
    <p class="hint">단순히 얼마가 늘어나는지만 보기보다, 어떤 제도 변화 때문에 결과가 달라지는지를 함께 확인해보세요.</p>
    <ul class="notes">${driverText(c).map(t => `<li>${t}</li>`).join('')}</ul>
  </div>`;
}

/* B-3) 언제 달라지나 — 연도별 표 + 과세 전환점 */
function whenHTML(c) {
  const showCur = c.pv !== 'reform', showRef = c.pv !== 'current';
  const rowsHtml = c.years.map((y, i) => {
    const a = c.cur[i], b = c.ref[i];
    const d = b.holdTax - a.holdTax;
    return `<tr><td>${y}</td>
      ${showCur ? `<td>${won(a.prop.total)}</td><td>${won(a.jong.total)}</td><td class="strong">${won(a.holdTax)}</td>` : ''}
      ${showRef ? `<td class="strong">${won(b.holdTax)}</td>` : ''}
      ${showCur && showRef ? `<td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d === 0 ? '—' : (d > 0 ? '+' : '−') + won(Math.abs(d))}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="card">
    <h2>언제 달라지나 — 연도별 변화</h2>
    <div class="tblwrap"><table>
      <thead><tr><th>연도</th>${showCur ? '<th>재산세</th><th>종부세</th><th>현행 합계</th>' : ''}${showRef ? '<th>정부안 합계</th>' : ''}${showCur && showRef ? '<th>차이</th>' : ''}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
  </div>${thresholdHTML(c)}`;
}

/* B-3b) 과세 전환점 */
function thresholdHTML(c) {
  const t = c.thr;
  if (!t) return '';
  const pubNow = t.pubNow;
  const mkRow = (label, badge, m) => {
    const over = pubNow > m.pub;
    const pct = m.pct;
    return `<tr><td>${label} ${badge}</td>
      <td>${eok(m.pub)} 초과</td>
      <td>≈ ${eok(m.market)}</td>
      <td>${over ? '<b style="color:var(--up)">이미 초과</b>' : `+${Math.round(pct * 100)}% 상승 시`}</td></tr>`;
  };
  const growRows = !((pubNow > t.current.pub) && (pubNow > t.reform.pub)) ? `
    <h3 class="mini-h">공시가격이 매년 오른다면 (단순 동일률 가정)</h3>
    <div class="tblwrap"><table>
      <thead><tr><th>연 상승률</th><th>현행 문턱 도달</th><th>정부안 문턱 도달</th></tr></thead>
      <tbody>${[0, 1, 2].map(i => {
      const g = t.current.years[i];
      const yc = t.current.years[i].years, yr = t.reform.years[i].years;
      return `<tr><td>연 ${Math.round(g.g * 100)}%</td>
          <td>${pubNow > t.current.pub ? '이미 초과' : yc > 0 ? '약 ' + Math.ceil(yc) + '년 후' : '—'}</td>
          <td>${pubNow > t.reform.pub ? '이미 초과' : yr > 0 ? '약 ' + Math.ceil(yr) + '년 후' : '—'}</td></tr>`;
    }).join('')}</tbody>
    </table></div>
    <p class="subtle">공시가격이 매년 같은 비율로 오른다는 단순 가정입니다. 실제 고시가격·정책 변경에 따라 달라집니다.</p>` : '';
  return `<div class="card">
    <h2>언제 달라지나 — 과세 전환점</h2>
    <p class="hint">현재 공시가격 합계 <b>${eok(pubNow)}</b> 기준, 종부세 과세가 시작되는 지점입니다.${t.oneStatus.one && c.inp.houses.length === 1 && Object.values(c.inp.houses[0].shares).filter(v => v > 0).length > 1 ? ' 부부 공동명의는 개별납부·특례 중 유리한 쪽 기준의 실효 문턱입니다.' : ''}</p>
    <div class="tblwrap"><table>
      <thead><tr><th>기준</th><th>공시가격 문턱</th><th>시세 환산(÷69%)</th><th>현재 대비</th></tr></thead>
      <tbody>
        ${mkRow('현행', scenBadge('current'), t.current)}
        ${mkRow('정부안', scenBadge('reform'), t.reform)}
      </tbody>
    </table></div>
    ${growRows}
  </div>`;
}

/* 4) 민감도 */
function sensHTML(c) {
  const s = c.sens;
  return `<div class="card">
    <h2>조건이 달라지면 — 공시가격 ±5% 민감도</h2>
    <p class="hint">공시가격·시세는 확정값이 아닐 수 있습니다. 기준·하향·상향 3개 시나리오의 연간 보유세입니다.</p>
    <div class="tblwrap"><table>
      <thead><tr><th>시나리오</th><th>현행 2026</th><th>정부안 2027</th><th>정부안 2028</th></tr></thead>
      <tbody>${s.rows.map(r => `<tr${r.label === '기준' ? ' class="hi"' : ''}><td>${r.label}</td><td>${won(r.cur2026)}</td><td>${won(r.ref2027)}</td><td>${won(r.ref2028)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${s.nearBoundary ? `<div class="warnbox"><b>과세 경계 ±5% 이내입니다.</b> 이 구간에서는 공시가격이 조금만 달라져도 과세 여부가 바뀝니다. 실제 고시 공시가격(부동산공시가격알리미)을 확인한 뒤 판단하세요.</div>` : ''}
  </div>`;
}

/* 5) 검토의견 (7계층) */
function opinionHTML(c) {
  const inp = c.inp;
  const houses = inp.houses;
  const stat = oneStatusOf(houses);
  const mainH = houses.find(h => liveNowOf(h.livePeriods)) || houses[0];
  const live = mainH && liveNowOf(mainH.livePeriods);
  const pubNow = houses.reduce((s, h) => s + pubOf(h), 0);
  const r26 = c.cur[0], c28 = c.cur[2], r28 = c.ref[2];
  const anyJoint = houses.some(h => shareOf(h, 'me') > 0 && shareOf(h, 'spouse') > 0);

  // 1 사실
  const estMark = houses.some(pubEstimated) ? ' (일부 추정)' : '';
  const facts = `세대 기준 <b>${houses.length}주택</b>${stat.temp2 ? ' (일시적 2주택 표시)' : ''}, ` +
    `명의 ${anyJoint ? '부부 공동 포함' : '단독'}, 공시가격 합계 <b>${eok(pubNow)}</b>${estMark}, ` +
    `${live ? `본인 세대가 ${esc(mainH.name || '주요 주택')}에 거주 중` : '보유 주택에 거주하지 않음'}, ` +
    `본인 ${inp.people.me.age}세` +
    `${mainH && mainH.acqDate ? `, 주요 주택 취득 ${mainH.acqDate} (보유 ${Math.floor(r26.holdY)}년차, 거주 ${Math.floor(r26.liveY)}년)` : ''}.`;

  // 2 적용 규칙
  const rules = [];
  if (stat.one && !anyJoint) rules.push(`1세대 1주택 단독명의 — 종부세 기본공제 현행 12억원, 정부안 ${live ? '실거주 14억원' : '비거주 9억원'} 적용.`);
  if (stat.one && anyJoint) rules.push('1세대 1주택 부부 공동명의 — 각자 지분별 개별납부와 1세대 1주택 특례(전체 합산 + 고령·장기 세액공제)를 모두 계산해 유리한 쪽을 표시.');
  if (!stat.one) rules.push(`다주택(${houses.length}주택) — 종부세는 사람별 합산 과세. 정부안 기본공제는 4억 + 5억 × 거주주택 비중으로 계산.`);
  if (stat.temp2) rules.push('일시적 2주택 표시 — 처분기한 내 요건 충족을 전제로 1주택 지위를 유지한 계산입니다. 기한 경과 시 결과가 달라집니다.');
  const hasAdjAny = houses.some(h => adjYes(h.adjNow));
  if (houses.length >= 3 || (houses.length >= 2 && hasAdjAny)) rules.push('3주택 이상 또는 조정대상지역 2주택 — 2028년부터 공정시장가액비율 80% 적용 대상.');
  if (houses.some(h => h.adjNow === 'unknown' || h.adjAcq === 'unknown' || h.adjSale === 'unknown')) rules.push('규제지역 여부가 미확인인 항목은 보수적으로(규제지역으로) 가정했습니다.');
  rules.push('재산세는 물건별(2026년 현행 지방세), 종부세는 납세자별, 양도세는 양도자별, 증여세는 수증자별로 계산 단위를 분리했습니다.');

  // 3 계산 결론
  const calcLine = `현행 기준 ${c.years[0]}년 보유세는 <b>${won(r26.holdTax)}</b>(재산세 ${won(r26.prop.total)} + 종부세 ${won(r26.jong.total)}), ` +
    `${r28.year}년 정부안 가정 시 <b>${won(r28.holdTax)}</b>로 현행 유지 대비 ${r28.holdTax - c28.holdTax === 0 ? '차이가 없습니다' : `${won(Math.abs(r28.holdTax - c28.holdTax))} ${r28.holdTax > c28.holdTax ? '늘어납니다' : '줄어듭니다'}`}.`;

  // 4 임계점
  let thrLine = '';
  if (c.thr) {
    const t = c.thr;
    if (r26.jong.total <= 0 && r28.jong.total <= 0) {
      thrLine = `현재는 세율보다 <b>과세 문턱</b>이 핵심입니다. 공시가격 합계 ${eok(pubNow)}는 현행 기준 ${eok(t.current.pub)}, 정부안 기준 ${eok(t.reform.pub)}에 미치지 않으므로, 공정시장가액비율이 올라도 ‘공시가격 − 기본공제’가 0 이하이면 종부세 과세표준은 계속 0원입니다.`;
    } else {
      thrLine = `과세 시작점은 현행 공시가격 ${eok(t.current.pub)} 초과, 정부안 ${eok(t.reform.pub)} 초과입니다. 시세로는 약 ${eok(t.reform.market)} 수준(현실화율 69% 단순 가정)입니다.`;
    }
  }

  // 5 민감도
  const sRow = c.sens.rows;
  const sensLine = `공시가격이 ±5% 달라지면 ${r28.year}년 정부안 보유세는 ${won(sRow[0].ref2028)} ~ ${won(sRow[2].ref2028)} 범위에서 움직입니다.` +
    (c.sens.nearBoundary ? ' 현재 과세 경계와 가까워 이 범위 안에서 과세 여부 자체가 바뀔 수 있습니다.' : '');

  // 6 보수적 해석
  const cons = c.valid.confirms.map(x => x.msg);
  if (!cons.length) cons.push('미확인 항목이 없습니다. 다만 정부안은 국회 심의 결과에 따라 수정·무산될 수 있습니다.');

  // 7 다음 행동
  const acts = [
    '부동산공시가격알리미에서 실제 공시가격을 확인해 입력값을 확정하세요.',
    '등기부등본으로 지분·취득일을, 국토교통부 고시로 조정대상지역 지정·해제 이력을 확인하세요.'
  ];
  if (stat.temp2) acts.push('일시적 2주택 처분기한(취득 시점에 따라 2년/3년)을 달력에 표시하고, 기한 내 처분 가능성을 점검하세요.');
  if (anyJoint || inp.purposes.includes('joint')) acts.push('공동명의 특례 신청은 매년 9월 16~30일입니다 — 유리한 쪽이 해마다 달라질 수 있어 매년 비교가 필요합니다.');
  if (inp.purposes.includes('gift')) acts.push('증여 전 유사 매매사례가액(시가) 평가와 이월과세 10년 요건을 세무전문가와 확인하세요.');
  if (inp.purposes.includes('sell')) acts.push('양도 시기는 6월 1일(보유세 기준일)과 연도별 세율·공제 변화가 함께 걸립니다 — 잔금일 기준으로 최종 확인하세요.');
  acts.push('실제 신고·매도·명의변경·증여 실행 전에는 세무전문가 확인이 필요합니다.');

  return `<div class="card">
    <h2>결과 심층 분석 — 종합</h2>
    <p class="hint">단순 세액이 아니라 ‘왜 이런 결과가 나왔는지’를 검증된 계산 결과와 근거로 해석한 자동 해설입니다. 세액을 새로 만들지 않습니다.</p>
    <div class="op"><div class="ot">1 · 확인된 사실</div><p>${facts}</p></div>
    <div class="op"><div class="ot">2 · 적용 규칙</div><ul>${rules.map(r => `<li>${r}</li>`).join('')}</ul></div>
    <div class="op"><div class="ot">3 · 계산 결론</div><p>${calcLine}</p></div>
    <div class="op"><div class="ot">4 · 임계점</div><p>${thrLine}</p></div>
    <div class="op"><div class="ot">5 · 민감도</div><p>${sensLine}</p></div>
    <div class="op"><div class="ot">6 · 보수적 해석</div><ul>${cons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
    <div class="op"><div class="ot">7 · 실행 전 확인</div><ul>${acts.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
  </div>`;
}

/* 6) 공동명의 */
function jointHTML(c) {
  const jc26 = c.cur.map(r => r.jong).filter(j => j.mode === 'joint-compare');
  const jcRef = c.ref.map(r => r.jong).filter(j => j.mode === 'joint-compare');
  let cmpTable = '';
  if (jc26.length) {
    cmpTable = `<h3 class="mini-h">부부 개별납부 vs 1세대 1주택 특례 (종부세·농특세 포함)</h3>
    <div class="tblwrap"><table>
      <thead><tr><th>연도</th><th>현행 개별</th><th>현행 특례</th><th>정부안 개별</th><th>정부안 특례</th><th>유리</th></tr></thead>
      <tbody>${c.years.map((y, i) => {
      const a = c.cur[i].jong, b = c.ref[i].jong;
      if (a.mode !== 'joint-compare') return '';
      const bj = b.mode === 'joint-compare' ? b : a;
      const best = (c.pv === 'current' ? a : bj);
      return `<tr><td>${y}</td>
        <td${a.joint.best === 'indiv' ? ' class="strong"' : ''}>${won(a.joint.indivTotal)}</td>
        <td${a.joint.best === 'special' ? ' class="strong"' : ''}>${won(a.joint.special.total)}</td>
        <td${bj.joint.best === 'indiv' ? ' class="strong"' : ''}>${won(bj.joint.indivTotal)}</td>
        <td${bj.joint.best === 'special' ? ' class="strong"' : ''}>${won(bj.joint.special.total)}</td>
        <td>${best.joint.best === 'indiv' ? '개별납부' : '특례신청'} (${won(Math.abs(best.joint.indivTotal - best.joint.special.total))} 차)</td></tr>`;
    }).join('')}</tbody>
    </table></div>
    <p class="subtle">특례는 지분이 큰 사람이 신청(매년 9월 16~30일)하며, 고령·장기보유 세액공제를 받을 수 있습니다. 표의 굵은 값이 그 시나리오에서 유리한 쪽입니다.</p>`;
  }
  let convert = '';
  if (c.joint) {
    const j = c.joint;
    convert = `<h3 class="mini-h">단독명의 → 부부 공동명의(${Math.round(j.share * 100)}%) 전환 분석</h3>
    <div class="kv"><span>이전 지분 평가액 (시가 기준)</span><span>${won(j.value)}</span></div>
    <div class="kv"><span>증여세 (배우자 공제 6억 반영)</span><span>${won(j.gt.tax)}</span></div>
    <div class="kv"><span>증여 취득세${j.at.heavy ? ' <span class="stat chk">12% 중과</span>' : ' (3.5%)'}</span><span>${won(j.at.total)}</span></div>
    <div class="kv total"><span>전환 비용 합계</span><span>${won(j.cost)}</span></div>
    <div class="tblwrap"><table>
      <thead><tr><th>연도</th><th>전환 전 종부세</th><th>전환 후 종부세</th><th>연간 절감</th></tr></thead>
      <tbody>${j.savings.reform.map(r => `<tr><td>${r.year} ${r.year === 2026 ? '(현행)' : '(정부안)'}</td><td>${won(r.before)}</td><td>${won(r.after)}</td><td class="${r.save > 0 ? 'down' : r.save < 0 ? 'up' : ''}">${r.save === 0 ? '—' : (r.save > 0 ? '−' : '+') + won(Math.abs(r.save))}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="kv"><span>연평균 절감 (정부안 2027~2030)</span><span>${won(c.joint.annual)}</span></div>
    <div class="kv"><span>손익분기</span><span>${j.breakeven ? (j.breakeven > 60 ? '60년 이상 — 세금만으로는 전환 실익 없음' : '약 ' + j.breakeven.toFixed(1) + '년') : '연간 절감이 없어 산출 불가'}</span></div>
    <div class="warnbox"><b>명의 변경은 절감액보다 비용을 먼저 보세요.</b><br>${j.warnings.map(w => '· ' + esc(w)).join('<br>')}</div>`;
  }
  return `<div class="card"><h2>명의에 따라 — 공동명의 비교</h2>
    <p class="hint">종부세는 사람별로 계산됩니다. 부부 공동명의 1주택은 ‘각자 납부’와 ‘특례 신청’ 중 매년 유리한 쪽을 고를 수 있습니다.</p>
    ${cmpTable}${convert}</div>`;
}

/* 7) 매도 */
function sellHTML(c) {
  const scen0 = c.pv === 'current' ? 'current' : 'reform';
  const sim = scen0 === 'current' ? c.sell.cur : c.sell.ref;
  const h = sim.house;
  let temp2Note = '';
  const other = c.inp.houses.find(x => x.id !== h.id && x.flags && x.flags.temp2) || (h.flags && h.flags.temp2 ? c.inp.houses.find(x => x.id !== h.id) : null);
  if (c.inp.houses.length === 2 && c.inp.houses.some(x => x.flags && x.flags.temp2)) {
    const newer = c.inp.houses.slice().sort((a, b) => (b.acqDate || '') > (a.acqDate || '') ? 1 : -1)[0];
    if (newer && newer.acqDate) {
      const yrs = newer.acqDate >= '2026-08' ? 2 : 3;
      const d = ym(newer.acqDate);
      temp2Note = `<div class="warnbox"><b>일시적 2주택 처분기한</b> — 신규주택 취득(${newer.acqDate}) 기준 ${yrs}년: <b>${d.y + yrs}년 ${d.m}월</b>까지 종전주택을 처분해야 특례가 유지됩니다. 2026년 8월 4일 이후 취득분부터 2년이 적용되는 정부안 기준입니다.</div>`;
    }
  }
  return `<div class="card">
    <h2>매도 — ${esc(h.name || '선택 주택')} ${scenBadge(scen0)}</h2>
    <p class="hint">그해 ${sim.saleMonth}월에 판다고 가정했을 때의 ‘그때까지 낸 보유세 누계 + 그해 양도세’입니다.${sim.before61 ? ' 양도 시기가 6월 1일 이전이라 매도 연도의 보유세는 매수자 부담으로 제외했습니다.' : ''}</p>
    ${c.pv === 'both' ? `<div class="seg sm no-print" id="sellScen" style="max-width:280px"><button data-v="reform" aria-pressed="${scen0 === 'reform'}">정부안</button><button data-v="current" aria-pressed="${scen0 === 'current'}">현행</button></div>` : ''}
    <div class="chart-head" style="margin-top:10px"><div class="lgs" id="lgSell"></div></div>
    <div class="chart" id="chartSell"></div>
    <div class="tblwrap"><table>
      <thead><tr><th>매도 연도</th><th>보유세 누계</th><th>양도세(지방세 포함)</th><th>총 세부담</th></tr></thead>
      <tbody id="sellTbody"></tbody>
    </table></div>
    <ul class="notes" id="sellNotes" style="margin-top:12px"></ul>
    ${temp2Note}
  </div>`;
}
function renderSellInner(c, scen) {
  const sim = scen === 'current' ? c.sell.cur : c.sell.ref;
  const best = sim.rows.reduce((a, b) => b.grand < a.grand ? b : a);
  const S1 = [{ key: 'cum', label: '보유세 누계', varName: 's2' }, { key: 'yd', label: '양도세', varName: 's3' }];
  $('#lgSell').innerHTML = legendHTML(S1);
  barChart($('#chartSell'), {
    mode: 'stack', series: S1, aria: '매도 연도별 총 세부담', flagLabel: '최소',
    data: sim.rows.map(r => ({ label: String(r.year), total: r.grand, flag: r.year === best.year, segs: [{ key: 'cum', value: r.cum }, { key: 'yd', value: r.yangdoTotal }] }))
  });
  $('#sellTbody').innerHTML = sim.rows.map(r => `<tr${r.year === best.year ? ' class="hi"' : ''}>
    <td>${r.year} (${scen === 'current' ? '현행' : yangdoParams(r.year, 'reform').label})</td>
    <td>${won(r.cum)}</td><td>${won(r.yangdoTotal)}</td><td class="strong">${won(r.grand)}</td></tr>`).join('');
  const bestRow = best;
  const notes = new Set();
  sim.rows.forEach(r => r.yangdo.notes.forEach(n => notes.add(n)));
  const list = [...notes].map(n => `<li>${esc(n)}</li>`);
  list.unshift(`<li><b>${best.year}년 매도 시 총 세부담이 가장 적습니다</b> — ${won(best.grand)} (양도세 ${won(best.yangdoTotal)}, 보유 ${Math.floor(bestRow.holdY)}년차 · 거주 ${Math.floor(bestRow.liveY)}년 시점).</li>`);
  if (c.inp.houses.length >= 2 && adjYes(sim.house.adjSale)) list.push('<li><b>다주택 중과 완화 시점</b> — 정부안 기준 중과 가산세율은 2027년이 가장 낮고(2주택 +5%p·3주택 +10%p), 2029년 원상복귀(+20/+30%p)합니다.</li>');
  $('#sellNotes').innerHTML = list.join('');
}

/* 8) 증여 */
function giftHTML(c) {
  const g = c.gift;
  const typeL = { general: '일반 증여', spouse_share: '배우자 지분 증여', burden: '부담부증여' }[g.type];
  const relL = { spouse: '배우자', child: '자녀(성년)', minor: '자녀(미성년)', parent: '부모', other: '기타 친족' }[g.relation];
  return `<div class="card">
    <h2>증여 — ${typeL} · ${relL} ${c.inp.gift.value ? '' : estBadge}</h2>
    <p class="hint">${esc(g.house.name)} 지분 ${Math.round(g.share * 100)}%를 ${g.giftYM}에 증여한다고 가정한 총 이전비용입니다.</p>
    <div class="kv"><span>증여재산 평가액 (시가 × 지분)</span><span>${won(g.value)}</span></div>
    ${g.debt > 0 ? `<div class="kv"><span>− 인수 채무 (유상양도 부분)</span><span>−${won(g.debt)}</span></div>` : ''}
    <div class="kv"><span>− 증여재산공제 (${GIFT_REL_LABEL[g.relation]}, 10년 합산)</span><span>−${won(g.gt.deduct)}</span></div>
    ${g.gt.prior > 0 ? `<div class="kv"><span>10년 내 기존 증여 합산</span><span>+${won(g.gt.prior)}</span></div>` : ''}
    <div class="kv"><span>= 과세표준</span><span>${won(g.gt.baseNow)}</span></div>
    <div class="kv"><span>산출세액 − 신고세액공제 3%</span><span>${won(g.gt.tax)}</span></div>
    <div class="kv"><span>증여 취득세${g.at.heavy ? ' <span class="stat chk">12% 중과</span>' : ' (3.5% + 부가세)'}</span><span>${won(g.at.total)}</span></div>
    ${g.atOnerous ? `<div class="kv"><span>유상(채무)분 취득세</span><span>${won(g.atOnerous.total)}</span></div>` : ''}
    ${g.giverYangdo ? `<div class="kv"><span>증여자 양도세 (채무 인수분)</span><span>${won(g.giverYangdo.total)}</span></div>` : ''}
    <div class="kv total"><span>총 이전비용</span><span>${won(g.total)}</span></div>
    <div class="warnbox">${g.warnings.map(w => '· ' + esc(w)).join('<br>')}</div>
  </div>`;
}

/* 9) 취득 */
function acqHTML(c) {
  const a = c.acq;
  return `<div class="card">
    <h2>신규 취득 — 취득세 <span class="stat info">2026 현행 지방세</span></h2>
    <p class="hint">취득세는 지방세여서 8·3 발표(국세)에 포함되지 않았습니다. 2026년 현행 규정으로 계산합니다.</p>
    <div class="kv"><span>적용 세율</span><span>${(a.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%${a.heavy ? ' (다주택 중과)' : ''}</span></div>
    <div class="kv"><span>취득세</span><span>${won(a.main)}</span></div>
    ${a.firstCut > 0 ? `<div class="kv"><span>생애최초 감면</span><span>−${won(a.firstCut)}</span></div>` : ''}
    <div class="kv"><span>지방교육세</span><span>${won(a.edu)}</span></div>
    <div class="kv"><span>농어촌특별세</span><span>${a.rural > 0 ? won(a.rural) : '해당 없음 (85㎡ 이하)'}</span></div>
    <div class="kv total"><span>합계</span><span>${won(a.total)}</span></div>
    <div class="notebox">일시적 2주택으로 표시한 경우 취득세 중과에서 제외해 계산했습니다. 종전주택 처분기한(2026.8.4 이후 취득분 2년 — 정부안)은 양도세·종부세 특례와 함께 매도 섹션에서 안내합니다.</div>
  </div>`;
}

/* 10) 상세 산식 */
function detailHTML(c) {
  return `<div class="card">
    <h2>어떻게 계산했나 — 계산 근거·산식</h2>
    <p class="hint">숫자를 그대로 믿지 말고 한 줄씩 확인하세요. 연도와 시나리오를 바꾸면 어느 항목이 움직이는지 보입니다.</p>
    <div class="seg sm no-print" id="dYears">${c.years.map((y, i) => `<button data-y="${y}" aria-pressed="${i === 2}">${y}</button>`).join('')}</div>
    ${c.pv === 'both' ? `<div class="seg sm no-print" id="dScen" style="margin-top:6px;max-width:280px">
      <button data-v="reform" aria-pressed="true">정부안</button><button data-v="current" aria-pressed="false">현행</button></div>` : ''}
    <div id="dBody"></div>
  </div>`;
}
function kvRow(k, v, cls) { return `<div class="kv${cls ? ' ' + cls : ''}"><span>${k}</span><span>${v}</span></div>`; }
function jongDetailRows(j, title) {
  let h = `<h3 class="steph">${title}</h3>`;
  if (j.pubSum <= j.threshold || j.base <= 0) {
    h += kvRow('공시가격 합계(지분 반영)', won(j.pubSum));
    h += kvRow('과세 기준(기본공제)', won(j.threshold) + ' 초과부터');
    h += kvRow('종합부동산세', '과세 대상 아님', 'total');
    return h;
  }
  h += kvRow('공시가격 합계(지분 반영)', won(j.pubSum));
  h += kvRow('− 기본공제', '−' + won(j.deduct));
  h += kvRow('× 공정시장가액비율', Math.round(j.fair * 100) + '%');
  h += kvRow('= 과세표준', won(j.base));
  h += kvRow('산출세액', won(j.gross));
  h += kvRow('− 공제할 재산세액', '−' + won(j.propCredit));
  if (j.creditRate > 0) h += kvRow(`− 세액공제 (연령+기간 ${Math.round(j.creditRate * 100)}%)`, '−' + won(j.credit));
  if (j.capped > 0) h += kvRow('세부담상한 초과 차감', '−' + won(j.capped));
  h += kvRow('종합부동산세', won(j.tax));
  h += kvRow('+ 농어촌특별세 20%', won(j.rural));
  h += kvRow('종부세 합계', won(j.total), 'total');
  return h;
}
function renderDetailInner(c, year, scen) {
  const rows = scen === 'current' ? c.cur : c.ref;
  const r = rows.find(x => x.year === year) || rows[0];
  let h = '';
  h += `<h3 class="steph">재산세 (물건별 · 2026 현행)</h3>`;
  r.prop.rows.forEach((pr, i) => {
    h += kvRow(`${esc(pr.h.name || '주택 ' + (i + 1))} — 공시 ${eok(pr.pub)} × ${Math.round(pr.pt.fair * 100)}%${pr.pt.useSpec ? ' · 특례세율' : ''}`,
      `본세 ${won(pr.pt.main)} · 도시 ${won(pr.pt.city)} · 교육 ${won(pr.pt.edu)}`);
  });
  h += kvRow('재산세 합계', won(r.prop.total), 'total');
  const j = r.jong;
  if (j.mode === 'joint-compare') {
    j.joint.indiv.forEach(x => { h += jongDetailRows(x.r, `종부세 — ${x.key === 'me' ? '본인' : '배우자'} 개별납부 (${j.label || ''})`.trim()); });
    h += jongDetailRows(j.joint.special, `종부세 — 1세대 1주택 특례 (${j.joint.repKey === 'me' ? '본인' : '배우자'} 명의 신청)`);
    h += kvRow('부부 합산 비교', `개별 ${won(j.joint.indivTotal)} vs 특례 ${won(j.joint.special.total)} → <b>${j.joint.best === 'indiv' ? '개별납부' : '특례'} 유리</b>`, 'total');
  } else {
    j.persons.forEach(p => { h += jongDetailRows(p, `종부세 — ${p.taxpayer === 'spouse' ? '배우자' : '본인'} (${p.label})`); });
    if (!j.persons.length) h += kvRow('종부세', '납세 대상자 없음', 'total');
  }
  h += kvRow('그해 보유세 합계', won(r.holdTax), 'total');
  if (c.sell) {
    const sim = scen === 'current' ? c.sell.cur : c.sell.ref;
    const sr = sim.rows.find(x => x.year === year);
    if (sr) {
      h += `<h3 class="steph">그해 매도 시 양도세 (${sr.yangdo.label})</h3>`;
      h += kvRow('양도가액', won(sr.salePrice));
      h += kvRow('− 취득가액·필요경비', '−' + won((sim.house.acqPrice || 0) * 억 + (c.inp.sell.cost || 0) * 만));
      h += kvRow('= 양도차익', won(sr.yangdo.gain));
      if (sr.yangdo.taxRatio === 0) h += kvRow('양도소득세', '전액 비과세', 'total');
      else {
        if (sr.yangdo.exempt) h += kvRow('과세분 (12억 초과 비율)', Math.round(sr.yangdo.taxRatio * 100) + '%');
        h += kvRow('장기보유특별공제율', Math.round(sr.yangdo.ltcgRate * 100) + '%' + (sr.yangdo.surcharge ? ` · 중과 +${Math.round(sr.yangdo.surcharge * 100)}%p` : ''));
        sr.yangdo.owners.forEach(o => {
          h += kvRow(`${o.key === 'me' ? '본인' : o.key === 'spouse' ? '배우자' : '제3자'} (지분 ${Math.round(o.share * 100)}%) — 과표 ${won(o.base)}`, `세액 ${won(o.tax)} + 지방세 ${won(o.local)}`);
        });
        h += kvRow('양도세 합계', won(sr.yangdo.total), 'total');
      }
    }
  }
  $('#dBody').innerHTML = h;
}

/* 11) 근거·면책 */
function basisHTML(c) {
  const est = c.valid.estimates.map(x => x.msg);
  return `<div class="card">
    <h2>근거와 한계</h2>
    <div class="kv"><span>버전</span><span>${VERSION.current} · 최근 업데이트 ${VERSION.updated.replace(/-/g, '.')}</span></div>
    <div class="kv"><span>규칙 버전</span><span>${RULES.version}</span></div>
    <div class="kv"><span>정책 기준</span><span>2026 현행법(확정) + 8·3 정부안(심의 전)</span></div>
    <div class="kv"><span>계산 실행</span><span>${new Date().toISOString().slice(0, 10)}</span></div>
    <details class="acc"><summary>업데이트 내역</summary><div class="detail-body">
      ${VERSION.log.map(([v, d, t]) => `<div class="kv"><span>${v} · ${d}</span><span style="text-align:left;font-weight:400;white-space:normal">${esc(t)}</span></div>`).join('')}
      <p class="subtle">오류 제보는 확인 후 버전업과 함께 변경 내역으로 공개합니다. 제보자 정보는 동의 없이 노출하지 않습니다.</p>
    </div></details>
    ${est.length ? `<h3 class="mini-h">추정값</h3><ul class="notes">${est.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    <h3 class="mini-h">출처</h3>
    <ul class="notes">${RULES.sources.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <div class="warnbox"><b>참고용 안내</b> — 본 시뮬레이터는 공개된 법령·정부 발표와 사용자가 입력한 정보를 바탕으로 한 <b>참고용 계산 도구</b>입니다. 정부안은 국회 심의 및 최종 법령에 따라 변경될 수 있으며, 실제 세액은 개인별 사실관계에 따라 달라질 수 있습니다. 신고·매도·증여·명의 변경 등 중요한 의사결정 전에는 세무전문가에게 확인하시기 바랍니다.</div>
    <div class="chiprow no-print" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn" id="btnEdit">입력 수정하기</button>
      <button class="btn" id="btnPrint">결과 인쇄·PDF 저장</button>
      <button class="btn ghost" id="btnReset">처음부터 다시</button>
    </div>
  </div>`;
}

function wireReport(c) {
  // 비교 차트
  const showCur = c.pv !== 'reform', showRef = c.pv !== 'current';
  const series = [];
  if (showRef) series.push({ key: 'r', label: '정부안 (8·3)', varName: 's1' });
  if (showCur) series.push({ key: 'c', label: '현행 유지', varName: 's2' });
  $('#lgCmp').innerHTML = legendHTML(series);
  barChart($('#chartCmp'), {
    mode: 'group', series, aria: '현행과 정부안 연도별 보유세 비교',
    data: c.years.map((y, i) => {
      const segs = [];
      if (showRef) segs.push({ key: 'r', value: c.ref[i].holdTax });
      if (showCur) segs.push({ key: 'c', value: c.cur[i].holdTax });
      return { label: String(y), total: Math.max(...segs.map(s => s.value)), segs };
    })
  });
  // 매도
  let sellScenCur = c.pv === 'current' ? 'current' : 'reform';
  if (c.sell) {
    renderSellInner(c, sellScenCur);
    const seg = $('#sellScen');
    if (seg) $$('button', seg).forEach(b => b.addEventListener('click', () => {
      sellScenCur = b.dataset.v;
      $$('button', seg).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      renderSellInner(c, sellScenCur);
    }));
  }
  // 결과 심층 분석 — 같은 페이지에서 펼침/접기 (입력·결과 값 유지)
  const iBtn = $('#insightBtn'), iWrap = $('#insightWrap');
  if (iBtn && iWrap) iBtn.addEventListener('click', () => {
    const opening = iWrap.hidden;
    iWrap.hidden = !opening;
    if (opening) {
      track('insight_open', true);
      iBtn.innerHTML = '결과 심층 분석 접기 ↑';
      if (c.sell) renderSellInner(c, sellScenCur); // 숨김 중 그려진 차트 폭 보정 (값 변화 없음)
      iWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      iBtn.innerHTML = '결과 심층 분석 보기 ↓<span class="sm">왜 달라지나 · 과세 전환점 · 민감도 · 공동명의 · 계산 근거</span>';
    }
  });
  // 상세
  let dY = c.years[2], dS = c.pv === 'current' ? 'current' : 'reform';
  renderDetailInner(c, dY, dS);
  $$('#dYears button').forEach(b => b.addEventListener('click', () => {
    dY = +b.dataset.y;
    $$('#dYears button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderDetailInner(c, dY, dS);
  }));
  const dScen = $('#dScen');
  if (dScen) $$('button', dScen).forEach(b => b.addEventListener('click', () => {
    dS = b.dataset.v;
    $$('button', dScen).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderDetailInner(c, dY, dS);
  }));
  // 액션
  $('#btnEdit').addEventListener('click', () => go(6));
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnReset').addEventListener('click', () => {
    if (confirm('입력을 모두 지우고 처음부터 시작할까요?')) {
      localStorage.removeItem(STORE);
      S = { step: 1, inp: defaultInput() };
      go(1);
    }
  });
}

/* =====================================================================
   이벤트 배선
   ===================================================================== */
function wire() {
  $('#btnNext').addEventListener('click', () => {
    if (S.step === 7) { go(6); return; }
    const msg = validateStep(S.step);
    if (msg) {
      const el = $('#navMsg');
      el.textContent = msg; el.style.display = 'block';
      return;
    }
    go(S.step + 1);
  });
  $('#btnPrev').addEventListener('click', () => go(S.step - 1));
  $('#stepper').addEventListener('click', e => {
    const b = e.target.closest('.st');
    if (b && !b.disabled) go(+b.dataset.st);
  });

  // 비식별 이벤트: CTA·외부 링크 클릭 (이벤트명만 기록)
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-ev]');
    if (a) track(a.dataset.ev);
  });

  // STEP 1
  $('#sitCards').addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (!b) return;
    track('simulation_start', true);
    S.inp.situation = b.dataset.sit;
    seedHouses(b.dataset.sit);
    renderStep1(); save();
  });
  $$('#step1 [data-right]').forEach(c => c.addEventListener('change', () => {
    S.inp.rights[c.dataset.right] = c.checked; save();
  }));

  // STEP 2 — 위임
  const hc = $('#houseCards');
  hc.addEventListener('input', e => {
    const t = e.target;
    const i = +t.dataset.h;
    if (isNaN(i) || !S.inp.houses[i]) return;
    const h = S.inp.houses[i];
    if (t.dataset.k) {
      if (t.type === 'checkbox') h[t.dataset.k] = t.checked;
      else h[t.dataset.k] = t.value;
      if (t.dataset.k === 'official' || t.dataset.k === 'market') {
        const card = t.closest('.hcard');
        const p = card && card.querySelector('.subtle');
        if (p) {
          const v = num(t.value);
          p.innerHTML = h.priceMode === 'market'
            ? (v > 0 ? `공시가격 추정 ≈ <b>${(v * 0.69).toFixed(2).replace(/\.?0+$/, '')}억원</b> (시세 × 69%, 2026 공동주택 참고값)` : '시세 × 69%를 공시가격으로 추정합니다')
            : (v > 0 ? `시세 환산 참고 ≈ ${(v / 0.69).toFixed(1)}억원` : '부동산공시가격알리미의 공시가격을 입력하세요');
        }
      }
    }
    if (t.dataset.flag) h.flags[t.dataset.flag] = t.checked;
    save();
  });
  hc.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.adj !== undefined && t.dataset.v) {
      const h = S.inp.houses[+t.dataset.h];
      h[t.dataset.adj] = t.dataset.v;
      renderStep2(); save(); return;
    }
    if (t.dataset.pmode) {
      const h = S.inp.houses[+t.dataset.h];
      h.priceMode = t.dataset.pmode;
      renderStep2(); save(); return;
    }
    if (t.dataset.dup !== undefined) {
      if (S.inp.houses.length >= 6) return;
      const src = S.inp.houses[+t.dataset.dup];
      const cp = JSON.parse(JSON.stringify(src));
      cp.id = newHouse().id;
      cp.name = (src.name || '주택') + ' 사본';
      cp.liveMode = 'none';
      S.inp.houses.splice(+t.dataset.dup + 1, 0, cp);
      renderStep2(); save(); return;
    }
    if (t.dataset.del !== undefined) {
      S.inp.houses.splice(+t.dataset.del, 1);
      renderStep2(); save(); return;
    }
  });
  $('#addHouse').addEventListener('click', () => {
    if (S.inp.houses.length >= 6) return;
    S.inp.houses.push(newHouse());
    renderStep2(); save();
  });

  // STEP 3 — 위임
  $('#ageMe').addEventListener('input', e => { S.inp.people.me.age = e.target.value; save(); });
  $('#ageSpouse').addEventListener('input', e => { S.inp.people.spouse.age = e.target.value; save(); });
  const oc = $('#ownCards');
  oc.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    const i = +t.dataset.h;
    const h = S.inp.houses[i];
    if (!h) return;
    if (t.dataset.own) {
      h.ownerType = t.dataset.own;
      if (t.dataset.own === 'me') h.shares = { me: 100, spouse: 0, other: 0 };
      if (t.dataset.own === 'spouse') h.shares = { me: 0, spouse: 100, other: 0 };
      if (t.dataset.own === 'joint') h.shares = { me: 50, spouse: 50, other: 0 };
      if (t.dataset.own === 'other') h.shares = { me: 50, spouse: 0, other: 50 };
      renderStep3(); save(); return;
    }
    if (t.dataset.live) {
      h.liveMode = t.dataset.live;
      renderStep3(); save(); return;
    }
    if (t.dataset.ppadd) {
      h.pastPeriods = h.pastPeriods || [];
      h.pastPeriods.push({ from: '', to: '' });
      renderStep3(); save(); return;
    }
    if (t.dataset.ppdel !== undefined) {
      h.pastPeriods.splice(+t.dataset.ppdel, 1);
      renderStep3(); save(); return;
    }
  });
  oc.addEventListener('input', e => {
    const t = e.target;
    const i = +t.dataset.h;
    const h = S.inp.houses[i];
    if (!h) return;
    if (t.dataset.share) {
      h.shares[t.dataset.share] = t.value;
      if (h.ownerType === 'joint' && t.dataset.share === 'me') {
        h.shares.spouse = Math.max(0, 100 - num(t.value));
        const sp = oc.querySelector(`input[data-h="${i}"][data-share="spouse"]`);
        if (sp) sp.value = h.shares.spouse;
      }
      save(); return;
    }
    if (t.dataset.pp !== undefined && t.dataset.ppk) {
      h.pastPeriods[+t.dataset.pp][t.dataset.ppk] = t.value;
      save(); return;
    }
    if (t.dataset.k) { h[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; save(); }
  });
  oc.addEventListener('change', e => {
    const t = e.target;
    if (t.tagName === 'SELECT' && t.dataset.k) {
      const h = S.inp.houses[+t.dataset.h];
      if (h) { h[t.dataset.k] = t.value; save(); }
    }
  });

  // STEP 4
  $('#purposeCards').addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (!b || b.dataset.fixed) return;
    const p = b.dataset.pp;
    const idx = S.inp.purposes.indexOf(p);
    if (idx >= 0) S.inp.purposes.splice(idx, 1);
    else S.inp.purposes.push(p);
    renderStep4(); save();
  });
  const bind = (id, path, opt = {}) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener(opt.evt || 'input', () => {
      const keys = path.split('.');
      let o = S.inp;
      for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
      o[keys[keys.length - 1]] = el.type === 'checkbox' ? el.checked : el.value;
      if (opt.out) $(opt.out).textContent = el.value + (opt.suffix || '');
      if (opt.after) opt.after();
      save();
    });
  };
  bind('#sellHouse', 'sell.houseId', { evt: 'change' });
  bind('#sellDate', 'sell.date');
  bind('#sellPrice', 'sell.price');
  bind('#sellCost', 'sell.cost');
  bind('#sellSameYear', 'sell.sameYearOther', { evt: 'change' });
  bind('#sellSenior', 'sell.seniorMove', { evt: 'change' });
  bind('#acqPrice2', 'acquire.price');
  bind('#acqHouses2', 'acquire.housesAfter', { evt: 'change' });
  bind('#acqAdj2', 'acquire.adj', { evt: 'change' });
  bind('#acqBig2', 'acquire.big85', { evt: 'change' });
  bind('#acqTemp2', 'acquire.temp2', { evt: 'change' });
  bind('#acqFirst2', 'acquire.first', { evt: 'change' });
  bind('#jointHouse', 'joint.houseId', { evt: 'change' });
  bind('#jointShare', 'joint.share', { out: '#jointShareOut', suffix: '%' });
  bind('#jointPrior', 'joint.prior');
  $$('#giftType button').forEach(b => b.addEventListener('click', () => {
    S.inp.gift.type = b.dataset.v;
    if (b.dataset.v === 'spouse_share') { S.inp.gift.relation = 'spouse'; if (num(S.inp.gift.share) === 100) S.inp.gift.share = 50; }
    renderStep4(); save();
  }));
  bind('#giftHouse', 'gift.houseId', { evt: 'change', after: () => renderStep4() });
  bind('#giftRel', 'gift.relation', { evt: 'change' });
  bind('#giftShare', 'gift.share');
  bind('#giftValue', 'gift.value');
  bind('#giftDebt', 'gift.debt');
  bind('#giftPrior', 'gift.prior');
  bind('#giftDate', 'gift.date');

  // STEP 5
  $$('#policyView button').forEach(b => b.addEventListener('click', () => {
    S.inp.assumptions.policyView = b.dataset.v;
    renderStep5(); save();
  }));
  bind('#gMarket', 'assumptions.marketGrowth', { out: '#gMarketOut', suffix: '%' });
  bind('#gOfficial', 'assumptions.officialGrowth', { out: '#gOfficialOut', suffix: '%' });
  bind('#optUrban', 'assumptions.urban', { evt: 'change' });

  // STEP 6 — 수정 점프
  $('#confirmSummary').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (b) go(+b.dataset.goto);
  });

  // 테마
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    $('#themeBtn').textContent = next === 'dark' ? '라이트' : '다크';
    try { localStorage.setItem('taxdx_theme', next); } catch (e) { }
    if (S.step === 7) renderReport();
  });
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (S.step === 7) renderReport(); }, 180);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const th = localStorage.getItem('taxdx_theme');
    if (th) {
      document.documentElement.dataset.theme = th;
      $('#themeBtn').textContent = th === 'dark' ? '라이트' : '다크';
    }
  } catch (e) { }
  // 버전·업데이트 내역 (footer)
  $('#verLine').textContent = `버전 ${VERSION.current} · 최근 업데이트 ${VERSION.updated.replace(/-/g, '.')}`;
  $('#verLog').innerHTML = VERSION.log.map(([v, d, t]) => `<li><b>${v}</b> (${d}) — ${esc(t)}</li>`).join('');
  wire();
  renderAll();
});
