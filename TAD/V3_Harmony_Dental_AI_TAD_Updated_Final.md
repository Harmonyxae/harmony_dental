
# 🦷 Harmony Dental AI – Technical Architecture Document (TAD)
**Version:** Final – Scalable AI-First Platform  
**Date:** June 07, 2025

---

## 🔭 Vision

Harmony Dental AI is a cloud-native, AI-first dental operating system designed to reduce clinic dependence on human staff by deploying intelligent, continuously learning agents across every workflow — from reception to insurance, from diagnosis to cosmetic upsells.

---

## 🧩 Core System Modules (AI Agent-Driven)

### 1. AI Receptionist Agent
- 24/7 voice and **SMS/MMS** (not WhatsApp)
- Manages booking, rescheduling, confirmations
- Answers questions, logs all interactions
- **Prompt editable from UI**, clinic can customize agent tone and script

### 2. AI Scheduler Agent
- Fills cancellations automatically
- Predicts no-shows using historic + behavioral patterns
- Adjusts provider utilization dynamically

### 3. Voice Charting & Diagnosis Agent
- Doctor speaks → SOAP note + procedure codes
- Recommends CDT codes
- Learns provider preferences over time

### 4. AI Radiograph Agent
- Analyzes intraoral/X-ray images
- Identifies decay, infection, bone loss
- Auto-highlights affected areas on odontogram

### 5. Billing & Insurance Agent
- Suggests ADA CDT codes
- Submits claims
- Predicts denials
- Escalates to human when confidence is low

### 6. AI Nurturing Agent
- Runs reactivation campaigns
- Uses SMS, email, and voice outreach
- Responds to engagement and follows up automatically

### 7. SmileBot (Cosmetic Agent)
- Creates smile simulations
- Recommends whitening/veneers
- Follows up to book cosmetic consults

### 8. Intelligence Agent (Virtual Office Manager)
- Tracks KPI metrics
- Detects hygiene underutilization
- Flags lost revenue, production gaps

---

## 🧠 Architecture Overview

### Frontend
- React.js (web)
- Flutter (mobile)

### Backend
- Node.js + Express (API layer)
- Python + FastAPI (AI microservices)
- PostgreSQL (relational DB)
- Redis (queue + cache)
- S3 (image/media storage)

### AI & Agent Stack
- OpenAI GPT-4o (LLM for all agents)
- Whisper (voice input)
- ElevenLabs (voice synthesis)
- YOLOv8/CNN (image/X-ray analysis)
- Google OR-Tools (scheduling logic)

### DevOps
- Docker + Kubernetes
- AWS or GCP
- GitHub Actions (CI/CD)
- Full audit logging
- Zero-trust security model

---

## 🔐 Security & Compliance

- HIPAA compliant design
- AES-256 encryption at rest, TLS 1.3 in transit
- Role-based access control
- Consent-tracked agent communication
- Explainable AI decisions for claims and diagnosis
- CDT licensed integration ready
- Stripe/Braintree for payment processing

---

## 🧱 Data Schema Blueprint

Includes all Open Dental core tables, extended with Harmony-native AI fields.

**Key Additions:**
- `agent_prompts`: per-practice editable prompts (stored per agent role)
- `agent_memory`: agent-specific long-term context
- `confidence_score`: AI decision confidence tracker
- `agent_feedback_log`: thumbs up/down, override reason, resolution

---

## 📂 Payment Handling

- **Payment Gateway:** Stripe or Braintree
- Stored tokens for recurring billing
- Support for payment plans (installments)
- AI-powered payment follow-up

---

## 📈 Development Roadmap

### Phase 1 (0–60 days)
- Database + import from Open Dental
- MVP UI
- Receptionist Agent + Scheduler Agent + Billing Agent

### Phase 2 (60–120 days)
- Diagnosis + Radiograph Agents
- SmileBot
- Stripe integration
- KPI dashboard

### Phase 3 (120–180 days)
- Full Office Manager Agent
- DSO features (multi-clinic)
- Marketing campaign composer

---

## 🧬 Open Dental Mapped Features

| Open Dental Feature | Harmony Equivalent |
|---------------------|--------------------|
| patient             | patients + ai_insights |
| appointment         | appointments + ai_notes |
| claim / claimproc   | claims + confidence + rejection analysis |
| payment             | payments + payment_plan_linked |
| insplan / carrier   | insurance_plans + denial pattern learning |
| commlog             | communication_logs with NLP tagging |
| alert / automation  | agent_escalations + review queues |

---
## ✅ Summary

Harmony is a next-gen AI operating system for dental clinics:

- Voice-first
- Staff-replacing
- AI-learning with memory
- Modular deployment
- Compliant, scalable, customizable

With editable prompts, smart fallback logic, and Stripe/Braintree integration — Harmony is designed for **real adoption, real ROI, and real learning**.


## add admin portal so i can activate agnets for useres based on the package they bought a long of chekcing payment.. 