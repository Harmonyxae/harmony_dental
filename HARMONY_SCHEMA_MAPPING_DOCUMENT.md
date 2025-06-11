# 🗂️ Harmony Dental AI – Enhanced Schema Mapping Document
**Version:** 1.0 - Open Dental to Harmony AI Conversion  
**Date:** June 06, 2025  
**Purpose:** Complete database schema transformation and AI enhancement strategy

---

## 🎯 SCHEMA PHILOSOPHY

### Core Principles
1. **Backward Compatibility**: Maintain Open Dental field compatibility for easy migration
2. **AI Enhancement**: Add agent-specific fields for learning and automation
3. **Multi-Tenant**: UUID-based tenant isolation from day 1
4. **Audit Trail**: Complete interaction logging for compliance and learning
5. **Performance**: Optimized for real-time AI agent operations

---

## 🔄 TABLE MAPPING & AI ENHANCEMENTS

### 1. 👥 PATIENT MANAGEMENT

#### Open Dental → Harmony: `patient` → `patients`

**Original Fields (Maintained):**
```sql
-- Open Dental Compatible Fields
CREATE TABLE patients (
    id UUID PRIMARY KEY,  -- Maps to PatNum
    tenant_id UUID NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    middle_initial VARCHAR(1),
    date_of_birth DATE,
    gender VARCHAR(1),
    phone_home VARCHAR(20),
    phone_wireless VARCHAR(20),
    email VARCHAR(255),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    guarantor_id UUID, -- Self-referencing for family accounts
    preferred_language VARCHAR(10) DEFAULT 'en',
    
    -- Open Dental timing fields
    date_first_visit DATE,
    date_time_deleted TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Agent Enhancement Fields
ALTER TABLE patients ADD COLUMN ai_insights JSONB DEFAULT '{}';
ALTER TABLE patients ADD COLUMN communication_preferences JSONB DEFAULT '{}';
ALTER TABLE patients ADD COLUMN agent_interaction_summary JSONB DEFAULT '{}';
ALTER TABLE patients ADD COLUMN no_show_risk_score DECIMAL(3,2) DEFAULT 0.50;
ALTER TABLE patients ADD COLUMN payment_behavior_score DECIMAL(3,2) DEFAULT 0.50;
ALTER TABLE patients ADD COLUMN treatment_acceptance_rate DECIMAL(3,2) DEFAULT 0.50;
ALTER TABLE patients ADD COLUMN last_agent_interaction TIMESTAMP;
ALTER TABLE patients ADD COLUMN preferred_appointment_times JSONB DEFAULT '{}';
ALTER TABLE patients ADD COLUMN cosmetic_interest_level DECIMAL(3,2) DEFAULT 0.00;

-- AI Insights JSON Structure:
{
  "communication_style": "formal|casual|clinical",
  "response_times": {
    "sms": "immediate|hours|days",
    "email": "immediate|hours|days",
    "calls": "answers|voicemail|avoids"
  },
  "appointment_patterns": {
    "preferred_days": ["monday", "wednesday"],
    "preferred_times": ["morning", "afternoon"],
    "typical_lead_time": 7
  },
  "treatment_history": {
    "completion_rate": 0.85,
    "cancellation_patterns": [],
    "payment_promptness": "immediate|net30|requires_followup"
  }
}

-- 2. 📅 APPOINTMENT MANAGEMENT
-- Open Dental → Harmony: appointment → appointments
-- Original Fields (Maintained):
CREATE TABLE appointments (
    id UUID PRIMARY KEY,  -- Maps to AptNum
    tenant_id UUID NOT NULL,
    patient_id UUID REFERENCES patients(id),
    provider_id UUID, -- FK to providers table
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20), -- scheduled, confirmed, completed, cancelled, no_show
    appointment_type VARCHAR(50),
    operatory VARCHAR(20),
    notes TEXT,
    pattern VARCHAR(100), -- Open Dental appointment pattern
    confirmed BOOLEAN DEFAULT FALSE,
    
    -- Open Dental timing
    date_time_stamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Scheduler Agent Fields
ALTER TABLE appointments ADD COLUMN created_by_agent VARCHAR(50);
ALTER TABLE appointments ADD COLUMN ai_confidence_score DECIMAL(3,2) DEFAULT 1.00;
ALTER TABLE appointments ADD COLUMN predicted_no_show_risk DECIMAL(3,2);
ALTER TABLE appointments ADD COLUMN auto_filled_cancellation BOOLEAN DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN scheduling_optimization_notes TEXT;
ALTER TABLE appointments ADD COLUMN patient_communication_log JSONB DEFAULT '[]';
ALTER TABLE appointments ADD COLUMN confirmation_attempts JSONB DEFAULT '[]';
ALTER TABLE appointments ADD COLUMN waitlist_priority INTEGER DEFAULT 0;

-- Patient Communication Log JSON:
[
  {
    "timestamp": "2025-06-06T10:00:00Z",
    "agent": "receptionist",
    "channel": "sms",
    "message": "Confirming your appointment tomorrow at 2pm",
    "response": "Yes, see you then!",
    "sentiment": "positive"
  }
]

-- 🦷 PROCEDURE & TREATMENT TRACKING
-- Open Dental → Harmony: procedurelog → procedures
-- Original Fields (Maintained):
CREATE TABLE procedures (
    id UUID PRIMARY KEY,  -- Maps to ProcNum
    tenant_id UUID NOT NULL,
    patient_id UUID REFERENCES patients(id),
    appointment_id UUID REFERENCES appointments(id),
    provider_id UUID,
    procedure_code VARCHAR(10), -- ADA/CDT codes
    tooth_number VARCHAR(10),
    surface VARCHAR(10),
    procedure_date DATE,
    date_entry_created DATE,
    status VARCHAR(20), -- TP (treatment plan), C (complete), etc.
    amount DECIMAL(10,2),
    base_units INTEGER DEFAULT 0,
    unit_qty INTEGER DEFAULT 1,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Billing & Diagnosis Agent Fields
ALTER TABLE procedures ADD COLUMN suggested_by_agent VARCHAR(50);
ALTER TABLE procedures ADD COLUMN ai_diagnosis_confidence DECIMAL(3,2);
ALTER TABLE procedures ADD COLUMN treatment_outcome_score DECIMAL(3,2);
ALTER TABLE procedures ADD COLUMN voice_chart_transcript TEXT;
ALTER TABLE procedures ADD COLUMN insurance_approval_probability DECIMAL(3,2);
ALTER TABLE procedures ADD COLUMN patient_acceptance_prediction DECIMAL(3,2);
ALTER TABLE procedures ADD COLUMN follow_up_required BOOLEAN DEFAULT FALSE;
ALTER TABLE procedures ADD COLUMN cosmetic_upsell_opportunity JSONB DEFAULT '{}';

-- . 💰 INSURANCE & BILLING
-- Open Dental → Harmony: claim + claimproc → claims + claim_procedures
-- Claims Table:
CREATE TABLE claims (
    id UUID PRIMARY KEY,  -- Maps to ClaimNum
    tenant_id UUID NOT NULL,
    patient_id UUID REFERENCES patients(id),
    carrier_id UUID, -- Insurance carrier
    claim_date DATE,
    date_sent DATE,
    date_received DATE,
    status VARCHAR(20), -- unsent, sent, received, etc.
    total_amount DECIMAL(10,2),
    claim_type VARCHAR(10), -- P (Primary), S (Secondary)
    
    -- AI Billing Agent Enhancements
    ai_generated BOOLEAN DEFAULT FALSE,
    predicted_approval_rate DECIMAL(3,2),
    rejection_risk_factors JSONB DEFAULT '[]',
    auto_appeal_eligible BOOLEAN DEFAULT FALSE,
    billing_agent_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Claim Procedures Table:
CREATE TABLE claim_procedures (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    claim_id UUID REFERENCES claims(id),
    procedure_id UUID REFERENCES procedures(id),
    amount_approved DECIMAL(10,2),
    amount_patient DECIMAL(10,2),
    status VARCHAR(20),
    
    -- AI Enhancements
    ai_code_suggestion VARCHAR(10),
    ai_confidence_score DECIMAL(3,2),
    denial_prediction JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 📞 COMMUNICATION & AGENT INTERACTIONS
-- New Table: agent_interactions (AI-First Design)
CREATE TABLE agent_interactions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    agent_type VARCHAR(50), -- receptionist, scheduler, billing, etc.
    patient_id UUID REFERENCES patients(id),
    appointment_id UUID REFERENCES appointments(id),
    interaction_type VARCHAR(50), -- booking, confirmation, follow_up, etc.
    channel VARCHAR(20), -- voice, sms, whatsapp, email, web_chat
    
    -- Content and Analysis
    content JSONB, -- Full conversation/interaction data
    transcript TEXT, -- For voice interactions
    sentiment_score DECIMAL(3,2),
    confidence_score DECIMAL(3,2),
    success_outcome BOOLEAN,
    
    -- Learning and Feedback
    human_override BOOLEAN DEFAULT FALSE,
    human_feedback TEXT,
    learning_tags JSONB DEFAULT '[]',
    
    -- Timing
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Content JSONB Structure:
{
  "conversation": [
    {
      "speaker": "agent",
      "message": "Hi! This is Harmony calling to confirm your appointment tomorrow.",
      "timestamp": "2025-06-06T14:30:00Z"
    },
    {
      "speaker": "patient", 
      "message": "Yes, I'll be there at 2pm",
      "timestamp": "2025-06-06T14:30:15Z"
    }
  ],
  "intent_detected": "appointment_confirmation",
  "entities_extracted": {
    "appointment_time": "2pm",
    "confirmation_status": "confirmed"
  },
  "action_taken": "marked_appointment_confirmed"
}

-- 6. 🧠 AI AGENT MEMORY & LEARNING
-- New Table: agent_memory (RAG System Foundation)
CREATE TABLE agent_memory (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    agent_type VARCHAR(50),
    memory_type VARCHAR(30), -- patient_specific, practice_specific, cross_practice
    context_id UUID, -- patient_id, provider_id, or NULL for practice-wide
    
    -- Memory Content
    memory_key VARCHAR(255), -- e.g., "preferred_appointment_times", "insurance_behavior"
    memory_value JSONB,
    confidence_level DECIMAL(3,2),
    usage_count INTEGER DEFAULT 1,
    success_rate DECIMAL(3,2) DEFAULT 1.00,
    
    -- Learning Metadata
    learned_from_interaction_id UUID,
    last_reinforced TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexing for fast retrieval
    UNIQUE(tenant_id, agent_type, memory_type, context_id, memory_key)
);

-- 7. 📊 AGENT FEEDBACK & LEARNING
-- New Table: agent_feedback (Human-in-the-Loop Training)
CREATE TABLE agent_feedback (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    agent_type VARCHAR(50),
    interaction_id UUID REFERENCES agent_interactions(id),
    
    -- Feedback Details
    feedback_type VARCHAR(20), -- thumbs_up, thumbs_down, correction, escalation
    feedback_value INTEGER, -- -1, 0, 1 for simple feedback
    correction_data JSONB, -- What the human said should happen instead
    human_user_id UUID, -- Which staff member provided feedback
    
    -- Learning Application
    applied_to_memory BOOLEAN DEFAULT FALSE,
    improvement_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. 🏥 PRACTICE & PROVIDER MANAGEMENT
-- Enhanced Provider Table:
CREATE TABLE providers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    specialty VARCHAR(100),
    license_number VARCHAR(50),
    
    -- AI Agent Learning Fields
    treatment_preferences JSONB DEFAULT '{}',
    coding_patterns JSONB DEFAULT '{}',
    schedule_preferences JSONB DEFAULT '{}',
    voice_recognition_profile JSONB DEFAULT '{}',
    
    -- Performance Tracking
    avg_treatment_time JSONB DEFAULT '{}', -- by procedure type
    patient_satisfaction_score DECIMAL(3,2),
    production_efficiency_score DECIMAL(3,2),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 🔄 DATA MIGRATION STRATEGY
-- Phase 1: Core Data Import
-- Priority Order:

-- Patients → Migrate demographics, create AI insight placeholders
-- Providers → Setup profiles with learning field defaults
-- Appointments → Import history, calculate initial risk scores
-- Procedures → Import treatment history, setup AI enhancement fields
-- Insurance/Claims → Import billing history for AI learning
-- Migration Script Structure:
# Example migration approach
class OpenDentalMigrator:
    def __init__(self, od_connection, harmony_connection):
        self.od = od_connection
        self.harmony = harmony_connection
    
    def migrate_patients(self, tenant_id):
        # Extract from Open Dental
        od_patients = self.od.execute("SELECT * FROM patient WHERE PatStatus = 0")
        
        # Transform and enhance for Harmony
        for patient in od_patients:
            harmony_patient = {
                'id': str(uuid4()),
                'tenant_id': tenant_id,
                'first_name': patient['FName'],
                'last_name': patient['LName'],
                # ... other fields
                
                # AI Enhancement defaults
                'ai_insights': {},
                'no_show_risk_score': 0.50,  # Neutral starting point
                'treatment_acceptance_rate': 0.50
            }
            
            self.harmony.insert('patients', harmony_patient)

-- 🧠 AI AGENT DATA PATTERNS
-- Receptionist Agent Data Flow:
    -- 1- Input: Patient call/message via agent_interactions
    -- 2- Memory Lookup: Query agent_memory for patient preferences
    -- 3- Action: Book appointment in appointments table
    -- 4- Learning: Update agent_memory based on success/failure
    -- 5- Feedback: Log outcome in agent_feedback if human override

-- Scheduler Agent Data Flow:
    -- 1- Input: Cancellation notification
    -- 2- Analysis: Query patients for no-show risk scores
    -- 3- Optimization: Update appointments with waitlist priority
    -- 4- Learning: Track success in agent_memory

-- Billing Agent Data Flow:
    -- 1- Input: Completed procedure from procedures
    -- 2- AI Enhancement: Predict approval probability
    -- 3- Claim Generation: Create claims and claim_procedures
    -- 4- Learning: Track approval outcomes for future predictions

-- 📊 PERFORMANCE OPTIMIZATION
    -- Indexing Strategy:

    -- Patient lookup optimization
    CREATE INDEX idx_patients_tenant_phone ON patients(tenant_id, phone_wireless);
    CREATE INDEX idx_patients_tenant_email ON patients(tenant_id, email);

    -- Appointment scheduling optimization  
    CREATE INDEX idx_appointments_provider_date ON appointments(provider_id, start_time);
    CREATE INDEX idx_appointments_status_date ON appointments(status, start_time);

    -- AI memory fast retrieval
    CREATE INDEX idx_agent_memory_lookup ON agent_memory(tenant_id, agent_type, memory_type, context_id);

    -- Agent interaction analysis
    CREATE INDEX idx_agent_interactions_patient ON agent_interactions(patient_id, created_at);
    CREATE INDEX idx_agent_interactions_type ON agent_interactions(agent_type, interaction_type, created_at);

    -- Query Optimization Examples:
    -- Fast patient lookup for Receptionist Agent
    SELECT p.*, am.memory_value as preferences 
    FROM patients p
    LEFT JOIN agent_memory am ON (
        am.context_id = p.id 
        AND am.agent_type = 'receptionist' 
        AND am.memory_key = 'communication_preferences'
    )
    WHERE p.tenant_id = ? AND p.phone_wireless = ?;

    -- Scheduler Agent: Find optimal appointment slots
    SELECT provider_id, start_time, end_time
    FROM appointments 
    WHERE tenant_id = ? 
        AND status = 'scheduled'
        AND start_time BETWEEN ? AND ?
    ORDER BY provider_id, start_time;

-- 🔒 SECURITY & COMPLIANCE CONSIDERATIONS
-- Data Encryption:
 -- PII Fields: All patient names, addresses, phone numbers encrypted at rest
 -- AI Memory: Patient-specific memories encrypted with tenant key
 -- Communication Logs: Full transcript encryption required

-- Audit Trail:
-- Every table includes audit fields
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW(),
created_by_user_id UUID,
last_modified_by_user_id UUID

-- Multi-Tenant Security:
    -- Row Level Security: Every query filtered by tenant_id
    -- API Layer: Tenant validation on every request
    -- Agent Memory: Tenant isolation in RAG system

-- 🎯 IMPLEMENTATION PRIORITIES
-- Sprint 1-2: Foundation
    -- Core patient, appointment, procedure tables
    -- Basic multi-tenant architecture
    -- Open Dental import scripts
-- Sprint 3-4: AI Enhancement
    -- Agent interaction logging
    -- Basic memory system
    -- Receptionist agent integration
-- Sprint 5-6: Learning Systems
    -- Feedback mechanisms
    -- Memory optimization
    -- Cross-agent data sharing
-- Sprint 7-8: Advanced Features
    -- Predictive scoring
    -- Performance analytics
    -- Advanced AI enhancements

-- This schema mapping provides the foundation for building Harmony's AI-first dental practice management system while maintaining compatibility with existing Open Dental installations.

-- Next Steps:

-- Review and validate schema design
-- Create database migration scripts
-- Implement tenant provisioning system
-- Build initial AI agent data access patterns

-- Last Updated: June 06, 2025
-- Review Schedule: Weekly during development



This comprehensive schema mapping document provides:

1. **Complete table mappings** from Open Dental to Harmony with AI enhancements
2. **Detailed field specifications** for agent learning and automation
3. **JSON structure examples** for complex AI data storage
4. **Migration strategy** with priorities and sample code
5. **Performance optimization** with indexing and query patterns
6. **Security considerations** for HIPAA compliance
7. **Implementation roadmap** with sprint priorities

This gives you a concrete foundation to start building the database layer and AI agent integration points. Would you like me to dive deeper into any specific aspect or move on to the next phase of development?
This comprehensive schema mapping document provides:

1. **Complete table mappings** from Open Dental to Harmony with AI enhancements
2. **Detailed field specifications** for agent learning and automation
3. **JSON structure examples** for complex AI data storage
4. **Migration strategy** with priorities and sample code
5. **Performance optimization** with indexing and query patterns
6. **Security considerations** for HIPAA compliance
7. **Implementation roadmap** with sprint priorities

This gives you a concrete foundation to start building the database layer and AI agent integration points. Would you like me to dive deeper into any specific aspect or move on to the next phase of development?