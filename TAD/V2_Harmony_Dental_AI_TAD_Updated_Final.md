
# 🦷 Harmony Dental AI – Technical Architecture Document (TAD)
**Version:** Final – Scalable AI-First Platform  
**Date:** June 06, 2025

---

## 🔭 Vision

Harmony Dental AI is not practice management software. It’s a **digital workforce** built to solve one urgent problem: **you can’t find or retain enough staff** to run your clinic, but your business can’t wait.

Harmony is a cloud-native, AI-driven, modular platform designed to replace your front desk, billing team, scheduler, treatment coordinator, office manager, and cosmetic consultant — using AI agents that think, act, and adapt like a human team.

---

## 🧩 Core System Modules (with AI Agents)

### 1. AI Receptionist Agent
- 24/7 voice and WhatsApp handling
- Books, reschedules, confirms appointments
- Answers patient questions and logs all interactions

### 2. AI Scheduler Agent
- Auto-fills cancellations
- Predicts no-shows based on history
- Balances provider workloads
- Suggests optimal chair time configurations

### 3. Voice Charting & Diagnosis Agent
- Live SOAP note generation from doctor voice
- Suggests procedures based on findings
- Syncs to treatment plans and billing

### 4. AI Radiograph Agent
- Analyzes X-rays for decay, lesions, bone loss
- Highlights risk zones with % confidence
- Suggests treatment codes

### 5. Billing & Insurance Agent
- Suggests correct ADA/CDT codes
- Submits clean claims to payers
- Predicts denials
- Explains EOBs in plain language to patients

### 6. AI Nurturing Agent
- Reactivates lapsed patients
- Runs recall and follow-up sequences
- Channels: SMS, email, WhatsApp, voice

### 7. SmileBot (Cosmetic Sales Agent)
- Generates AI-based smile simulations
- Handles whitening, veneers, aligners
- Follows up automatically to book consults

### 8. Intelligence Agent (Virtual Office Manager)
- Monitors hygiene underutilization
- Tracks revenue leakage
- Sends production alerts
- Flags missed opportunities

---

## 🧠 Architecture Overview

### Frontend
- Web App: React.js (staff)
- Mobile App: Flutter (patient + provider companion)

### Backend
- Node.js (Express) – REST APIs
- Python (FastAPI) – AI logic microservices
- PostgreSQL – Core relational DB
- Redis – Caching + background jobs
- S3 – X-ray / media storage

### AI Stack
- OpenAI GPT-4o – LLM agent intelligence, SOAP, conversations
- Whisper – Voice to text
- ElevenLabs – AI voice (for calls)
- YOLOv8 + CNNs – Radiograph analysis
- Google OR-Tools – Scheduling engine

### DevOps
- Docker + Kubernetes
- AWS or GCP
- CI/CD via GitHub Actions
- Audit logging + zero-trust architecture

---

## 🔐 Security & Compliance
- HIPAA compliant by design
- AES-256 encryption (at rest)
- TLS 1.3 (in transit)
- Role-based access control
- Consent-driven patient messaging
- Explainable AI logs (for claim submission & diagnosis)

---

## 🧱 Data Schema Blueprint (Inspired by Open Dental)

### `patients`
- `id` (UUID), `first_name`, `last_name`, `dob`, `gender`
- `contact_info`: phone, email, address
- `insurance_id` (FK), `preferred_language`
- `created_by_agent`, `last_active_at`

### `appointments`
- `id`, `patient_id`, `provider_id`
- `start_time`, `end_time`, `status`
- `operatory_id`, `confirmation_status`, `notes`

### `procedures`
- `id`, `patient_id`, `appointment_id`, `code`, `status`
- `tooth_number`, `surface`, `note`, `amount`, `created_by`

### `claims`
- `id`, `procedure_id`, `insurance_plan_id`, `amount_billed`
- `amount_paid`, `write_off`, `status`, `denial_reason`, `resolved`

### `insurance_plans`
- `id`, `carrier`, `group_number`, `coverage_rules`, `max_annual`, `deductible`

### `payments`
- `id`, `patient_id`, `amount`, `date`, `method`, `reference`

### `treatment_plans`
- `id`, `patient_id`, `procedures[]`, `status`, `created_by`, `follow_up_agent_id`

### `smile_simulations`
- `id`, `patient_id`, `before_img`, `after_img`, `recommendations`, `conversion_status`

### `agent_logs`
- `id`, `agent_type`, `action`, `timestamp`, `patient_id`, `outcome`

### `kpi_snapshots`
- `id`, `date`, `metric`, `value`, `variance`, `alert_triggered`

---

## 🗂 API Services (Key Endpoints)

- `/appointments/create`, `/appointments/fill-gaps`
- `/billing/code`, `/billing/submit`, `/billing/explain`
- `/xray/analyze`, `/smilebot/generate`
- `/patients/follow-up`, `/patients/reactivate`
- `/dashboard/kpis`, `/dashboard/alerts`

---

## 📈 Roadmap: Modular Deployment Strategy

### Phase 1 (0–60 days)
- Core: Patient, Appointment, SOAP + Scheduler
- Agents: Receptionist, Scheduler, Diagnosis, Billing
- MVP UI + voice workflows

### Phase 2 (60–120 days)
- SmileBot, Nurture Agent, KPI Dashboard
- Radiograph AI + Real-time Alerts
- Claim tracking + Smart payment plans

### Phase 3 (120–180 days)
- Full AI Office Manager with Insights
- Supply inventory tracker (smart restocking)
- DSO-style multi-location analytics

---

## 🧬 Open Dental – What We Reused & Rebuilt

| Area | Borrowed from Open Dental | Harmony Enhancements |
|------|----------------------------|------------------------|
| Patient structure | ✅ Names, DOB, insurance linkage | ✅ Added AI status, language, engagement score |
| Appointment logic | ✅ Pattern-based chair time | ✅ AI-fill, priority rebalancing, load forecasting |
| Claim structure | ✅ Status, write-offs, EOB linkage | ✅ AI rejection prediction + auto-fix logic |
| CDT code structure | ✅ ADA compliance | ✅ Intelligent code suggestions based on speech + image |
| User roles | ✅ RBAC + security model | ✅ Agent-specific action permissions and logging |
| Treatment planning | ✅ Procedure linking | ✅ Smart follow-ups, automated conversion tracking |

---

## ✅ Summary

Harmony Dental AI is a full-scale AI-native dental operating system. It reduces your clinic’s dependence on hard-to-hire staff by assigning intelligent agents to cover:

- Reception
- Scheduling
- Billing & Insurance
- Cosmetic Consults
- Patient Follow-ups
- KPI Management
- Treatment Coordination

Built from the ground up with best-in-class AI and inspired by Open Dental’s maturity — Harmony is designed for modern clinics that want to scale smarter, not harder.

