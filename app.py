"""
Tennis AI Coach — Streamlit 메인 앱
모바일 반응형 + 지표별 상세 코칭 코멘트 포함
"""

import os
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional

import cv2
import numpy as np
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.video_processor import VideoProcessor
from src.pose_estimator import PoseEstimator
from src.pose_analyzer import PoseAnalyzer
from src.comparator import PoseComparator
from src.coaching import CoachingEngine
from src.visualizer import PoseVisualizer
from src.report_generator import ReportGenerator
from src.interpreter import (
    get_interpretation, format_value,
    METRIC_DISPLAY_NAME, METRIC_UNIT, DISPLAY_ORDER,
)

# ── 페이지 설정 ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title='Tennis AI Coach',
    page_icon='🎾',
    layout='wide',
    initial_sidebar_state='expanded',
)

# ── CSS (모바일 반응형 포함) ───────────────────────────────────────────────────
st.markdown("""
<style>
/* ── 기본 ── */
h1 { color: #1a3a5c; }

/* ── 점수 박스 ── */
.score-box {
    text-align: center;
    background: linear-gradient(135deg, #1a3a5c 0%, #2980b9 100%);
    color: white; border-radius: 16px; padding: 28px 16px; margin-bottom: 8px;
}
.score-num  { font-size: 4rem; font-weight: 900; line-height: 1.1; }
.score-sub  { font-size: 0.95rem; opacity: 0.85; margin-bottom: 4px; }
.score-grade { font-size: 1.3rem; margin-top: 8px; }

/* ── 코칭 카드 ── */
.tip-card {
    background:#eaf4fb; border-left:4px solid #2196f3;
    border-radius:6px; padding:10px 14px; margin:6px 0; font-size:0.95rem;
}
.rec-card {
    background:#eafbea; border-left:4px solid #27ae60;
    border-radius:6px; padding:10px 14px; margin:6px 0; font-size:0.95rem;
}
.warn-card {
    background:#fff8e1; border-left:4px solid #f9a825;
    border-radius:6px; padding:10px 14px; margin:6px 0; font-size:0.95rem;
}

/* ── 지표 해석 카드 ── */
.interp-card {
    border-radius:8px; padding:10px 14px; margin:5px 0; font-size:0.88rem; line-height:1.5;
}
.metric-row {
    background:#f7f9fc; border-radius:10px; padding:14px 16px; margin:8px 0;
}
.metric-title { font-weight:700; font-size:1rem; color:#1a3a5c; margin-bottom:6px; }
.metric-values { display:flex; gap:20px; flex-wrap:wrap; margin-bottom:6px; }
.metric-val-box { text-align:center; }
.metric-val-label { font-size:0.75rem; color:#666; }
.metric-val-num { font-size:1.2rem; font-weight:700; color:#1a3a5c; }
.metric-val-num.pro { color:#1565c0; }
.metric-val-num.diff { color:#c62828; }

/* ── 모바일 반응형 ── */
@media screen and (max-width: 768px) {
    /* 컬럼 수직 스택 */
    [data-testid="column"] {
        width: 100% !important;
        flex: 1 1 100% !important;
        min-width: 100% !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    /* 오버플로우 방지 */
    .stApp { max-width: 100vw; overflow-x: hidden; }
    .main .block-container { padding-left: 12px !important; padding-right: 12px !important; }

    /* 버튼 크게 (터치 타깃) */
    .stButton > button {
        min-height: 48px !important;
        font-size: 1rem !important;
        width: 100% !important;
    }

    /* 탭 텍스트 */
    .stTabs [data-baseweb="tab"] {
        font-size: 12px !important;
        padding: 8px 4px !important;
    }

    /* 점수 박스 */
    .score-num { font-size: 3rem !important; }

    /* 이미지 전체 너비 */
    [data-testid="stImage"] img { max-width: 100% !important; }

    /* 슬라이더 여백 */
    [data-testid="stSlider"] { padding: 8px 0; }

    /* 사이드바 숨김 버튼 위치 */
    [data-testid="collapsedControl"] { top: 8px !important; }

    /* 메트릭 카드 */
    [data-testid="metric-container"] { padding: 8px !important; }

    /* 헤더 */
    h1 { font-size: 1.6rem !important; }
    h2 { font-size: 1.3rem !important; }
    h3 { font-size: 1.1rem !important; }

    /* metric-values 수직 */
    .metric-values { flex-direction: column; gap: 6px; }
}

@media screen and (max-width: 480px) {
    .main .block-container { padding-left: 6px !important; padding-right: 6px !important; }
    .score-num { font-size: 2.5rem !important; }
}
</style>
""", unsafe_allow_html=True)

# ── 상수 ─────────────────────────────────────────────────────────────────────
PHASES = ['ready', 'takeback', 'impact', 'followthrough']
PHASE_KO = {
    'ready':         '레디 포지션',
    'takeback':      '테이크백',
    'impact':        '임팩트',
    'followthrough': '팔로스루',
}

# ── 세션 상태 초기화 ──────────────────────────────────────────────────────────
def _init():
    defaults = {
        'user_path':     None, 'pro_path':      None,
        'user_proc':     None, 'pro_proc':       None,
        'user_poses':    {},   'pro_poses':       {},
        'user_sel':      {p: 0 for p in PHASES},
        'pro_sel':       {p: 0 for p in PHASES},
        'user_analyses': {},   'pro_analyses':    {},
        'comparison':    None,
        'proc_done':     False,
        'analysis_done': False,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

_init()

# ── 유틸 함수 ─────────────────────────────────────────────────────────────────
def save_upload(uploaded) -> str:
    suffix = Path(uploaded.name).suffix or '.mp4'
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(uploaded.read())
    tmp.flush()
    return tmp.name


def process_video(path: str, estimator: PoseEstimator, bar=None) -> tuple:
    proc = VideoProcessor(path)
    poses: Dict = {}
    total = proc.total_frames
    sample_n = min(120, total)
    indices = np.linspace(0, total - 1, sample_n, dtype=int)
    for i, idx in enumerate(indices):
        frame = proc.get_frame(int(idx))
        if frame is not None:
            poses[int(idx)] = estimator.estimate(frame)
        if bar:
            bar.progress((i + 1) / len(indices), text=f'프레임 처리 중... {i+1}/{len(indices)}')
    return proc, poses


def get_nearest_pose(poses: Dict, frame_idx: int) -> Optional[Dict]:
    if frame_idx in poses:
        return poses[frame_idx]
    if not poses:
        return None
    return poses[min(poses, key=lambda k: abs(k - frame_idx))]


def get_frame_preview(proc, poses, frame_idx, joint_color, label, estimator) -> Optional[np.ndarray]:
    frame = proc.get_frame(frame_idx)
    if frame is None:
        return None
    if frame_idx not in poses:
        poses[frame_idx] = estimator.estimate(frame)
    viz = PoseVisualizer()
    return viz.draw_skeleton(frame, poses[frame_idx], joint_color, label)


def get_pose_for_frame(proc, poses, idx, estimator):
    if idx in poses and poses[idx] is not None:
        return poses[idx]
    frame = proc.get_frame(idx)
    if frame is None:
        return None
    pose = estimator.estimate(frame)
    poses[idx] = pose
    return pose


# ── 지표 상세 카드 렌더링 ──────────────────────────────────────────────────────
def render_metric_card(
    mk: str,
    user_val: Optional[float],
    phase: str,
    pro_val: Optional[float] = None,
):
    """지표 한 개를 값 + 해석 카드로 렌더링"""
    if user_val is None:
        return

    label = METRIC_DISPLAY_NAME.get(mk, mk)
    unit  = METRIC_UNIT.get(mk, '')
    interp = get_interpretation(mk, user_val, phase)

    # ── 비교 모드: 나 / 프로 / 차이
    if pro_val is not None:
        diff = abs(user_val - pro_val)
        values_html = f"""
        <div class="metric-values">
          <div class="metric-val-box">
            <div class="metric-val-label">나</div>
            <div class="metric-val-num">{user_val:.1f}{unit}</div>
          </div>
          <div class="metric-val-box">
            <div class="metric-val-label">롤모델</div>
            <div class="metric-val-num pro">{pro_val:.1f}{unit}</div>
          </div>
          <div class="metric-val-box">
            <div class="metric-val-label">차이</div>
            <div class="metric-val-num diff">▲ {diff:.1f}{unit}</div>
          </div>
        </div>"""
    else:
        values_html = f"""
        <div class="metric-values">
          <div class="metric-val-box">
            <div class="metric-val-label">측정값</div>
            <div class="metric-val-num">{user_val:.1f}{unit}</div>
          </div>
        </div>"""

    interp_html = f"""
    <div class="interp-card" style="
        background:{interp['bg_color']};
        border-left:4px solid {interp['border_color']};">
      {interp['icon']} {interp['message']}
    </div>"""

    st.markdown(f"""
    <div class="metric-row">
      <div class="metric-title">{label}</div>
      {values_html}
      {interp_html}
    </div>
    """, unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# 사이드바
# ══════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown('## ⚙️ 분석 설정')
    mode = st.radio(
        '분석 모드',
        ['solo', 'comparison'],
        format_func=lambda x: '🏃 단독 분석' if x == 'solo' else '🆚 롤모델 비교',
    )
    stroke = st.radio(
        '스트로크',
        ['forehand', 'backhand'],
        format_func=lambda x: '포핸드' if x == 'forehand' else '백핸드',
    )
    hand = st.radio(
        '주 사용 손',
        ['right', 'left'],
        format_func=lambda x: '오른손잡이' if x == 'right' else '왼손잡이',
    )
    camera = st.radio(
        '촬영 방향',
        ['side', 'front'],
        format_func=lambda x: '측면 (권장)' if x == 'side' else '정면/후면',
    )
    if camera == 'front':
        st.markdown('<div class="warn-card">⚠️ 측면 촬영보다 관절 각도 정확도가 낮을 수 있습니다.</div>',
                    unsafe_allow_html=True)
    st.markdown('---')
    st.markdown('**💡 팁**')
    st.caption('전신이 보이는 측면 영상이 가장 정확합니다.')
    st.caption('MP4, MOV, AVI 지원 (최대 500MB)')

# ══════════════════════════════════════════════════════════════════════════════
# 헤더
# ══════════════════════════════════════════════════════════════════════════════
st.markdown('# 🎾 Tennis AI Coach')
st.markdown('스윙 영상을 업로드하면 관절 각도를 분석하고 맞춤형 코칭을 제공합니다.')

tab1, tab2, tab3, tab4 = st.tabs(['📹 영상 업로드', '🎯 프레임 선택', '📊 분석 결과', '📥 보고서 다운로드'])

# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — 영상 업로드
# ══════════════════════════════════════════════════════════════════════════════
with tab1:
    col_u, col_p = st.columns(2)
    with col_u:
        st.markdown('### 나의 스윙 영상')
        user_file = st.file_uploader('파일 선택 (MP4 / MOV / AVI)', type=['mp4','mov','avi','mkv'], key='uf')
        if user_file:
            st.video(user_file)

    if mode == 'comparison':
        with col_p:
            st.markdown('### 롤모델 영상')
            input_method = st.radio('입력 방법', ['upload','youtube'],
                format_func=lambda x: '파일 업로드' if x=='upload' else 'YouTube URL (준비 중)', key='pm')
            if input_method == 'youtube':
                st.info('YouTube URL 기능은 향후 버전에서 지원 예정입니다.')
                pro_file = None
            else:
                pro_file = st.file_uploader('롤모델 파일 선택', type=['mp4','mov','avi','mkv'], key='pf')
                if pro_file:
                    st.video(pro_file)
    else:
        pro_file = None

    st.markdown('---')
    can_proc = user_file is not None
    if mode == 'comparison':
        can_proc = can_proc and pro_file is not None

    if st.button('🔍 영상 처리 시작', disabled=not can_proc, type='primary', use_container_width=True):
        estimator = PoseEstimator()
        with st.spinner('나의 영상 처리 중...'):
            upath = save_upload(user_file)
            st.session_state['user_path'] = upath
            bar = st.progress(0)
            uproc, uposes = process_video(upath, estimator, bar)
            st.session_state['user_proc']  = uproc
            st.session_state['user_poses'] = uposes
            bar.empty()
        total_u = uproc.total_frames
        st.success(f'✅ 나의 영상 처리 완료 — {total_u}프레임 ({uproc.fps:.1f}fps)')
        st.session_state['user_sel'] = {
            'ready': 0, 'takeback': max(0, total_u//4-1),
            'impact': max(0, total_u//2-1), 'followthrough': max(0, 3*total_u//4-1),
        }
        if mode == 'comparison' and pro_file:
            with st.spinner('롤모델 영상 처리 중...'):
                ppath = save_upload(pro_file)
                st.session_state['pro_path'] = ppath
                bar2 = st.progress(0)
                pproc, pposes = process_video(ppath, estimator, bar2)
                st.session_state['pro_proc']  = pproc
                st.session_state['pro_poses'] = pposes
                bar2.empty()
            total_p = pproc.total_frames
            st.success(f'✅ 롤모델 영상 처리 완료 — {total_p}프레임')
            st.session_state['pro_sel'] = {
                'ready': 0, 'takeback': max(0, total_p//4-1),
                'impact': max(0, total_p//2-1), 'followthrough': max(0, 3*total_p//4-1),
            }
        estimator.close()
        st.session_state['proc_done'] = True
        st.session_state['analysis_done'] = False
        st.balloons()
        st.info('✅ 처리 완료! **프레임 선택** 탭으로 이동하세요.')

# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — 프레임 선택
# ══════════════════════════════════════════════════════════════════════════════
with tab2:
    if not st.session_state['proc_done']:
        st.info('먼저 **영상 업로드** 탭에서 영상을 처리해주세요.')
    else:
        uproc: VideoProcessor = st.session_state['user_proc']
        pproc: Optional[VideoProcessor] = st.session_state.get('pro_proc')
        estimator = PoseEstimator()

        st.markdown('### 단계별 대표 프레임 선택')
        st.caption('슬라이더로 각 단계의 대표 순간을 선택하세요.')

        for phase in PHASES:
            st.markdown(f'---\n#### {PHASE_KO[phase]}')
            ncols = 2 if (mode == 'comparison' and pproc) else 1
            cols = st.columns(ncols)

            with cols[0]:
                st.markdown('**나의 스윙**')
                utotal = uproc.total_frames
                u_idx = st.slider(f'프레임 (나 / {PHASE_KO[phase]})', 0, max(0, utotal-1),
                                  value=st.session_state['user_sel'].get(phase, 0), key=f'us_{phase}')
                st.session_state['user_sel'][phase] = u_idx
                img = get_frame_preview(uproc, st.session_state['user_poses'], u_idx, (255,140,0), PHASE_KO[phase], estimator)
                if img is not None:
                    st.image(img, use_container_width=True)
                pose = st.session_state['user_poses'].get(u_idx) or get_nearest_pose(st.session_state['user_poses'], u_idx)
                if pose:
                    vis = pose.get('mean_visibility', 0)
                    (st.warning if vis < 0.5 else st.success)(
                        f'{"⚠️ 신뢰도 낮음" if vis < 0.5 else "포즈 신뢰도"}: {vis:.0%}')

            if mode == 'comparison' and pproc and len(cols) > 1:
                with cols[1]:
                    st.markdown('**롤모델**')
                    ptotal = pproc.total_frames
                    p_idx = st.slider(f'프레임 (롤모델 / {PHASE_KO[phase]})', 0, max(0, ptotal-1),
                                      value=st.session_state['pro_sel'].get(phase, 0), key=f'ps_{phase}')
                    st.session_state['pro_sel'][phase] = p_idx
                    img = get_frame_preview(pproc, st.session_state['pro_poses'], p_idx, (0,120,255), PHASE_KO[phase], estimator)
                    if img is not None:
                        st.image(img, use_container_width=True)
                    pose = st.session_state['pro_poses'].get(p_idx) or get_nearest_pose(st.session_state['pro_poses'], p_idx)
                    if pose:
                        vis = pose.get('mean_visibility', 0)
                        (st.warning if vis < 0.5 else st.success)(f'{"⚠️ 신뢰도 낮음" if vis < 0.5 else "포즈 신뢰도"}: {vis:.0%}')

        estimator.close()
        st.markdown('---')

        if st.button('📊 분석 시작', type='primary', use_container_width=True):
            analyzer = PoseAnalyzer(dominant_hand=hand, stroke_type=stroke)
            est2 = PoseEstimator()
            user_analyses = {}
            for phase in PHASES:
                idx = st.session_state['user_sel'][phase]
                pose = get_pose_for_frame(uproc, st.session_state['user_poses'], idx, est2)
                user_analyses[phase] = analyzer.analyze_frame(pose)
            st.session_state['user_analyses'] = user_analyses

            if mode == 'comparison' and pproc:
                pro_analyses = {}
                for phase in PHASES:
                    idx = st.session_state['pro_sel'][phase]
                    pose = get_pose_for_frame(pproc, st.session_state['pro_poses'], idx, est2)
                    pro_analyses[phase] = analyzer.analyze_frame(pose)
                st.session_state['pro_analyses'] = pro_analyses
                st.session_state['comparison'] = PoseComparator().compare_phases(user_analyses, pro_analyses)

            est2.close()
            st.session_state['analysis_done'] = True
            st.success('✅ 분석 완료! **분석 결과** 탭을 확인하세요.')

# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — 분석 결과
# ══════════════════════════════════════════════════════════════════════════════
with tab3:
    if not st.session_state['analysis_done']:
        st.info('먼저 **프레임 선택** 탭에서 분석을 시작해주세요.')
    else:
        user_an  = st.session_state['user_analyses']
        pro_an   = st.session_state.get('pro_analyses', {})
        comp_res = st.session_state.get('comparison')
        uproc    = st.session_state['user_proc']
        pproc    = st.session_state.get('pro_proc')
        coach    = CoachingEngine()
        viz      = PoseVisualizer()

        # ══════════════════════════════════════════════════════════════════════
        # 비교 분석 모드
        # ══════════════════════════════════════════════════════════════════════
        if mode == 'comparison' and comp_res:
            import plotly.graph_objects as go

            overall   = comp_res['overall_similarity']
            top_diffs = comp_res.get('top_differences', [])
            coaching_sents = coach.generate_coaching(top_diffs, stroke)
            recs           = coach.generate_recommendations(top_diffs)

            st.markdown('## 📊 비교 분석 결과')

            # 전체 점수 + 단계별 차트
            col_sc, col_chart = st.columns([1, 2])
            with col_sc:
                grade = '🟢 우수' if overall >= 75 else '🟡 보통' if overall >= 50 else '🔴 개선 필요'
                st.markdown(f"""
                <div class="score-box">
                  <div class="score-sub">전체 유사도</div>
                  <div class="score-num">{overall:.0f}<span style="font-size:1.5rem">/100</span></div>
                  <div class="score-grade">{grade}</div>
                </div>""", unsafe_allow_html=True)

            with col_chart:
                ps = comp_res.get('phase_similarities', {})
                if ps:
                    colors = ['#27ae60' if v >= 75 else '#f39c12' if v >= 50 else '#e74c3c' for v in ps.values()]
                    fig = go.Figure(go.Bar(
                        x=list(ps.values()), y=list(ps.keys()), orientation='h',
                        marker_color=colors,
                        text=[f'{v:.0f}점' for v in ps.values()], textposition='inside',
                    ))
                    fig.update_layout(
                        title='단계별 유사도', xaxis=dict(range=[0,100], title='점수'),
                        height=220, margin=dict(l=10,r=10,t=36,b=10),
                        paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                    )
                    st.plotly_chart(fig, use_container_width=True)

            st.markdown('---')

            # 코칭 + 추천 연습
            c1, c2 = st.columns(2)
            with c1:
                st.markdown('### 🎯 주요 개선점')
                if coaching_sents:
                    for i, s in enumerate(coaching_sents, 1):
                        st.markdown(f'<div class="tip-card"><b>{i}.</b> {s}</div>', unsafe_allow_html=True)
                else:
                    st.success('큰 차이점이 발견되지 않았습니다! 훌륭한 자세입니다.')
            with c2:
                st.markdown('### 💪 추천 연습')
                if recs:
                    for i, r in enumerate(recs, 1):
                        st.markdown(f'<div class="rec-card"><b>{i}.</b> {r}</div>', unsafe_allow_html=True)

            st.markdown('---')

            # ── 단계별 상세 ────────────────────────────────────────────────────
            st.markdown('### 📸 단계별 상세 비교')

            for phase in PHASES:
                pd_data = comp_res['phases'].get(phase)
                if pd_data is None:
                    continue
                phase_sim = pd_data['similarity']

                with st.expander(f'**{PHASE_KO[phase]}** — 유사도 {phase_sim:.0f}점', expanded=True):
                    # 스켈레톤 나란히
                    u_idx = st.session_state['user_sel'][phase]
                    p_idx = st.session_state['pro_sel'][phase]
                    u_frame = uproc.get_frame(u_idx) if uproc else None
                    p_frame = pproc.get_frame(p_idx)  if pproc else None
                    u_pose  = st.session_state['user_poses'].get(u_idx)
                    p_pose  = st.session_state['pro_poses'].get(p_idx)

                    if u_frame is not None and p_frame is not None:
                        cmp_img = viz.create_comparison_image(u_frame, p_frame, u_pose, p_pose, '나의 스윙', '롤모델')
                        st.image(cmp_img, use_container_width=True, caption='🟠 나의 스윙   |   🔵 롤모델')

                    # ── 전체 9개 지표 상세 카드 ──────────────────────────────
                    st.markdown('#### 📐 지표별 상세 분석')
                    comp_detail = pd_data.get('comparison', {})
                    um = user_an.get(phase, {})
                    pm = pro_an.get(phase, {})

                    for mk in DISPLAY_ORDER:
                        uv = um.get(mk) if um else None
                        pv = pm.get(mk) if pm else None
                        if uv is None:
                            continue
                        render_metric_card(mk, uv, phase, pv)

        # ══════════════════════════════════════════════════════════════════════
        # 단독 분석 모드
        # ══════════════════════════════════════════════════════════════════════
        else:
            st.markdown('## 📊 단독 분석 결과')

            for phase in PHASES:
                metrics = user_an.get(phase)
                if not metrics:
                    continue

                frame_idx = st.session_state['user_sel'][phase]
                frame = uproc.get_frame(frame_idx) if uproc else None
                pose  = st.session_state['user_poses'].get(frame_idx)

                with st.expander(f'**{PHASE_KO[phase]}**', expanded=True):
                    if frame is not None:
                        drawn = viz.draw_skeleton(frame, pose, (0,200,100), PHASE_KO[phase])
                        drawn = viz.annotate_angles(drawn, pose, metrics, hand)
                        st.image(drawn, use_container_width=True)

                    # 신뢰도 경고
                    if not metrics.get('is_reliable', True):
                        st.markdown('<div class="warn-card">⚠️ 이 프레임의 포즈 신뢰도가 낮습니다. 결과를 참고용으로만 활용하세요.</div>',
                                    unsafe_allow_html=True)

                    st.markdown('#### 📐 지표별 상세 분석')
                    for mk in DISPLAY_ORDER:
                        uv = metrics.get(mk)
                        if uv is None:
                            continue
                        render_metric_card(mk, uv, phase)

                    # 단독 코칭 팁
                    tips = coach.generate_solo_coaching(metrics, phase)
                    if tips:
                        st.markdown('#### 💬 자동 피드백')
                        for t in tips:
                            st.markdown(f'<div class="tip-card">{t}</div>', unsafe_allow_html=True)

# ══════════════════════════════════════════════════════════════════════════════
# TAB 4 — 보고서 다운로드
# ══════════════════════════════════════════════════════════════════════════════
with tab4:
    if not st.session_state['analysis_done']:
        st.info('먼저 분석을 완료해주세요.')
    else:
        st.markdown('### 📥 분석 보고서 다운로드')

        user_an  = st.session_state['user_analyses']
        pro_an   = st.session_state.get('pro_analyses') or None
        comp_res = st.session_state.get('comparison')
        coach    = CoachingEngine()
        rep      = ReportGenerator()

        top_diffs      = comp_res.get('top_differences', []) if comp_res else []
        overall        = comp_res.get('overall_similarity')  if comp_res else None
        coaching_sents = coach.generate_coaching(top_diffs, stroke)
        recs           = coach.generate_recommendations(top_diffs)

        c1, c2 = st.columns(2)
        with c1:
            st.markdown('#### 📊 CSV 보고서')
            st.caption('Excel 등에서 열 수 있는 표 형식')
            csv = rep.generate_csv(user_an, pro_an, comp_res)
            st.download_button('⬇️ CSV 다운로드', data=csv.encode('utf-8-sig'),
                               file_name='tennis_analysis.csv', mime='text/csv',
                               use_container_width=True)
        with c2:
            st.markdown('#### 📄 Markdown 보고서')
            st.caption('Notion·Obsidian에서 열 수 있는 문서')
            md = rep.generate_markdown(user_an, pro_an, comp_res, coaching_sents, recs,
                                       stroke_type=stroke, dominant_hand=hand,
                                       overall_similarity=overall)
            st.download_button('⬇️ Markdown 다운로드', data=md.encode('utf-8'),
                               file_name='tennis_analysis.md', mime='text/markdown',
                               use_container_width=True)

        st.markdown('---')
        with st.expander('보고서 미리보기', expanded=False):
            st.markdown(md)
