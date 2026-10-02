CREATE TYPE "StudySlot" AS ENUM ('OJA', 'YAJA', 'SIMJA');
CREATE TYPE "AttState" AS ENUM ('UNCHECKED', 'PRESENT', 'LATE', 'LEAVE_EARLY', 'ABSENT', 'EXCUSED');
CREATE TYPE "AbsenceCategory" AS ENUM ('PERSONAL', 'OFFICIAL', 'OTHER');
CREATE TYPE "CalendarReason" AS ENUM ('HOLIDAY', 'EXAM', 'OTHER');

CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "studentNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classroom" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact" TEXT,
    "surveySubmittedAt" TEXT,
    "surveyUpdatedAt" TEXT,
    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlotConfig" (
    "id" TEXT NOT NULL,
    "slot" "StudySlot" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "lateThresholdMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "SlotConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" "CalendarReason" NOT NULL,
    "memo" TEXT,
    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParticipationPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "slot" "StudySlot" NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParticipationPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "participationPlanId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "state" "AttState" NOT NULL DEFAULT 'UNCHECKED',
    "absenceCategory" "AbsenceCategory",
    "absenceNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Student_studentNo_key" ON "Student"("studentNo");
CREATE UNIQUE INDEX "SlotConfig_slot_key" ON "SlotConfig"("slot");
CREATE UNIQUE INDEX "CalendarException_date_key" ON "CalendarException"("date");
CREATE INDEX "ParticipationPlan_date_slot_idx" ON "ParticipationPlan"("date", "slot");
CREATE UNIQUE INDEX "ParticipationPlan_studentId_date_slot_key" ON "ParticipationPlan"("studentId", "date", "slot");
CREATE UNIQUE INDEX "Attendance_participationPlanId_key" ON "Attendance"("participationPlanId");

ALTER TABLE "ParticipationPlan" ADD CONSTRAINT "ParticipationPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipationPlan" ADD CONSTRAINT "ParticipationPlan_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_participationPlanId_fkey" FOREIGN KEY ("participationPlanId") REFERENCES "ParticipationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
