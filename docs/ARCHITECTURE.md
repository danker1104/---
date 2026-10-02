# ARCHITECTURE — 야자·심자 관리 시스템

본 문서는 [IDEATION.md](./IDEATION.md)의 결정 사항을 전제로 한다. 상세 요구사항과 인수 조건은 [PRD.md](./PRD.md) 참조.

## 개요
- 단일 코드베이스로 서버·API·클라이언트를 제공하며, 최종 배포 플랫폼(PWA 또는 Android 앱)은 보류.
- 담당 교사 1명이 휴대폰(Chrome)에서 사용.
- 학생·보호자는 사용자 아님.

## 기술 스택 (추천)

### 언어와 런타임
- **언어**: TypeScript 5.x (strict 모드).
- **런타임**: Node.js 22 LTS.
- **패키지 매니저**: pnpm.

### 웹 프레임워크
- **Next.js 15+ (App Router)**: UI·서버 액션·API를 단일 코드베이스에서 제공. PWA 또는 Android 앱 선택은 별도 결정.
- 폼 처리는 서버 액션 + zod 검증으로 통일.

### UI
- **Tailwind CSS**: 유틸리티 기반, 모바일 우선.
- **shadcn/ui**: 접근성 기본 반영된 컴포넌트를 소스로 관리.
- **lucide-react**: 아이콘.

### 폼과 검증
- **react-hook-form**: 폼 상태 관리.
- **zod**: 서버 액션 입력 스키마. 클라이언트·서버 공용.

### 인증/세션
- **iron-session**: HTTP-only 서명 쿠키(`SameSite=Lax`), 서버 액션 가드에 적합.
- 인증 SaaS(NextAuth/Clerk 등)는 단일 패스코드 방침에 과함 — 도입하지 않음.

### 데이터
- **Prisma**: TypeScript 우선 ORM, SQLite→Postgres 이전 경로 자연스러움.
- **DB**: PostgreSQL 16+와 Prisma. Vercel 배포에서는 Marketplace의 Prisma Postgres 풀링 연결을 사용한다.

### 유틸
- **Excel**: xlsx (Excel 읽기·쓰기). CSV는 보조 입력 형식으로만 지원.
- **날짜**: date-fns + `Asia/Seoul` 유틸 래퍼(KST 판정 전용).
- **차트**: recharts.
- **로깅**: pino (JSON 로그, 최소 필드). 서버 로그는 stdout, 접속 로그는 시각·액션·actor만.

### 플랫폼 선택 (보류)
- **PWA 후보**: Web App Manifest와 서비스워커를 사용해 브라우저 설치형으로 제공.
- **Android 앱 후보**: 동일 서비스에 연결하는 앱 패키지 방식 검토.
- 업무 규칙과 Excel 입출력은 플랫폼과 독립적으로 설계한다.

### 테스트
- **Vitest**: 도메인 규칙·유틸 유닛 테스트.
- **Playwright**: 시나리오 E2E (PRD §8 T-계열).
- **React Testing Library**: 컴포넌트 상호작용.

### 개발 도구
- **Biome** (또는 ESLint + Prettier): 린트/포맷.
- **Docker + docker-compose**: 학교 내부망 배포 및 로컬 재현.

## 스택 선정 이유
- 교사 1명·학생 30명 규모에는 단일 Node 프로세스 + SQLite로 충분.
- Next.js 서버 액션이 CSRF 보호와 zod 검증을 자연스럽게 결합 → 개인정보 화이트리스트 강제에 유리.
- Prisma로 SQLite↔Postgres 이전이 문서화된 경로 → 배포 위치 결정(OQ-2) 지연을 흡수.
- TypeScript strict + zod로 컴파일·런타임 이중 검증 → 데이터 보호 원칙(PRD §6 P-1) 준수 감사에 활용.
- 전 항목이 무료·오픈소스 → 학교 예산 부담 없음.

## 도입 배제 결정
- 인증 SaaS, 외부 큐/캐시(Redis 등), 상태관리 라이브러리(Zustand·Redux), 자동 알림 SDK — 이번 규모에 불필요.
- 별도 프론트/백엔드 분리, GraphQL 계층 — 서버 액션으로 충분.

## 배포 토폴로지
- **A안**: 학교 내부망 상시 서버에 애플리케이션과 PostgreSQL을 배포, HTTPS/방화벽 설정.
- **B안 (조건부)**: 학교 승인 후 Vercel + Prisma Postgres를 사용한다. 런타임은 풀링 URL, 마이그레이션은 직접 연결 URL을 사용한다.
- **C안 (미채택)**: 교실 PC 로컬 실행 — 휴대폰 접속 요건과 충돌.

배포 위치가 확정되기 전에는 실제 학생 정보를 투입하지 않는다.

## 접근 통제
- 학생 로그인 없음.
- 교사 접근: `/teacher/**` 경로는 `middleware.ts`에서 `teacher_session` 쿠키 검사.
  - `/teacher/login`에서 `TEACHER_PASSCODE`(환경변수) 대조.
  - 성공 시 서명된 HTTP-only 쿠키(`SameSite=Lax`) 발급.
  - 세션 유효기간 기본 12시간(정책 확정 시 변경).
- 모든 서버 액션·API 라우트는 `requireTeacher()` 가드로 보호.

## 데이터 모델 (Prisma)
```prisma
enum StudySlot { OJA YAJA SIMJA }
enum AttState  { PRESENT LATE LEAVE_EARLY ABSENT EXCUSED }
enum AbsenceCategory { PERSONAL OFFICIAL OTHER }
enum CalendarReason  { HOLIDAY EXAM OTHER }
```
- **Student**: id, studentNo(unique), name, classroom, active, createdAt, contact?, surveySubmittedAt?, surveyUpdatedAt?.
  - 뒤 세 필드는 교사용 내부 상세 전용. 결과 Excel·CSV·감사 로그·외부 공유에서 제외한다.
- **SlotConfig**: id, slot(StudySlot, unique), startTime, endTime, lateThresholdMinutes?, active.
- **CalendarException**: id, date(unique), reason(CalendarReason), memo?.
- **ParticipationPlan**: id, studentId, date, slot, importBatchId, createdAt.
  - Excel 한 행의 학생·날짜·슬롯 운영 대상. Unique(studentId, date, slot).
- **ImportBatch**: id, fileName, importedAt, rowCount, errorCount, actor.
  - 업로드 단위와 오류 결과를 기록. 원본 파일 자체는 서버에 장기 보관하지 않음.
- **Attendance**: id, participationPlanId, checkInAt?, checkOutAt?, state, absenceCategory?, absenceNote?, updatedAt.
  - ParticipationPlan과 1:1 관계. 중복 출결은 허용하지 않는다.
- **AuditLog**: id, actor, action, targetType, targetId, at, meta(JSON).

저장 대상이 아닌 항목(스키마에 두지 않음):
- 보호자 연락처, 이메일, 주민번호.
- 상담 내용, 건강·질병 정보, 증빙 이미지.

교사용 내부 상세로만 저장(결과 Excel·CSV·감사 로그·외부 공유 제외): 학생 연락처, 설문 제출/수정시간.

## Excel 연동 규칙
- MVP의 기준 흐름은 `Excel 업로드 → 날짜별 출결 대상 생성 → 앱에서 체크 → 결과 Excel 다운로드`.
- 기본 Excel 열은 `학번`, `이름`, `반`, `날짜`, `구분`이며 `구분` 값은 `오자`, `야자`, `심자`를 사용한다. 설문 원본(제출내역/제출내역_텍스트) 형식도 기준 월요일과 함께 직접 업로드할 수 있다.
- 필수 열이 없거나 날짜·구분 값이 올바르지 않은 행은 저장하지 않고 행 번호와 오류 사유를 보여준다.
- 동일 학생·날짜·슬롯 행은 중복으로 처리하고 하나만 저장한다.
- 결과 Excel에는 원본 식별 정보와 출결 상태, 입실 시각, 퇴실 시각, 불참 사유를 포함한다.
- MVP는 원본 Excel과 실시간 양방향 동기화를 지원하지 않는다. 업로드 시점의 데이터를 기준으로 운영한다.

## 도메인 규칙
- **출결 자동 마킹**
  - `checkInAt <= slot.start + lateThresholdMinutes` → `PRESENT`.
  - `checkInAt >  slot.start + lateThresholdMinutes` → `LATE`.
  - `lateThresholdMinutes` 미설정 → 지각 판정 비활성, `PRESENT`로 기록.
  - `checkOutAt < slot.end` → `LEAVE_EARLY`.
- **캘린더 예외**: 해당 날짜에서는 Excel 대상 생성과 출결 대상 추가를 허용하지 않음.
- **출결 대상**: `ParticipationPlan`이 있는 학생만 출결 목록에 표시.
- **불참 사유**: 교사가 직접 작성할 수 있으나 건강정보·질병명·가정사 등 민감한 상세 내용은 입력하지 않음.
- **감사 로그**: 상태 전이·삭제 없음. 명부는 비활성화만 지원.

## 플랫폼별 운영 전략 (결정 보류)
- PWA를 선택하면 `manifest.json`과 서비스워커를 사용하고, 출결 API는 network-first로 운영한다.
- Android 앱을 선택하면 동일한 서버와 데이터 규칙을 사용하는 앱 배포 방식을 별도 검토한다.
- 오프라인 출결 저장은 어느 플랫폼에서도 MVP 범위가 아니다.

## 알림
- MVP: 자동 발송 없음. `lib/notify.ts`는 no-op 어댑터로 남겨두고, 화면 상단 "오늘 미입실 X명" 배지로 대체.
- 후속: 카카오 알림톡 — 공식 딜러사 계약, 학교 명의 비즈니스 채널, 승인 템플릿, 수신자 처리 근거 확보 시 도입.

## 환경 변수
- `DATABASE_URL` (애플리케이션 런타임용 PostgreSQL 풀링 URL)
- `DIRECT_URL` (Prisma 마이그레이션용 PostgreSQL 직접 연결 URL)
- `TEACHER_PASSCODE` (최소 12자)
- `SESSION_SECRET` (쿠키 서명용, 최소 32자)
- `SESSION_HOURS` (기본 12)
- `TZ=Asia/Seoul`
- `NODE_ENV`

`.env.example`에는 형식만 명시하고 실제 값은 커밋 금지.

## 파일 구조 (예상)
- `app/teacher/(protected)/students/page.tsx`
- `app/teacher/(protected)/imports/page.tsx`
- `app/teacher/(protected)/attendance/page.tsx`
- `app/teacher/(protected)/reports/page.tsx`
- `app/teacher/(protected)/settings/{slots,calendar}/page.tsx`
- `app/teacher/login/page.tsx`
- `app/actions/{imports,attendance,reports,settings,auth}.ts`
- `lib/{auth,date,notify,report,excel,db,audit}.ts`
- `prisma/{schema.prisma,seed.ts}`
- `middleware.ts`
- `public/{manifest.json,icons/*}`

## 백업/복구
- PostgreSQL 제공자의 백업·복원 기능을 사용하고 복원 테스트 주기와 책임자를 정한다.
- 학년도 종료 + 정해진 보존 기간 후 파기 스크립트 실행(스케줄 확정은 학교 기준 확보 후).

## 확장 여지 (구현 대상 아님)
- **Android 앱**: 동일 서버 URL을 Capacitor로 감싸는 방식. Play Store 배포 시 데이터 보안 양식·개인정보처리방침 필요.
- **Postgres 스키마 변경**: 마이그레이션 파일을 커밋하고 배포 시 `prisma migrate deploy`를 실행한다.
- **오프라인 큐**: IndexedDB에 미전송 출결 저장 후 재접속 시 재전송.

## 운영 결정 및 후속 확장
- **MVP 운영 모델**: 학교 공식 출결을 대체하지 않는 야자 운영 보조 도구. 교사 휴대폰이 주 기기이며 학교 내부망의 상시 서버에 접속한다. 최종 플랫폼은 보류.
- **MVP 입력 모델**: 선생님들이 작성한 Excel을 업로드해 학생·날짜·슬롯별 `ParticipationPlan`을 생성하고, 출결 결과가 포함된 Excel을 다운로드.
- **MVP 출결 모델**: Excel에 등록된 학생만 출결 대상에 포함. 미체크는 결석으로 자동 확정하지 않으며, 교사가 최종 상태를 기록.
- **MVP 데이터 정책**: 건강정보·증빙자료·보호자 연락처를 저장하지 않음. 학생 연락처와 설문 제출/수정시간은 교사용 내부 상세로만 저장하고 결과 Excel·CSV·감사 로그·외부 공유에서 제외한다. 불참 사유는 제한된 길이의 교사 입력으로 저장하되 민감한 상세 내용을 입력하지 않는다. 데이터는 학년도 단위 보관을 임시 기준으로 두고 학교 기준 확정 후 갱신.
- **후속 확장**: 교외 접속, 학생 신청, 교사별 계정·역할, 푸시·QR, 카카오 알림톡, 좌석·다중 반, NEIS 연동. 플랫폼 결정 후 PWA 또는 Android 배포를 진행한다.

## Excel 재업로드 정책
- 업로드는 기존 데이터의 전체 교체가 아니라 유효한 대상자의 추가·확인 작업이다.
- 이미 출결 기록이 있는 대상자는 재업로드로 삭제·덮어쓰기하지 않는다.
- 기존 대상자와 동일한 학생·날짜·슬롯 행은 중복으로 기록하지 않는다.
- Excel에서 빠진 학생은 기존 대상자와 출결 기록을 자동 삭제하지 않는다.
- 결과 Excel은 다운로드 시점의 현재 데이터로 새로 생성한다.

## 학교 확인 사항
- 학교 내부망 상시 서버 제공 여부와 서버·백업 관리 책임자.
- 데이터 보유·파기 기간 및 백업 보관 기준.
- 실제 슬롯 시간표와 지각·조퇴 판정 기준.
- 향후 공식 출결 자료로 전환할 가능성과 필요한 권한·정정 절차.
- 최종 배포 플랫폼을 PWA 또는 Android 앱 중 무엇으로 할지.
