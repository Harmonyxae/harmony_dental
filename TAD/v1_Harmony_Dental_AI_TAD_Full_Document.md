
# 🦷 Harmony Dental AI – Technical Architecture Document (TAD)
**Date:** June 06, 2025

---

## 🔭 Project Vision
Harmony Dental AI is a next-generation, AI-native dental operating system designed to automate and optimize clinical workflows, enhance patient communication, improve financial outcomes, and reduce administrative workload. The system is built from scratch with a modular architecture and integrates inspiration from Open Dental's data structures to accelerate development.

---

## 🧩 Core Functional Modules

### 1. AI Receptionist Agent
- Handles incoming calls via voice AI (24/7 availability).
- Books, cancels, and reschedules appointments.
- Provides clinic info, confirms insurance eligibility.
- Channels: Phone, WhatsApp, Website Widget.

### 2. AI Scheduler Agent
- Predicts no-shows using patient history + AI.
- Fills cancellations automatically.
- Balances provider workloads.
- Integrates with calendar systems.

### 3. Clinical Charting & Voice Assistant
- Real-time voice charting with SOAP note generation.
- Links to procedures and treatment plans.
- Supports multi-provider clinical entries.

### 4. AI Radiograph Analyzer
- Image recognition to identify decay, lesions, bone loss.
- Works with intraoral cameras and digital X-rays.
- Auto-suggests ADA codes for identified issues.

### 5. Billing & Insurance AI Agent
- Generates ADA codes based on procedures + AI mapping.
- Submits claims, predicts rejections, recommends fixes.
- Explains EOBs in plain English to patients.

### 6. AI Nurture & Recall Agent
- Multi-channel outreach (SMS, WhatsApp, Email, Voice).
- Reactivates lapsed patients based on behavior.
- Schedules hygiene visits, cosmetic consults.

### 7. SmileBot – Cosmetic Sales AI
- AI renders smile simulations based on selfies.
- Recommends whitening, veneers, aligners.
- Books consults directly.

### 8. Performance Intelligence Dashboard
- Tracks missed revenue, production per provider.
- Analyzes appointment utilization.
- Sends smart alerts and growth suggestions.

---

## ⚙️ Technical Stack

### Frontend
- Web: React.js
- Mobile: Flutter (cross-platform)

### Backend
- Node.js (Express) – API Layer
- Python (FastAPI) – AI microservices
- PostgreSQL – Relational DB
- Redis – Caching and task queue
- TimescaleDB – Time-series data (optional)

### AI Infrastructure
- OpenAI / GPT-4o – LLMs for messaging, notes, calls
- Whisper – Speech-to-text
- ElevenLabs – Voice synthesis
- PyTorch / YOLO – X-ray and image processing
- Google OR-Tools – Scheduling optimization

### Cloud / DevOps
- Docker + Kubernetes
- AWS / GCP
- GitHub Actions for CI/CD
- Secure APIs via HTTPS (TLS 1.3)

---

## 🔐 Security & Compliance
- HIPAA-compliant infrastructure
- Data encryption at rest (AES-256) & in transit
- Role-Based Access Control (RBAC)
- Audit trails for AI decisions
- Multi-region backups

---

## 🧱 Schema Design (Inspired by Open Dental)

### `patient`
- `id`: UUID
- `first_name`, `last_name`, `middle_initial`
- `dob`, `gender`, `phone`, `email`, `address`
- `guarantor_id` (FK)
- `clinic_id` (FK)
- `preferred_language`

### `appointment`
- `id`: UUID
- `patient_id` (FK)
- `datetime_start`, `datetime_end`
- `provider_id`, `status`, `confirmed`, `notes`
- `operatory`, `pattern`

### `procedure_log`
- `id`: UUID
- `patient_id` (FK)
- `status`, `procedure_code`, `tooth_number`, `surface`
- `note`, `date`, `amount`

### `insurance_plan`
- `id`: UUID
- `carrier_name`, `plan_name`, `group_number`
- `coverage_level`, `policy_type`, `deductible`, `max_annual`
- `notes`

### `claim_process`
- `id`: UUID
- `claim_number`, `procedure_id` (FK)
- `insurance_plan_id` (FK)
- `amount_billed`, `amount_covered`, `write_off`, `status`, `denial_reason`

### `payment`
- `id`: UUID
- `patient_id` (FK)
- `date`, `amount`, `payment_type`, `reference_id`
- `payment_plan_id` (FK, optional)

### `user`
- `id`: UUID
- `role`: enum (Admin, Dentist, Assistant, Reception, Billing)
- `email`, `password_hash`, `active`, `last_login`
- `permissions_json`

### `message_log`
- `id`: UUID
- `channel`: enum (SMS, Email, WhatsApp, Call)
- `direction`: enum (Inbound, Outbound)
- `patient_id`, `agent_id`, `content`, `timestamp`

### `smile_simulation`
- `id`: UUID
- `patient_id`, `image_before`, `image_after`, `recommendations`, `requested_treatment`, `status`

---

## 📈 AI Agent Roles (Logical Services)

- `ReceptionistAgent`: voice + booking handler
- `SchedulerAgent`: real-time optimization
- `DiagnosisAgent`: SOAP notes, AI charting, voice
- `RadiographAgent`: visual recognition
- `BillingAgent`: insurance + claim logic
- `NurtureAgent`: lead & recall campaigns
- `SmileBotAgent`: cosmetic upsell flow
- `InsightsAgent`: KPI analytics + smart alerts

---

## 💡 Open Dental Knowhow Used
- Schema inspiration: patient, appointment, procedure_log, insurance tables
- Claim logic: CDT code mapping, rejection handling
- Scheduling model: pattern, provider mapping, chair-time logic
- Permission architecture: role + access level mapping

Rewritten from scratch in a **cloud-native, AI-centric** way to break out of legacy Windows-form rigidity.

---

## 🗓 Development Phases

### Phase 1 (MVP)
- Patient management
- Appointment scheduling + AI scheduler
- Voice-based charting + SOAP
- Dashboard basic KPIs

### Phase 2
- X-ray diagnosis AI
- Billing agent + claim submission
- Patient portal (mobile app)
- Smile simulation module

### Phase 3
- Full marketing & nurture campaigns
- WhatsApp + voice follow-ups
- Marketplace integration (whitening, HarmonyX water, branding)

---

## ✅ Summary

This TAD lays out a production-ready, AI-native dental system designed to go far beyond existing practice software. By combining Open Dental’s schema wisdom with the power of multi-agent AI, Harmony Dental AI offers a modern, scalable, intelligent system purpose-built for today’s clinics.

Next step: Begin codebase setup or wireframe design depending on chosen track.
