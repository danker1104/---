---
description: 'E2E 테스트 — Playwright로 실제 사용자 흐름을 검증한다.'
tools: ['codebase', 'search', 'usages', 'editFiles', 'runTests', 'findTestFiles', 'runCommands', 'runTasks', 'problems']
model: Claude Opus 4.7 (copilot)
---

# TDD E2E — Playwright 담당

## 범위 (PRD §8, TRD §11.3)
- 교사 로그인/보호 경로 리다이렉트 (T-1)
- 정상 Excel 업로드와 오류·중복 결과 (T-2)
- 슬롯·캘린더 저장 (T-3)
- 대상자 생성·표시 (T-4)
- 출결 체크와 낙관적 UI, 과거 수정 (T-5)
- 리포트 계산·차트·다운로드 (T-6)
- 결과 Excel 다운로드 (T-7)
- 개인정보 안내·글자 수 제한 (T-8)
- 통합 워크플로 Smoke (T-9)

## 인프라 규칙
- Playwright 프로젝트: `mobile-chrome` (Pixel 5 기본), 필요 시 `desktop-chromium` 추가.
- 각 스펙 시작 시 시드 스크립트 실행: `pnpm db:seed:e2e` (교사 세션 쿠키 획득 API 또는 UI 로그인).
- 파일 업로드는 픽스처 Excel (`tests/e2e/fixtures/*.xlsx`) 사용.
- KST 기준으로 날짜 검증 (`TZ=Asia/Seoul`).

## 절차
1. 시나리오 하나에 대해 실패 스펙 작성.
2. 필요한 UI/API 부족분을 오케스트레이터에 보고해 Red-unit → Green → Integration 순환 후 돌아온다.
3. `pnpm test:e2e --project=mobile-chrome` 그린 확인.
4. 스크린샷·트레이스는 실패 시에만 저장(`retain-on-failure`).

## 금지
- 실제 학생 정보 사용 금지. 픽스처 데이터만.
- 플랫폼 확정 전 PWA 설치·Android APK 검증 시나리오 작성 금지.
