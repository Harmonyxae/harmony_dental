import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestPatient() {
  try {
    console.log('🏥 Creating comprehensive test patient...');
    
    // Create test patient with all details
    const patient = await prisma.patient.create({
      data: {
        tenantId: 'f4cf487a-dd82-431a-8444-10752e42acbb', // Your tenant ID
        firstName: 'John',
        lastName: 'Smith',
        middleInitial: 'M',
        dateOfBirth: new Date('1985-03-15'),
        gender: 'M',
        phoneWireless: '+1 (555) 123-4567',
        phoneHome: '+1 (555) 123-4568',
        email: 'john.smith@email.com',
        addressLine1: '123 Main Street',
        addressLine2: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        preferredLanguage: 'en',
        
        // AI Insights with medical history
        aiInsights: {
          emergencyContact: {
            name: 'Jane Smith',
            relationship: 'Spouse',
            phone: '+1 (555) 123-4569',
            email: 'jane.smith@email.com'
          },
          medicalHistory: {
            conditions: ['Hypertension', 'Type 2 Diabetes'],
            allergies: ['Penicillin', 'Shellfish'],
            medications: ['Metformin 500mg', 'Lisinopril 10mg'],
            lastPhysical: '2024-06-01',
            smokingStatus: 'Never',
            alcoholUse: 'Occasional'
          },
          dentalHistory: {
            lastCleaning: '2024-06-01',
            brushingFrequency: 'Twice daily',
            flossingFrequency: 'Daily',
            previousWork: ['Crown on tooth 14', 'Filling on tooth 7']
          }
        },
        
        communicationPreferences: {
          smsEnabled: true,
          emailEnabled: true,
          callEnabled: true,
          appointmentReminders: true,
          treatmentUpdates: true
        }
      }
    });

    // Create insurance record
    await prisma.insurance.create({
      data: {
        patientId: patient.id,
        tenantId: patient.tenantId,
        isPrimary: true,
        insuranceCompany: 'Delta Dental PPO',
        groupNumber: 'DEN001',
        memberNumber: 'JS123456789',
        subscriberName: 'John M Smith',
        subscriberDOB: patient.dateOfBirth,
        relationToPatient: 'SELF',
        annualMaximum: 1500.00,
        annualUsed: 650.00,
        deductible: 100.00,
        deductibleMet: 75.00,
        preventiveCoverage: 100,
        basicCoverage: 80,
        majorCoverage: 50,
        orthodonticCoverage: 0,
        effectiveDate: new Date('2024-01-01'),
        expirationDate: new Date('2024-12-31'),
        isActive: true
      }
    });

    // Create visit record
    const visit = await prisma.visit.create({
      data: {
        patientId: patient.id,
        tenantId: patient.tenantId,
        visitDate: new Date('2024-12-01T10:00:00Z'),
        visitType: 'CLEANING',
        chiefComplaint: 'Routine cleaning and checkup',
        bloodPressure: '120/80',
        temperature: '98.6°F',
        heartRate: '72',
        weight: '175 lbs',
        medicalConditions: JSON.stringify(['Hypertension', 'Type 2 Diabetes']),
        allergies: JSON.stringify(['Penicillin', 'Shellfish']),
        medications: JSON.stringify(['Metformin 500mg', 'Lisinopril 10mg']),
        clinicalNotes: 'Patient presents for routine cleaning. No acute concerns.',
        diagnosis: 'Healthy periodontium, no caries detected',
        treatmentPlan: 'Continue regular 6-month cleanings',
        status: 'COMPLETED'
      }
    });

    // Create treatments
    await prisma.treatment.create({
      data: {
        patientId: patient.id,
        visitId: visit.id,
        tenantId: patient.tenantId,
        treatmentCode: 'D1110',
        treatmentName: 'Adult Prophylaxis',
        description: 'Routine dental cleaning',
        feeScheduled: 150.00,
        feeActual: 150.00,
        insurancePortion: 150.00,
        patientPortion: 0.00,
        status: 'COMPLETED',
        completedAt: visit.visitDate
      }
    });

    await prisma.treatment.create({
      data: {
        patientId: patient.id,
        visitId: visit.id,
        tenantId: patient.tenantId,
        treatmentCode: 'D0150',
        treatmentName: 'Comprehensive Oral Evaluation',
        description: 'Complete oral examination',
        feeScheduled: 85.00,
        feeActual: 85.00,
        insurancePortion: 85.00,
        patientPortion: 0.00,
        status: 'COMPLETED',
        completedAt: visit.visitDate
      }
    });

    // Create transactions
    await prisma.transaction.create({
      data: {
        patientId: patient.id,
        tenantId: patient.tenantId,
        type: 'CHARGE',
        amount: 235.00,
        description: 'Cleaning + Examination',
        status: 'COMPLETED',
        processedAt: visit.visitDate
      }
    });

    await prisma.transaction.create({
      data: {
        patientId: patient.id,
        tenantId: patient.tenantId,
        type: 'PAYMENT',
        amount: 235.00,
        description: 'Insurance Payment - Delta Dental',
        paymentMethod: 'INSURANCE',
        claimNumber: 'CLM-2024-001',
        status: 'COMPLETED',
        processedAt: new Date('2024-12-05T00:00:00Z')
      }
    });

    // Create communications
    await prisma.communication.create({
      data: {
        patientId: patient.id,
        tenantId: patient.tenantId,
        type: 'SMS',
        direction: 'OUTBOUND',
        content: 'Hi John! This is a reminder about your dental cleaning appointment tomorrow at 10:00 AM. Please reply CONFIRM to confirm.',
        phoneNumber: patient.phoneWireless!,
        status: 'DELIVERED',
        aiSentiment: 'NEUTRAL',
        appointmentRequested: false,
        urgencyLevel: 'LOW'
      }
    });

    await prisma.communication.create({
      data: {
        patientId: patient.id,
        tenantId: patient.tenantId,
        type: 'SMS',
        direction: 'INBOUND',
        content: 'CONFIRM - See you tomorrow!',
        phoneNumber: patient.phoneWireless!,
        status: 'RECEIVED',
        aiSentiment: 'POSITIVE',
        appointmentRequested: false,
        urgencyLevel: 'LOW'
      }
    });

    console.log('✅ Test patient created successfully!');
    console.log(`📋 Patient ID: ${patient.id}`);
    console.log(`👤 Name: ${patient.firstName} ${patient.lastName}`);
    console.log(`📞 Phone: ${patient.phoneWireless}`);
    console.log(`📧 Email: ${patient.email}`);
    console.log(`🏥 Includes: Insurance, Visit, Treatments, Transactions, Communications`);

  } catch (error) {
    console.error('❌ Failed to create test patient:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestPatient();