-- Create waitlist table
CREATE TABLE appointment_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    preferred_date DATE NOT NULL,
    preferred_time TEXT NOT NULL,
    appointment_type TEXT NOT NULL,
    provider_id UUID REFERENCES providers(id),
    duration INTEGER DEFAULT 60,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'contacted', 'scheduled', 'expired', 'cancelled')),
    max_wait_days INTEGER DEFAULT 30,
    created_by_agent TEXT,
    ai_priority_score DECIMAL(3,2) DEFAULT 0.50,
    contact_attempts JSONB DEFAULT '[]',
    scheduled_appointment_id UUID REFERENCES appointments(id),
    contacted_at TIMESTAMP,
    expired_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create practice phones table
CREATE TABLE practice_phones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number TEXT UNIQUE NOT NULL,
    phone_type TEXT DEFAULT 'main' CHECK (phone_type IN ('main', 'scheduler', 'receptionist', 'emergency')),
    assigned_agent TEXT,
    voice_agent_id TEXT,
    is_active BOOLEAN DEFAULT true,
    business_hours JSONB DEFAULT '{"start":"08:00","end":"17:00","days":[1,2,3,4,5]}',
    after_hours_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create schedule optimizations table
CREATE TABLE schedule_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    optimization_type TEXT NOT NULL,
    optimization_date DATE NOT NULL,
    constraints JSONB NOT NULL,
    objectives JSONB NOT NULL,
    original_efficiency DECIMAL(5,2),
    optimized_efficiency DECIMAL(5,2),
    improvement_percent DECIMAL(5,2),
    recommended_changes JSONB,
    changes_implemented JSONB DEFAULT '[]',
    actual_outcome DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    measured_at TIMESTAMP
);

-- Create provider schedule patterns table
CREATE TABLE provider_schedule_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    time_slot TEXT NOT NULL,
    appointment_type TEXT,
    utilization_rate DECIMAL(3,2),
    no_show_rate DECIMAL(3,2),
    profitability_score DECIMAL(3,2),
    patient_satisfaction_score DECIMAL(3,2),
    recommended_booking BOOLEAN DEFAULT true,
    ai_confidence_level DECIMAL(3,2),
    learning_period_start TIMESTAMP,
    learning_period_end TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, provider_id, day_of_week, time_slot)
);

-- Create indexes for performance
CREATE INDEX idx_waitlist_tenant_status ON appointment_waitlist(tenant_id, status, priority);
CREATE INDEX idx_waitlist_preferred_date ON appointment_waitlist(preferred_date, status);
CREATE INDEX idx_schedule_optimization_date ON schedule_optimizations(tenant_id, optimization_date);
CREATE INDEX idx_provider_patterns_lookup ON provider_schedule_patterns(tenant_id, provider_id, day_of_week);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON appointment_waitlist 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_practice_phones_updated_at BEFORE UPDATE ON practice_phones 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_provider_patterns_updated_at BEFORE UPDATE ON provider_schedule_patterns 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();