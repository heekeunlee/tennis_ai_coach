/**
 * pose.js — MediaPipe 초기화, 프레임 추출, 포즈 분석, 스켈레톤 렌더링
 */

// Dynamic import: MediaPipe CDN이 앱 부트를 막지 않도록 lazy하게 로드
let PoseLandmarker = null;
let FilesetResolver = null;
let landmarker = null;

export async function initMediaPipe(onStatus) {
  onStatus?.('MediaPipe 모듈 다운로드 중...');
  try {
    ({ PoseLandmarker, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.min.js'
    ));
  } catch (e) {
    onStatus?.('MediaPipe 로드 실패: ' + e.message);
    throw e;
  }
  onStatus?.('MediaPipe 모델 초기화 중...');
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/' +
        'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numPoses: 1,
  });
  onStatus?.('✅ 모델 로드 완료 — 영상을 업로드하세요');
  return landmarker;
}

// ── Frame extraction ─────────────────────────────────────────────────────────

export async function extractPoses(videoEl, numSamples, onProgress) {
  if (!landmarker) throw new Error('MediaPipe가 초기화되지 않았습니다');
  await videoReady(videoEl);
  const duration = videoEl.duration;
  const offCanvas = document.createElement('canvas');
  const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
  const results = [];

  for (let i = 0; i < numSamples; i++) {
    const t = (i / Math.max(numSamples - 1, 1)) * duration;
    await seekTo(videoEl, t);
    offCanvas.width  = videoEl.videoWidth  || 640;
    offCanvas.height = videoEl.videoHeight || 360;
    ctx.drawImage(videoEl, 0, 0);

    let landmarks = null, meanVis = 0;
    try {
      const res = landmarker.detect(offCanvas);
      if (res.poseLandmarks?.length) {
        landmarks = res.poseLandmarks[0];
        const vises = landmarks.map(l => l.visibility ?? 0);
        meanVis = vises.reduce((a, b) => a + b, 0) / vises.length;
      }
    } catch (_) { /* skip bad frames */ }

    // Save thumbnail
    const thumb = document.createElement('canvas');
    const scale = Math.min(1, 520 / offCanvas.width);
    thumb.width  = Math.round(offCanvas.width  * scale);
    thumb.height = Math.round(offCanvas.height * scale);
    thumb.getContext('2d').drawImage(offCanvas, 0, 0, thumb.width, thumb.height);

    results.push({
      index: i,
      time: t,
      landmarks,
      meanVisibility: meanVis,
      isReliable: meanVis > 0.5,
      thumb,
    });

    onProgress?.(Math.round(((i + 1) / numSamples) * 100));
  }
  return results;
}

function videoReady(v) {
  return new Promise(res => {
    if (v.readyState >= 2) { res(); return; }
    v.addEventListener('loadeddata', res, { once: true });
  });
}

function seekTo(v, t) {
  return new Promise(res => {
    v.currentTime = t;
    v.addEventListener('seeked', res, { once: true });
  });
}

// ── Skeleton Drawing ──────────────────────────────────────────────────────────

const CONNECTIONS = [
  [11,12],[11,23],[12,24],[23,24],
  [11,13],[13,15],[15,17],[15,19],
  [12,14],[14,16],[16,18],[16,20],
  [23,25],[25,27],[27,29],[27,31],
  [24,26],[26,28],[28,30],[28,32],
];

export function drawSkeleton(canvas, poseEntry, jointColor = '#00cc55', label = '') {
  const ctx = canvas.getContext('2d');
  const lm  = poseEntry?.landmarks;
  const w = canvas.width, h = canvas.height;

  if (lm) {
    CONNECTIONS.forEach(([a, b]) => {
      const la = lm[a], lb = lm[b];
      if (!la || !lb) return;
      const vis = Math.min(la.visibility ?? 0, lb.visibility ?? 0);
      if (vis < 0.2) return;
      ctx.globalAlpha = Math.min(1, vis + 0.2);
      ctx.strokeStyle = jointColor;
      ctx.lineWidth   = Math.max(2, vis * 4);
      ctx.beginPath();
      ctx.moveTo(la.x * w, la.y * h);
      ctx.lineTo(lb.x * w, lb.y * h);
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
    lm.forEach(l => {
      const vis = l.visibility ?? 0;
      if (vis < 0.2) return;
      const r = Math.max(4, vis * 7);
      ctx.fillStyle   = jointColor;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(l.x * w, l.y * h, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  if (label) {
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, 10, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 9, 25);
  }

  if (poseEntry && !poseEntry.isReliable) {
    ctx.globalAlpha = 0.9;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText('⚠ 신뢰도 낮음', 9, h - 10);
  }
  ctx.globalAlpha = 1;
}

export function makePoseCanvas(poseEntry, jointColor, label) {
  const src = poseEntry?.thumb;
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width  = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  drawSkeleton(c, poseEntry, jointColor, label);
  return c;
}

export function makeComparisonCanvas(userEntry, proEntry) {
  const uc = makePoseCanvas(userEntry, '#ff8c00', '나의 스윙');
  const pc = makePoseCanvas(proEntry,  '#0078d4', '롤모델');
  if (!uc || !pc) return uc || pc;

  const tH = Math.min(300, Math.round(window.innerWidth * 0.42));
  const uW = Math.round(uc.width  * tH / uc.height);
  const pW = Math.round(pc.width  * tH / pc.height);
  const combined = document.createElement('canvas');
  combined.width  = uW + pW + 4;
  combined.height = tH;
  const ctx = combined.getContext('2d');
  ctx.drawImage(uc, 0,      0, uW, tH);
  ctx.fillStyle = '#ccc';
  ctx.fillRect(uW, 0, 4, tH);
  ctx.drawImage(pc, uW + 4, 0, pW, tH);
  return combined;
}

// ── Pose Analysis ─────────────────────────────────────────────────────────────

function pt(lm, idx) {
  if (!lm?.[idx]) return null;
  return { x: lm[idx].x, y: lm[idx].y };
}

function angle3(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.sqrt(ba.x**2+ba.y**2) * Math.sqrt(bc.x**2+bc.y**2);
  if (mag < 1e-7) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function horizAngle(v) {
  const n = Math.sqrt(v.x**2 + v.y**2);
  if (n < 1e-7) return 0;
  return (Math.acos(Math.max(0, Math.min(1, Math.abs(v.x) / n))) * 180) / Math.PI;
}

export function analyzePose(poseEntry, dominantHand = 'right') {
  if (!poseEntry?.landmarks) return null;
  const lm = poseEntry.landmarks;

  const domIdx = dominantHand === 'right'
    ? { sh:12, el:14, wr:16, hi:24, kn:26, an:28 }
    : { sh:11, el:13, wr:15, hi:23, kn:25, an:27 };
  const nonIdx = dominantHand === 'right'
    ? { sh:11, hi:23 }
    : { sh:12, hi:24 };

  const ds = pt(lm, domIdx.sh), de = pt(lm, domIdx.el), dw = pt(lm, domIdx.wr);
  const dh = pt(lm, domIdx.hi), dk = pt(lm, domIdx.kn), da = pt(lm, domIdx.an);
  const ns = pt(lm, nonIdx.sh), nh = pt(lm, nonIdx.hi);

  const m = {};

  // 1. 팔꿈치 각도
  m.elbow_angle = (ds && de && dw) ? angle3(dw, de, ds) : null;

  // 2. 어깨 각도
  m.shoulder_angle = (de && ds && dh) ? angle3(de, ds, dh) : null;

  // 3. 무릎 각도
  m.knee_angle = (dh && dk && da) ? angle3(dh, dk, da) : null;

  // 4. 상체 기울기
  if (ds && dh) {
    const sp = { x: ds.x - dh.x, y: ds.y - dh.y };
    const n  = Math.sqrt(sp.x**2 + sp.y**2);
    m.trunk_inclination = n > 1e-7
      ? (Math.acos(Math.max(-1, Math.min(1, (-sp.y) / n))) * 180) / Math.PI
      : null;
  } else m.trunk_inclination = null;

  // 5. 손목 높이 (정규화)
  if (dw && ds && dh && ns && nh) {
    const hipY  = (dh.y + nh.y) / 2;
    const shY   = (ds.y + ns.y) / 2;
    const bodyH = Math.abs(hipY - shY);
    m.wrist_height = bodyH > 1e-7 ? (hipY - dw.y) / bodyH : null;
  } else m.wrist_height = null;

  // 6. 손목-몸통 거리
  if (dw && ds && ns) {
    const cx = (ds.x + ns.x) / 2, cy = (ds.y + ns.y) / 2;
    const sw = Math.sqrt((ds.x-ns.x)**2 + (ds.y-ns.y)**2);
    m.wrist_trunk_distance = sw > 1e-7
      ? Math.sqrt((dw.x-cx)**2 + (dw.y-cy)**2) / sw : null;
  } else m.wrist_trunk_distance = null;

  // 7. 어깨 회전량
  m.shoulder_rotation = (ds && ns)
    ? horizAngle({ x: ds.x - ns.x, y: ds.y - ns.y }) : null;

  // 8. 골반 회전량
  m.hip_rotation = (dh && nh)
    ? horizAngle({ x: dh.x - nh.x, y: dh.y - nh.y }) : null;

  // 9. 팔로스루 방향
  if (dw && de) {
    const ax = dw.x - de.x, ay = dw.y - de.y;
    const n  = Math.sqrt(ax**2 + ay**2);
    m.followthrough_direction = n > 1e-7
      ? (Math.atan2(-ay, ax) * 180) / Math.PI : null;
  } else m.followthrough_direction = null;

  m.visibility = poseEntry.meanVisibility;
  m.isReliable = poseEntry.isReliable;
  return m;
}

// ── Comparison ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  elbow_angle:.15, shoulder_angle:.15, knee_angle:.10,
  trunk_inclination:.10, wrist_height:.10, wrist_trunk_distance:.10,
  shoulder_rotation:.15, hip_rotation:.10, followthrough_direction:.05,
};
const MAX_DIFF = {
  elbow_angle:60, shoulder_angle:60, knee_angle:40,
  trunk_inclination:30, wrist_height:1.5, wrist_trunk_distance:1.5,
  shoulder_rotation:30, hip_rotation:25, followthrough_direction:60,
};
const PHASE_KO = {
  ready:'레디 포지션', takeback:'테이크백', impact:'임팩트', followthrough:'팔로스루',
};

export function comparePhases(userAn, proAn) {
  const result = { phases:{}, overallSimilarity:0, phaseSimilarities:{}, topDifferences:[] };
  const allDiffs = {};

  Object.keys(PHASE_KO).forEach(ph => {
    const u = userAn[ph], p = proAn[ph];
    if (!u || !p) return;
    const comp = {};
    Object.keys(WEIGHTS).forEach(mk => {
      const uv = u[mk], pv = p[mk];
      if (uv == null || pv == null) { comp[mk] = { uv, pv, diff:null, nd:0 }; return; }
      const diff = Math.abs(uv - pv);
      const nd   = Math.min(1, diff / (MAX_DIFF[mk] || 1));
      comp[mk] = { uv, pv, diff, nd, userHigher: uv > pv };
    });
    const sim = calcSim(comp);
    result.phases[ph] = { label: PHASE_KO[ph], comparison: comp, similarity: sim };
    result.phaseSimilarities[PHASE_KO[ph]] = sim;
    Object.entries(comp).forEach(([mk, d]) => {
      if (d.diff != null) (allDiffs[mk] ??= []).push({ phase: PHASE_KO[ph], ...d });
    });
  });

  const sims = Object.values(result.phases).map(v => v.similarity);
  result.overallSimilarity = sims.length ? sims.reduce((a,b)=>a+b,0)/sims.length : 0;

  result.topDifferences = Object.entries(allDiffs)
    .map(([mk, arr]) => {
      const best = arr.reduce((a,b) => a.nd > b.nd ? a : b);
      return { metric: mk, ...best };
    })
    .sort((a,b) => b.nd - a.nd).slice(0,5);

  return result;
}

function calcSim(comp) {
  let w = 0, t = 0;
  Object.entries(WEIGHTS).forEach(([mk, wt]) => {
    const d = comp[mk];
    if (d?.diff != null) { w += wt * (1 - d.nd); t += wt; }
  });
  return t > 0 ? (w / t) * 100 : 0;
}
