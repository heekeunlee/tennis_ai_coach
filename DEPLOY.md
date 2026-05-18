# 배포 가이드 — Streamlit Community Cloud

## 1단계: share.streamlit.io 접속

1. **https://share.streamlit.io** 로 이동
2. **"Sign in with GitHub"** 클릭
3. GitHub 계정 `heekeunlee`로 로그인

## 2단계: 앱 배포

1. **"New app"** 버튼 클릭
2. 아래 정보 입력:
   - **Repository**: `heekeunlee/tennis_ai_coach`
   - **Branch**: `main`
   - **Main file path**: `app.py`
3. **"Deploy!"** 클릭

## 3단계: 배포 완료

- 약 3~5분 후 앱이 공개 URL로 배포됩니다.
- URL 형식: `https://heekeunlee-tennis-ai-coach-app-xxxxxx.streamlit.app`
- 이 URL을 스마트폰 브라우저에서 열면 모바일로 사용 가능합니다.

## 참고

- 최초 배포 시 MediaPipe 모델 파일이 자동 다운로드됩니다 (~30MB).
- 무료 플랜은 비활성 시 슬립 모드로 전환되며, 첫 접속 시 20~30초 로딩 시간이 있을 수 있습니다.
- 영상 업로드 최대 용량: 500MB
