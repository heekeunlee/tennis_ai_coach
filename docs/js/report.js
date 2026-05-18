/**
 * report.js — CSV and Markdown report generation
 */
import { METRIC_NAME, METRIC_UNIT, DISPLAY_ORDER } from './coaching.js';

const PHASE_KO = {
  ready: '레디 포지션', takeback: '테이크백', impact: '임팩트', followthrough: '팔로스루',
};

// ── CSV ───────────────────────────────────────────────────────────────────────

export function generateCSV(analysisResult, mode) {
  const { userAnalysis, proAnalysis, comparison, stroke, dominantHand } = analysisResult;
  const rows = [];
  const isComp = mode === 'comparison' && proAnalysis && comparison;

  rows.push(['Tennis AI Coach — 분석 보고서']);
  rows.push(['스트로크', stroke === 'forehand' ? '포핸드' : '백핸드']);
  rows.push(['주 사용 손', dominantHand === 'right' ? '오른손잡이' : '왼손잡이']);
  rows.push(['분석 모드', isComp ? '롤모델 비교' : '단독 분석']);
  if (isComp) rows.push(['종합 유사도', `${Math.round(comparison.overallSimilarity)}%`]);
  rows.push([]);

  const header = ['단계', '지표', '단위', '나의 값'];
  if (isComp) header.push('롤모델 값', '차이', '유사도');
  rows.push(header);

  Object.entries(PHASE_KO).forEach(([ph, phKo]) => {
    const u = userAnalysis[ph];
    if (!u) return;
    DISPLAY_ORDER.forEach(mk => {
      const uv = u[mk];
      if (uv == null) return;
      const unit = METRIC_UNIT[mk] || '';
      const fmt = v => v != null ? (typeof v === 'number' ? v.toFixed(1) : v) : '-';
      const row = [phKo, METRIC_NAME[mk] || mk, unit, fmt(uv)];
      if (isComp) {
        const phComp = comparison.phases[ph];
        const pv = proAnalysis[ph]?.[mk];
        const diff = phComp?.comparison[mk]?.diff;
        const sim  = phComp ? Math.round(phComp.similarity) : '-';
        row.push(fmt(pv), diff != null ? diff.toFixed(1) : '-', `${sim}%`);
      }
      rows.push(row);
    });
  });

  return rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ── Markdown ──────────────────────────────────────────────────────────────────

export function generateMarkdown(analysisResult, coaching, recs, mode) {
  const { userAnalysis, proAnalysis, comparison, stroke, dominantHand } = analysisResult;
  const isComp = mode === 'comparison' && proAnalysis && comparison;
  const now = new Date().toLocaleString('ko-KR');
  const lines = [];

  lines.push('# 🎾 Tennis AI Coach — 분석 보고서');
  lines.push('');
  lines.push(`> 생성일시: ${now}`);
  lines.push('');
  lines.push('## 기본 정보');
  lines.push('');
  lines.push(`| 항목 | 내용 |`);
  lines.push(`|------|------|`);
  lines.push(`| 스트로크 | ${stroke === 'forehand' ? '포핸드' : '백핸드'} |`);
  lines.push(`| 주 사용 손 | ${dominantHand === 'right' ? '오른손잡이' : '왼손잡이'} |`);
  lines.push(`| 분석 모드 | ${isComp ? '롤모델 비교' : '단독 분석'} |`);

  if (isComp && comparison) {
    lines.push('');
    lines.push('## 종합 유사도');
    lines.push('');
    lines.push(`**${Math.round(comparison.overallSimilarity)}점 / 100점**`);
    lines.push('');
    lines.push('| 단계 | 유사도 |');
    lines.push('|------|--------|');
    Object.entries(comparison.phaseSimilarities).forEach(([ph, sim]) => {
      lines.push(`| ${ph} | ${Math.round(sim)}% |`);
    });
  }

  if (coaching?.length) {
    lines.push('');
    lines.push('## 🎯 주요 코칭 포인트');
    lines.push('');
    coaching.forEach(c => lines.push(`- ${c}`));
  }

  if (recs?.length) {
    lines.push('');
    lines.push('## 💡 개선 권고');
    lines.push('');
    recs.forEach(r => lines.push(`- ${r}`));
  }

  lines.push('');
  lines.push('## 단계별 지표 분석');

  Object.entries(PHASE_KO).forEach(([ph, phKo]) => {
    const u = userAnalysis[ph];
    if (!u) return;
    lines.push('');
    lines.push(`### ${phKo}`);
    lines.push('');
    const header = isComp ? '| 지표 | 단위 | 나의 값 | 롤모델 값 | 차이 |'
                          : '| 지표 | 단위 | 값 |';
    const sep    = isComp ? '|------|------|---------|-----------|------|'
                          : '|------|------|-----|';
    lines.push(header, sep);
    DISPLAY_ORDER.forEach(mk => {
      const uv = u[mk];
      if (uv == null) return;
      const unit = METRIC_UNIT[mk] || '';
      const fmt = v => v != null ? v.toFixed(1) : '-';
      if (isComp) {
        const pv   = proAnalysis[ph]?.[mk];
        const diff = comparison.phases[ph]?.comparison[mk]?.diff;
        lines.push(`| ${METRIC_NAME[mk]} | ${unit} | ${fmt(uv)} | ${fmt(pv)} | ${diff != null ? diff.toFixed(1) : '-'} |`);
      } else {
        lines.push(`| ${METRIC_NAME[mk]} | ${unit} | ${fmt(uv)} |`);
      }
    });
  });

  lines.push('');
  lines.push('---');
  lines.push('*Tennis AI Coach · MediaPipe Pose Landmarker · GitHub Pages*');

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function downloadText(text, filename, mime) {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
