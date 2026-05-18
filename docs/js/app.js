/**
 * app.js — Main application coordinator
 */
import { initMediaPipe, extractPoses, analyzePose, comparePhases,
         makePoseCanvas, makeComparisonCanvas } from './pose.js';
import { getInterpretation, generateCoaching, generateRecs,
         METRIC_NAME, METRIC_UNIT, DISPLAY_ORDER } from './coaching.js';
import { generateCSV, generateMarkdown, downloadText } from './report.js';

// ── State ─────────────────────────────────────────────────────────────────────

const S = {
  mode: 'solo',
  stroke: 'forehand',
  dominantHand: 'right',
  userPoses: null,   // array of poseEntry
  proPoses:  null,
  userPhaseIdx: { ready: 0, takeback: 0, impact: 0, followthrough: 0 },
  proPhaseIdx:  { ready: 0, takeback: 0, impact: 0, followthrough: 0 },
  userAnalysis: null,
  proAnalysis:  null,
  comparison:   null,
  coaching: [],
  recs: [],
  lastResult: null,
};

const PHASES = ['ready','takeback','impact','followthrough'];
const PHASE_KO = { ready:'레디 포지션', takeback:'테이크백', impact:'임팩트', followthrough:'팔로스루' };

// ── Boot ──────────────────────────────────────────────────────────────────────

(async () => {
  setupTabs();
  setupSettings();
  setupDropZones();
  setupProcessBtn();
  setupAnalyzeBtn();
  setupReportBtns();
  await initMediaPipe(msg => setStatus(msg));
})();

// ── Tabs ──────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-pane').forEach(p =>
        p.classList.toggle('active', p.id === `tab-${tab}`));
    });
  });
}

function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${id}`));
}

// ── Settings ──────────────────────────────────────────────────────────────────

function setupSettings() {
  const toggle = document.getElementById('settings-toggle');
  const panel  = document.getElementById('settings-panel');
  toggle.addEventListener('click', () => panel.classList.toggle('open'));

  const selMode = document.getElementById('sel-mode');
  const proCard = document.getElementById('pro-card');
  selMode.addEventListener('change', () => {
    S.mode = selMode.value;
    proCard.style.display = S.mode === 'comparison' ? '' : 'none';
  });

  document.getElementById('sel-stroke').addEventListener('change', e => S.stroke = e.target.value);
  document.getElementById('sel-hand').addEventListener('change',   e => S.dominantHand = e.target.value);

  const selCam  = document.getElementById('sel-camera');
  const warnBar = document.getElementById('camera-warn');
  selCam.addEventListener('change', () => {
    warnBar.style.display = selCam.value === 'front' ? '' : 'none';
  });
}

// ── Drop Zones ────────────────────────────────────────────────────────────────

function setupDropZones() {
  bindDrop('user-drop', 'user-file', 'user-video', () => updateProcessBtn());
  bindDrop('pro-drop',  'pro-file',  'pro-video',  () => updateProcessBtn());
}

function bindDrop(zoneId, inputId, videoId, onChange) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const video = document.getElementById(videoId);

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) loadVideo(input.files[0], video, onChange); });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) loadVideo(f, video, onChange);
  });
}

function loadVideo(file, videoEl, onChange) {
  videoEl.src = URL.createObjectURL(file);
  videoEl.classList.add('visible');
  videoEl.load();
  onChange?.();
}

function updateProcessBtn() {
  const userFile = document.getElementById('user-file');
  const proFile  = document.getElementById('pro-file');
  const btn      = document.getElementById('process-btn');
  const needPro  = S.mode === 'comparison';
  btn.disabled   = !(userFile.files[0] && (!needPro || proFile.files[0]));
}

// ── Process ───────────────────────────────────────────────────────────────────

function setupProcessBtn() {
  document.getElementById('process-btn').addEventListener('click', runProcess);
}

async function runProcess() {
  const btn = document.getElementById('process-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 처리 중…';

  const progWrap = document.getElementById('process-progress');
  const progFill = document.getElementById('prog-fill');
  const progLbl  = document.getElementById('progress-label');
  progWrap.style.display = '';

  const NUM = 12;
  const userVideo = document.getElementById('user-video');
  const proVideo  = document.getElementById('pro-video');

  try {
    setStatus('나의 영상 분석 중…');
    S.userPoses = await extractPoses(userVideo, NUM, pct => {
      progFill.style.width = `${pct * (S.mode === 'comparison' ? 0.5 : 1)}%`;
      progLbl.textContent  = `나의 영상 처리 중… ${pct}%`;
    });

    if (S.mode === 'comparison') {
      setStatus('롤모델 영상 분석 중…');
      S.proPoses = await extractPoses(proVideo, NUM, pct => {
        progFill.style.width = `${50 + pct * 0.5}%`;
        progLbl.textContent  = `롤모델 영상 처리 중… ${pct}%`;
      });
    }

    initDefaultPhaseIdx();
    buildFrameSelectors();
    progWrap.style.display = 'none';
    btn.innerHTML = '✅ 처리 완료';
    switchTab('frames');
    setStatus('프레임 선택 후 분석을 시작하세요.');
  } catch (err) {
    console.error(err);
    setStatus('오류: ' + err.message);
    btn.disabled  = false;
    btn.innerHTML = '🔍 영상 처리 시작';
    progWrap.style.display = 'none';
  }
}

// ── Frame Selectors ───────────────────────────────────────────────────────────

function initDefaultPhaseIdx() {
  const n = S.userPoses.length - 1;
  S.userPhaseIdx = {
    ready: 0,
    takeback: Math.round(n * 0.25),
    impact:   Math.round(n * 0.6),
    followthrough: n,
  };
  if (S.proPoses) {
    const pn = S.proPoses.length - 1;
    S.proPhaseIdx = {
      ready: 0,
      takeback: Math.round(pn * 0.25),
      impact:   Math.round(pn * 0.6),
      followthrough: pn,
    };
  }
}

function buildFrameSelectors() {
  const wrap  = document.getElementById('phase-selectors');
  const ph_ph = document.getElementById('frames-ph');
  const body  = document.getElementById('frames-body');
  ph_ph.style.display = 'none';
  body.style.display  = '';
  wrap.innerHTML = '';

  PHASES.forEach(ph => {
    const section = document.createElement('div');
    section.className = 'phase-section';

    const title = document.createElement('div');
    title.className = 'phase-title';
    title.textContent = PHASE_KO[ph];
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'phase-grid';

    // User column
    grid.appendChild(makeSliderCol(
      `user-${ph}`, '나의 스윙', S.userPoses, S.userPhaseIdx[ph],
      idx => { S.userPhaseIdx[ph] = idx; }
    ));

    // Pro column (comparison mode only)
    if (S.mode === 'comparison' && S.proPoses) {
      grid.appendChild(makeSliderCol(
        `pro-${ph}`, '롤모델', S.proPoses, S.proPhaseIdx[ph],
        idx => { S.proPhaseIdx[ph] = idx; }
      ));
    }

    section.appendChild(grid);
    wrap.appendChild(section);
  });
}

function makeSliderCol(id, label, poses, defaultIdx, onChange) {
  const col = document.createElement('div');
  col.className = 'fsel-col';

  const h4 = document.createElement('h4');
  h4.textContent = label;
  col.appendChild(h4);

  const row = document.createElement('div');
  row.className = 'fsel-slider-row';

  const slider = document.createElement('input');
  slider.type  = 'range';
  slider.min   = 0;
  slider.max   = poses.length - 1;
  slider.value = defaultIdx;
  slider.id    = `slider-${id}`;

  const numLbl = document.createElement('span');
  numLbl.className = 'frame-num';
  numLbl.textContent = `#${defaultIdx + 1} / ${poses.length}`;

  row.appendChild(slider);
  row.appendChild(numLbl);
  col.appendChild(row);

  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'frame-canvas';
  wrap.appendChild(canvas);

  const badge = document.createElement('div');
  badge.className = 'vis-badge';
  wrap.appendChild(badge);
  col.appendChild(wrap);

  function render(idx) {
    const entry = poses[idx];
    const c = makePoseCanvas(entry, '#00cc55', `프레임 ${idx + 1}`);
    if (c) {
      canvas.width  = c.width;
      canvas.height = c.height;
      canvas.getContext('2d').drawImage(c, 0, 0);
    }
    const vis = Math.round((entry?.meanVisibility ?? 0) * 100);
    badge.textContent = `신뢰도 ${vis}%`;
    badge.className   = `vis-badge ${entry?.isReliable ? 'vis-good' : 'vis-low'}`;
    numLbl.textContent = `#${idx + 1} / ${poses.length}`;
    onChange(idx);
  }

  render(defaultIdx);
  slider.addEventListener('input', () => render(+slider.value));
  return col;
}

// ── Analyze ───────────────────────────────────────────────────────────────────

function setupAnalyzeBtn() {
  document.getElementById('analyze-btn').addEventListener('click', runAnalysis);
}

function runAnalysis() {
  const hand = S.dominantHand;

  S.userAnalysis = {};
  PHASES.forEach(ph => {
    const entry = S.userPoses[S.userPhaseIdx[ph]];
    S.userAnalysis[ph] = analyzePose(entry, hand);
  });

  if (S.mode === 'comparison' && S.proPoses) {
    S.proAnalysis = {};
    PHASES.forEach(ph => {
      const entry = S.proPoses[S.proPhaseIdx[ph]];
      S.proAnalysis[ph] = analyzePose(entry, hand);
    });
    S.comparison = comparePhases(S.userAnalysis, S.proAnalysis);
    S.coaching   = generateCoaching(S.comparison.topDifferences);
    S.recs       = generateRecs(S.comparison.topDifferences);
  } else {
    S.proAnalysis = null;
    S.comparison  = null;
    S.coaching    = [];
    S.recs        = [];
  }

  S.lastResult = {
    userAnalysis: S.userAnalysis, proAnalysis: S.proAnalysis,
    comparison: S.comparison, stroke: S.stroke, dominantHand: hand,
  };

  renderResults();
  switchTab('results');
  enableReport();
}

// ── Results Rendering ─────────────────────────────────────────────────────────

function renderResults() {
  const ph  = document.getElementById('results-ph');
  const body = document.getElementById('results-body');
  ph.style.display   = 'none';
  body.style.display = '';
  body.innerHTML = '';

  const isComp = S.mode === 'comparison' && S.comparison;

  // ── Top row: score + phase chart
  const top = document.createElement('div');
  top.className = 'results-top';
  body.appendChild(top);

  if (isComp) {
    top.appendChild(makeScoreBox(S.comparison.overallSimilarity));
    top.appendChild(makePhaseChart(S.comparison.phaseSimilarities));
  } else {
    // Solo: just a header
    const hdr = document.createElement('div');
    hdr.className = 'section-card';
    hdr.innerHTML = `<div class="section-title">🏃 단독 자세 분석 결과</div>
      <p style="font-size:.88rem;color:#555">각 단계별 지표를 확인하고 코칭 메시지를 참고하세요.</p>`;
    top.appendChild(hdr);
  }

  // ── Coaching cards
  if (S.coaching.length || S.recs.length) {
    const grid = document.createElement('div');
    grid.className = 'coaching-grid';
    body.appendChild(grid);

    if (S.coaching.length) grid.appendChild(makeListCard('🎯 주요 코칭 포인트', S.coaching, 'tip-item'));
    if (S.recs.length)     grid.appendChild(makeListCard('💡 개선 권고사항',   S.recs,     'rec-item'));
  }

  // ── Phase accordions
  PHASES.forEach(ph => {
    const userAn = S.userAnalysis[ph];
    if (!userAn) return;
    const phComp = S.comparison?.phases[ph];
    body.appendChild(makePhaseAccordion(ph, userAn, phComp));
  });
}

function makeScoreBox(sim) {
  const score = Math.round(sim);
  const grade = score >= 90 ? '🏆 매우 우수' : score >= 75 ? '⭐ 우수'
              : score >= 60 ? '👍 양호' : score >= 45 ? '📈 보통' : '💪 개선 필요';
  const div = document.createElement('div');
  div.className = 'score-box';
  div.innerHTML = `<div class="score-label">롤모델과의 유사도</div>
    <div class="score-num">${score}<span class="score-denom"> / 100</span></div>
    <div class="score-grade">${grade}</div>`;
  return div;
}

function makePhaseChart(phaseSims) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = '<div class="chart-title">단계별 유사도</div>';
  Object.entries(phaseSims).forEach(([ph, sim]) => {
    const s = Math.round(sim);
    const color = s >= 75 ? '#27ae60' : s >= 55 ? '#f9a825' : '#e53935';
    card.innerHTML += `
      <div class="pbar-row">
        <div class="pbar-label">${ph}</div>
        <div class="pbar-track"><div class="pbar-fill" style="width:${s}%;background:${color}"></div></div>
        <div class="pbar-score">${s}%</div>
      </div>`;
  });
  return card;
}

function makeListCard(title, items, itemClass) {
  const card = document.createElement('div');
  card.className = 'section-card';
  card.innerHTML = `<div class="section-title">${title}</div>` +
    items.map(t => `<div class="${itemClass}">${t}</div>`).join('');
  return card;
}

function makePhaseAccordion(ph, userAn, phComp) {
  const wrap = document.createElement('div');
  wrap.className = 'phase-result';

  const hdr = document.createElement('div');
  hdr.className = 'phase-hdr';
  const simBadge = phComp ? `<span class="phase-hdr-badge">${Math.round(phComp.similarity)}%</span>` : '';
  hdr.innerHTML = `<span class="phase-hdr-label">${PHASE_KO[ph]}</span>
    <div style="display:flex;align-items:center;gap:6px">
      ${simBadge}<span class="phase-toggle">▼</span>
    </div>`;

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'phase-body';

  // Comparison canvas
  if (phComp && S.userPoses && S.proPoses) {
    const userEntry = S.userPoses[S.userPhaseIdx[ph]];
    const proEntry  = S.proPoses[S.proPhaseIdx[ph]];
    const cc = makeComparisonCanvas(userEntry, proEntry);
    if (cc) {
      const wrap2 = document.createElement('div');
      wrap2.className = 'compare-wrap';
      wrap2.appendChild(cc);
      bodyDiv.appendChild(wrap2);
      const cap = document.createElement('p');
      cap.className = 'img-caption';
      cap.textContent = '나의 스윙 (주황) · 롤모델 (파랑)';
      bodyDiv.appendChild(cap);
    }
  } else if (S.userPoses) {
    const userEntry = S.userPoses[S.userPhaseIdx[ph]];
    const pc = makePoseCanvas(userEntry, '#00cc55', '나의 스윙');
    if (pc) {
      const wrap2 = document.createElement('div');
      wrap2.className = 'compare-wrap';
      wrap2.appendChild(pc);
      bodyDiv.appendChild(wrap2);
    }
  }

  // Metric cards
  DISPLAY_ORDER.forEach(mk => {
    const uv = userAn[mk];
    if (uv == null) return;
    const interp = getInterpretation(mk, uv, ph);
    const pv = phComp?.comparison[mk];
    bodyDiv.appendChild(makeMetricCard(mk, uv, interp, pv));
  });

  // Toggle
  hdr.addEventListener('click', () => {
    bodyDiv.classList.toggle('open');
    hdr.querySelector('.phase-toggle').textContent =
      bodyDiv.classList.contains('open') ? '▲' : '▼';
  });

  wrap.appendChild(hdr);
  wrap.appendChild(bodyDiv);
  return wrap;
}

function makeMetricCard(mk, uv, interp, pv) {
  const div = document.createElement('div');
  div.className = 'metric-row';

  const unit = METRIC_UNIT[mk] ? ` ${METRIC_UNIT[mk]}` : '';
  const fmtU = uv.toFixed(1) + unit;

  let compHtml = '';
  if (pv && pv.pv != null) {
    const fmtP = pv.pv.toFixed(1) + unit;
    const diff  = pv.diff != null ? pv.diff.toFixed(1) : '-';
    compHtml = `
      <div class="mv-box"><div class="mv-lbl">롤모델</div><div class="mv-num pro">${fmtP}</div></div>
      <div class="mv-box"><div class="mv-lbl">차이</div><div class="mv-num diff">Δ${diff}</div></div>`;
  }

  const ibClass = { good:'ib-good', caution:'ib-caution', bad:'ib-bad', info:'ib-info' }[interp.status] || 'ib-info';

  div.innerHTML = `
    <div class="metric-title">${interp.icon} ${METRIC_NAME[mk] || mk}</div>
    <div class="metric-vals">
      <div class="mv-box">
        <div class="mv-lbl">나의 값</div>
        <div class="mv-num">${fmtU}</div>
      </div>${compHtml}
    </div>
    <span class="interp-badge ${ibClass}">${interp.message}</span>`;
  return div;
}

// ── Report ────────────────────────────────────────────────────────────────────

function enableReport() {
  const ph   = document.getElementById('report-ph');
  const body = document.getElementById('report-body');
  ph.style.display   = 'none';
  body.style.display = '';

  const prev = document.getElementById('report-preview');
  const md   = generateMarkdown(S.lastResult, S.coaching, S.recs, S.mode);
  prev.textContent = md;
}

function setupReportBtns() {
  document.getElementById('dl-csv').addEventListener('click', () => {
    if (!S.lastResult) return;
    const csv = generateCSV(S.lastResult, S.mode);
    downloadText(csv, 'tennis_analysis.csv', 'text/csv;charset=utf-8');
  });
  document.getElementById('dl-md').addEventListener('click', () => {
    if (!S.lastResult) return;
    const md = generateMarkdown(S.lastResult, S.coaching, S.recs, S.mode);
    downloadText(md, 'tennis_analysis.md', 'text/markdown;charset=utf-8');
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg) {
  const appStatus = document.getElementById('app-status');
  if (appStatus) appStatus.textContent = msg;
  const progLabel = document.getElementById('progress-label');
  if (progLabel) progLabel.textContent = msg;
}
