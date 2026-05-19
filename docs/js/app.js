/**
 * app.js — Main application coordinator
 */
import { initMediaPipe, extractPoses, analyzePose, comparePhases,
         makePoseCanvas, makeComparisonCanvas, analyzeTrajectory } from './pose.js';
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
  userTrajectory: null,
  proTrajectory:  null,
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
  const userVideo = document.getElementById('user-video');
  const proVideo  = document.getElementById('pro-video');
  const userDuration = userVideo && !isNaN(userVideo.duration) && userVideo.duration > 0 ? userVideo.duration : 1.2;
  const proDuration = proVideo && !isNaN(proVideo.duration) && proVideo.duration > 0 ? proVideo.duration : 1.2;

  S.userAnalysis = {};
  PHASES.forEach(ph => {
    const entry = S.userPoses[S.userPhaseIdx[ph]];
    S.userAnalysis[ph] = analyzePose(entry, hand);
  });

  S.userTrajectory = analyzeTrajectory(S.userPoses, hand, userDuration);

  if (S.mode === 'comparison' && S.proPoses) {
    S.proAnalysis = {};
    PHASES.forEach(ph => {
      const entry = S.proPoses[S.proPhaseIdx[ph]];
      S.proAnalysis[ph] = analyzePose(entry, hand);
    });
    S.comparison = comparePhases(S.userAnalysis, S.proAnalysis);
    S.coaching   = generateCoaching(S.comparison.topDifferences);
    S.recs       = generateRecs(S.comparison.topDifferences);
    S.proTrajectory  = analyzeTrajectory(S.proPoses, hand, proDuration);
  } else {
    S.proAnalysis = null;
    S.comparison  = null;
    S.proTrajectory  = null;
    S.coaching    = [];
    S.recs        = [];
  }

  S.lastResult = {
    userAnalysis: S.userAnalysis, proAnalysis: S.proAnalysis,
    comparison: S.comparison, stroke: S.stroke, dominantHand: hand,
    userTrajectory: S.userTrajectory, proTrajectory: S.proTrajectory,
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

  // ── Option A: Swing Trajectory & Speed Analysis Card
  if (S.userTrajectory) {
    const trajCard = document.createElement('div');
    trajCard.className = 'section-card trajectory-card';
    trajCard.style.padding = '20px';
    trajCard.style.marginBottom = '20px';
    trajCard.innerHTML = `
      <div class="section-title">📈 스윙 궤적 및 속도 정밀 분석 (Option A)</div>
      <p style="font-size:.85rem;color:#666;margin-bottom:18px">
        전체 12개 스윙 프레임에서 손목의 공간 좌표 Trail과 프레임 간 속도 변화(템포)를 프로 선수와 겹쳐서 비교 분석합니다.
      </p>
    `;

    const trajGrid = document.createElement('div');
    trajGrid.className = 'traj-visual-grid';
    trajGrid.style.display = 'grid';
    trajGrid.style.gridTemplateColumns = window.innerWidth > 768 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr';
    trajGrid.style.gap = '20px';

    // 1. User Trajectory Col
    const userCol = document.createElement('div');
    userCol.style.display = 'flex';
    userCol.style.flexDirection = 'column';
    userCol.style.gap = '6px';
    userCol.innerHTML = `<span style="font-size:.88rem;font-weight:bold;color:#444">🎾 나의 스윙 궤적 (Trail)</span>`;
    const userCanvas = document.createElement('canvas');
    userCanvas.style.width = '100%';
    userCanvas.style.borderRadius = '8px';
    userCanvas.style.backgroundColor = '#000';
    userCol.appendChild(userCanvas);
    trajGrid.appendChild(userCol);

    // 2. Pro Trajectory Col (Only in comparison mode)
    if (isComp && S.proTrajectory) {
      const proCol = document.createElement('div');
      proCol.style.display = 'flex';
      proCol.style.flexDirection = 'column';
      proCol.style.gap = '6px';
      proCol.innerHTML = `<span style="font-size:.88rem;font-weight:bold;color:#444">⭐ 롤모델 스윙 궤적 (Trail)</span>`;
      const proCanvas = document.createElement('canvas');
      proCanvas.style.width = '100%';
      proCanvas.style.borderRadius = '8px';
      proCanvas.style.backgroundColor = '#000';
      proCol.appendChild(proCanvas);
      trajGrid.appendChild(proCol);

      setTimeout(() => {
        drawTrajectoryCanvas(proCanvas, S.proPoses, S.proTrajectory, '#0078d4', '롤모델');
      }, 50);
    }

    // 3. Speed Profile Chart Col
    const speedCol = document.createElement('div');
    speedCol.style.display = 'flex';
    speedCol.style.flexDirection = 'column';
    speedCol.style.gap = '6px';
    speedCol.innerHTML = `<span style="font-size:.88rem;font-weight:bold;color:#444">⚡ 스윙 속도 프로파일 (템포 분석)</span>`;
    const speedCanvas = document.createElement('canvas');
    speedCanvas.style.width = '100%';
    speedCanvas.style.height = '240px';
    speedCanvas.style.borderRadius = '8px';
    speedCol.appendChild(speedCanvas);
    trajGrid.appendChild(speedCol);

    trajCard.appendChild(trajGrid);
    body.appendChild(trajCard);

    // Deferred drawing to allow layouts to resolve widths
    setTimeout(() => {
      drawTrajectoryCanvas(userCanvas, S.userPoses, S.userTrajectory, '#ff8c00', '나의 스윙');
      drawSpeedChart(speedCanvas, S.userTrajectory, S.proTrajectory);
    }, 50);
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

// ── Trajectory & Chart Helpers ────────────────────────────────────────────────

function drawTrajectoryCanvas(canvas, poses, trajectory, jointColor, label) {
  if (!trajectory || !poses || poses.length === 0) return;
  const impactIdx = S.userPhaseIdx?.impact ?? 0;
  const entry = poses[impactIdx] || poses[Math.round(poses.length / 2)] || poses[0];
  const src = entry?.thumb;
  if (!src) return;

  canvas.width = src.width || 520;
  canvas.height = src.height || 360;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0);

  const pts = trajectory.points;
  if (pts.length < 2) return;

  // 1. Draw glowing swing path line
  ctx.shadowBlur = 10;
  ctx.shadowColor = jointColor;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = jointColor;

  ctx.beginPath();
  let first = true;
  pts.forEach(p => {
    if (p) {
      const px = p.x * canvas.width;
      const py = p.y * canvas.height;
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
  });
  ctx.stroke();

  // 2. Draw dots on each frame and highlight Peak Speed
  ctx.shadowBlur = 0;
  const maxSpeed = Math.max(...trajectory.speeds);
  pts.forEach((p, idx) => {
    if (!p) return;
    const px = p.x * canvas.width;
    const py = p.y * canvas.height;
    const speed = trajectory.speeds[idx];
    const isPeak = speed === maxSpeed;

    ctx.beginPath();
    ctx.arc(px, py, isPeak ? 8 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isPeak ? '#e74c3c' : '#ffffff';
    ctx.strokeStyle = jointColor;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Frame numbering inside dot
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = isPeak ? '#ffffff' : '#333333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${idx + 1}`, px, py);

    if (isPeak) {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#e74c3c';
      ctx.textAlign = 'left';
      ctx.fillText('⚡ 최대 가속', px + 12, py - 4);
    }
  });

  // Label at top left
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(label, 14, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 13, 27);
}

function drawSpeedChart(canvas, userTraj, proTraj) {
  // Account for CSS container bounds
  canvas.width = canvas.parentElement.clientWidth || 400;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');

  // Chart Background with border radius
  ctx.fillStyle = '#fbfcfd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Guidelines
  ctx.strokeStyle = '#e9ecef';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = (canvas.height - 60) * (i / 4) + 25;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(canvas.width - 20, y);
    ctx.stroke();
  }

  const allSpeeds = [...userTraj.speeds, ...(proTraj ? proTraj.speeds : [])];
  const validSpeeds = allSpeeds.filter(s => typeof s === 'number' && !isNaN(s));
  const maxVal = Math.max(...validSpeeds, 1.0) || 1.0;
  const scaleY = (canvas.height - 70) / maxVal;

  const drawLine = (trajectory, color, label) => {
    if (!trajectory) return;
    const speeds = trajectory.speeds;
    const stepX = (canvas.width - 65) / (speeds.length - 1);
    const pts = speeds.map((s, idx) => ({
      x: 40 + idx * stepX,
      y: canvas.height - 35 - s * scaleY
    }));

    // Area Fill
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, color + '44');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, canvas.height - 35);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, canvas.height - 35);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Curved Spline line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Peak Speed Marker
    const peakIdx = speeds.indexOf(Math.max(...speeds));
    const peakPt = pts[peakIdx];
    ctx.beginPath();
    ctx.arc(peakPt.x, peakPt.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Peak Text
    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} Peak (${speeds[peakIdx].toFixed(1)})`, peakPt.x, peakPt.y - 12);
  };

  if (proTraj) drawLine(proTraj, '#0078d4', '프로');
  drawLine(userTraj, '#ff8c00', '나');

  // Axes Labels
  ctx.fillStyle = '#7f8c8d';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const stepX = (canvas.width - 65) / (userTraj.speeds.length - 1);
  for (let i = 0; i < userTraj.speeds.length; i++) {
    const x = 40 + i * stepX;
    ctx.fillText(`#${i + 1}`, x, canvas.height - 12);
  }

  // Y Axis unit indicator
  ctx.save();
  ctx.translate(14, canvas.height / 2 - 10);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('속도 (화면 비율/초)', 0, 0);
  ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg) {
  const appStatus = document.getElementById('app-status');
  if (appStatus) appStatus.textContent = msg;
  const progLabel = document.getElementById('progress-label');
  if (progLabel) progLabel.textContent = msg;
}
