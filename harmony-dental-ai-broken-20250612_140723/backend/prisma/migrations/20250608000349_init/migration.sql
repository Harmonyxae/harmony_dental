-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "planType" TEXT NOT NULL DEFAULT 'starter',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" TIMESTAMP(3),
    "aiConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleInitial" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "phoneHome" TEXT,
    "phoneWireless" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "guarantorId" TEXT,
    "dateFirstVisit" TIMESTAMP(3),
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "aiInsights" JSONB NOT NULL DEFAULT '{}',
    "communicationPreferences" JSONB NOT NULL DEFAULT '{}',
    "agentInteractionSummary" JSONB NOT NULL DEFAULT '{}',
    "noShowRiskScore" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "paymentBehaviorScore" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "treatmentAcceptanceRate" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "lastAgentInteraction" TIMESTAMP(3),
    "preferredAppointmentTimes" JSONB NOT NULL DEFAULT '{}',
    "cosmeticInterestLevel" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "specialty" TEXT,
    "licenseNumber" TEXT,
    "npiNumber" TEXT,
    "treatmentPreferences" JSONB NOT NULL DEFAULT '{}',
    "codingPatterns" JSONB NOT NULL DEFAULT '{}',
    "schedulePreferences" JSONB NOT NULL DEFAULT '{}',
    "voiceRecognitionProfile" JSONB NOT NULL DEFAULT '{}',
    "avgTreatmentTime" JSONB NOT NULL DEFAULT '{}',
    "patientSatisfactionScore" DECIMAL(3,2),
    "productionEfficiencyScore" DECIMAL(3,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "appointmentType" TEXT,
    "operatory" TEXT,
    "notes" TEXT,
    "pattern" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdByAgent" TEXT,
    "aiConfidenceScore" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "predictedNoShowRisk" DECIMAL(3,2),
    "autoFilledCancellation" BOOLEAN NOT NULL DEFAULT false,
    "schedulingOptimizationNotes" TEXT,
    "patientCommunicationLog" JSONB NOT NULL DEFAULT '[]',
    "confirmationAttempts" JSONB NOT NULL DEFAULT '[]',
    "waitlistPriority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "providerId" TEXT,
    "procedureCode" TEXT NOT NULL,
    "toothNumber" TEXT,
    "surface" TEXT,
    "procedureDate" TIMESTAMP(3) NOT NULL,
    "dateEntryCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "baseUnits" INTEGER NOT NULL DEFAULT 0,
    "unitQty" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "suggestedByAgent" TEXT,
    "aiDiagnosisConfidence" DECIMAL(3,2),
    "treatmentOutcomeScore" DECIMAL(3,2),
    "voiceChartTranscript" TEXT,
    "insuranceApprovalProbability" DECIMAL(3,2),
    "patientAcceptancePrediction" DECIMAL(3,2),
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "cosmeticUpsellOpportunity" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_interactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "patientId" TEXT,
    "appointmentId" TEXT,
    "interactionType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "transcript" TEXT,
    "sentimentScore" DECIMAL(3,2),
    "confidenceScore" DECIMAL(3,2) NOT NULL,
    "successOutcome" BOOLEAN,
    "humanOverride" BOOLEAN NOT NULL DEFAULT false,
    "humanFeedback" TEXT,
    "learningTags" JSONB NOT NULL DEFAULT '[]',
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_memory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "contextId" TEXT,
    "memoryKey" TEXT NOT NULL,
    "memoryValue" JSONB NOT NULL,
    "confidenceLevel" DECIMAL(3,2) NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "successRate" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "learnedFromInteractionId" TEXT,
    "lastReinforced" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "feedbackValue" INTEGER,
    "correctionData" JSONB,
    "humanUserId" TEXT,
    "appliedToMemory" BOOLEAN NOT NULL DEFAULT false,
    "improvementNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultPrompt" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_customizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "customPrompt" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastModifiedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_customizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_waitlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "preferredDate" TIMESTAMP(3) NOT NULL,
    "preferredTime" TEXT NOT NULL,
    "appointmentType" TEXT NOT NULL,
    "providerId" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxWaitDays" INTEGER NOT NULL DEFAULT 30,
    "createdByAgent" TEXT,
    "aiPriorityScore" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "contactAttempts" JSONB NOT NULL DEFAULT '[]',
    "scheduledAppointmentId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_phones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "phoneType" TEXT NOT NULL DEFAULT 'main',
    "assignedAgent" TEXT,
    "voiceAgentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "businessHours" JSONB NOT NULL DEFAULT '{"start":"08:00","end":"17:00","days":[1,2,3,4,5]}',
    "afterHoursMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_optimizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "optimizationType" TEXT NOT NULL,
    "optimizationDate" TIMESTAMP(3) NOT NULL,
    "constraints" JSONB NOT NULL,
    "objectives" JSONB NOT NULL,
    "originalEfficiency" DECIMAL(5,2) NOT NULL,
    "optimizedEfficiency" DECIMAL(5,2) NOT NULL,
    "improvementPercent" DECIMAL(5,2) NOT NULL,
    "recommendedChanges" JSONB NOT NULL,
    "changesImplemented" JSONB NOT NULL DEFAULT '[]',
    "actualOutcome" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "measuredAt" TIMESTAMP(3),

    CONSTRAINT "schedule_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_schedule_patterns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "appointmentType" TEXT,
    "utilizationRate" DECIMAL(3,2) NOT NULL,
    "noShowRate" DECIMAL(3,2) NOT NULL,
    "profitabilityScore" DECIMAL(3,2) NOT NULL,
    "patientSatisfactionScore" DECIMAL(3,2),
    "recommendedBooking" BOOLEAN NOT NULL DEFAULT true,
    "aiConfidenceLevel" DECIMAL(3,2) NOT NULL,
    "learningPeriodStart" TIMESTAMP(3) NOT NULL,
    "learningPeriodEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_schedule_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "patients_tenantId_phoneWireless_idx" ON "patients"("tenantId", "phoneWireless");

-- CreateIndex
CREATE INDEX "patients_tenantId_email_idx" ON "patients"("tenantId", "email");

-- CreateIndex
CREATE INDEX "patients_tenantId_lastName_firstName_idx" ON "patients"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "appointments_tenantId_startTime_idx" ON "appointments"("tenantId", "startTime");

-- CreateIndex
CREATE INDEX "appointments_providerId_startTime_idx" ON "appointments"("providerId", "startTime");

-- CreateIndex
CREATE INDEX "appointments_status_startTime_idx" ON "appointments"("status", "startTime");

-- CreateIndex
CREATE INDEX "procedures_tenantId_procedureDate_idx" ON "procedures"("tenantId", "procedureDate");

-- CreateIndex
CREATE INDEX "procedures_patientId_procedureDate_idx" ON "procedures"("patientId", "procedureDate");

-- CreateIndex
CREATE INDEX "agent_interactions_tenantId_agentType_createdAt_idx" ON "agent_interactions"("tenantId", "agentType", "createdAt");

-- CreateIndex
CREATE INDEX "agent_interactions_patientId_createdAt_idx" ON "agent_interactions"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_memory_tenantId_agentType_memoryType_idx" ON "agent_memory"("tenantId", "agentType", "memoryType");

-- CreateIndex
CREATE UNIQUE INDEX "agent_memory_tenantId_agentType_memoryType_contextId_memory_key" ON "agent_memory"("tenantId", "agentType", "memoryType", "contextId", "memoryKey");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_customizations_tenantId_templateId_key" ON "prompt_customizations"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "appointment_waitlist_tenantId_status_priority_idx" ON "appointment_waitlist"("tenantId", "status", "priority");

-- CreateIndex
CREATE INDEX "appointment_waitlist_preferredDate_status_idx" ON "appointment_waitlist"("preferredDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "practice_phones_phoneNumber_key" ON "practice_phones"("phoneNumber");

-- CreateIndex
CREATE INDEX "schedule_optimizations_tenantId_optimizationDate_idx" ON "schedule_optimizations"("tenantId", "optimizationDate");

-- CreateIndex
CREATE UNIQUE INDEX "provider_schedule_patterns_tenantId_providerId_dayOfWeek_ti_key" ON "provider_schedule_patterns"("tenantId", "providerId", "dayOfWeek", "timeSlot");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "agent_interactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_customizations" ADD CONSTRAINT "prompt_customizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_customizations" ADD CONSTRAINT "prompt_customizations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_scheduledAppointmentId_fkey" FOREIGN KEY ("scheduledAppointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_phones" ADD CONSTRAINT "practice_phones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_optimizations" ADD CONSTRAINT "schedule_optimizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_schedule_patterns" ADD CONSTRAINT "provider_schedule_patterns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_schedule_patterns" ADD CONSTRAINT "provider_schedule_patterns_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
