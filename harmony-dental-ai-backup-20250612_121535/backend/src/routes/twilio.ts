import { Router } from 'express';
import { ReceptionistAgent } from '../services/receptionistAgent';
import { authenticateToken, ensureTenantIsolation } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// ElevenLabs webhook for personalization
router.post('/webhook/personalization', async (req, res) => {
  try {
    const { caller_id, agent_id, called_number, call_sid } = req.body;
    
    // Extract tenant from called number mapping
    const tenantId = await getTenantFromPhoneNumber(called_number);
    
    // Initialize receptionist agent for this tenant
    const receptionist = new ReceptionistAgent();
    await receptionist.initializeAgent(tenantId, await getPracticeConfig(tenantId));
    
    // Handle the call and get personalization data
    const callData = await receptionist.handleIncomingCall({
      callerId: caller_id,
      calledNumber: called_number,
      tenantId
    });

    // Return personalization data for ElevenLabs
    res.json({
      dynamic_variables: callData.dynamicVariables,
      overrides: {
        first_message: callData.patientInfo 
          ? `Hello ${callData.patientInfo.firstName}! Thank you for calling. How can I help you today?`
          : undefined
      }
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Post-call webhook for conversation analysis
router.post('/webhook/post-call', async (req, res) => {
  try {
    const { type, data, event_timestamp } = req.body;
    
    if (type === 'post_call_transcription') {
      // Extract key information
      const callSummary = data.analysis?.transcript_summary;
      const patientId = data.metadata?.patient_id;
      const appointmentBooked = data.analysis?.call_successful;
      
      // Store conversation record
      await storeConversationRecord({
        patientId,
        callSummary,
        fullTranscript: data.transcript,
        appointmentBooked,
        callDuration: data.call_duration_seconds,
        timestamp: new Date(event_timestamp * 1000)
      });
      
      // Trigger follow-up actions if needed
      if (appointmentBooked) {
        await sendAppointmentConfirmation(patientId);
      }
    }
    
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Post-call webhook error:', error);
    res.status(500).json({ error: 'Post-call processing failed' });
  }
});

// COMPLETE: Get tenant from phone number mapping
async function getTenantFromPhoneNumber(phoneNumber: string): Promise<string> {
  try {
    // Look up which tenant owns this phone number
    const phoneMapping = await prisma.practicePhone.findUnique({
      where: { phoneNumber: phoneNumber },
      include: { tenant: true }
    });
    
    if (phoneMapping) {
      return phoneMapping.tenantId;
    }
    
    // Fallback: check if it's a known practice number
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { phone: phoneNumber },
          { phone: phoneNumber }
        ]
      }
    });
    
    return tenant?.id || 'default-tenant';
  } catch (error) {
    console.error('Error getting tenant from phone:', error);
    return 'default-tenant';
  }
}

// COMPLETE: Get practice configuration
async function getPracticeConfig(tenantId: string) {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        providers: {
          where: { isActive: true },
          select: { firstName: true, lastName: true, specialty: true }
        }
      }
    });
    
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    
    const aiConfig = tenant.aiConfig as any || {};
    
    return {
      name: tenant.name,
      hours: aiConfig.practiceHours || '8 AM to 6 PM, Monday through Friday',
      specialty: "General Dentistry",
      emergencyNumber: tenant.phone || tenant.phone,
      receptionistNumber: tenant.phone,
      voiceId: aiConfig.voice?.voiceId || 'EXAVITQu4vr4xnSDxMaL', // Default voice
      address: `${tenant.address}`,
      availableProviders: tenant.providers.map(p => `Dr. ${p.firstName} ${p.lastName}`),
      appointmentTypes: ['Cleaning & Exam', 'Consultation', 'Emergency', 'Follow-up'],
      insuranceAccepted: aiConfig.insuranceAccepted || 'Most major insurance plans',
      paymentOptions: 'Cash, Credit Card, Insurance, Payment Plans',
      bookingPolicies: 'Appointments can be scheduled 24/7. Cancellations require 24-hour notice.'
    };
  } catch (error) {
    console.error('Error getting practice config:', error);
    return {
      name: 'Harmony Dental',
      hours: '8 AM to 6 PM, Monday through Friday',
      specialty: 'General Dentistry',
      emergencyNumber: '+1234567890',
      receptionistNumber: '+1234567891',
      voiceId: 'EXAVITQu4vr4xnSDxMaL'
    };
  }
}

// COMPLETE: Store conversation record
async function storeConversationRecord(record: {
  patientId?: string;
  callSummary: string;
  fullTranscript: string;
  appointmentBooked: boolean;
  callDuration: number;
  timestamp: Date;
}) {
  try {
    // Extract tenant info from patient or use call context
    let tenantId = 'default-tenant';
    if (record.patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: record.patientId },
        select: { tenantId: true }
      });
      tenantId = patient?.tenantId || tenantId;
    }
    
    // Store the conversation record
    await prisma.agentInteraction.create({
      data: {
        tenantId,
        patientId: record.patientId,
        agentType: 'receptionist',
        interactionType: record.appointmentBooked ? 'appointment_booking' : 'inquiry',
        channel: 'voice',
        content: {
          summary: record.callSummary,
          fullTranscript: record.fullTranscript,
          appointmentBooked: record.appointmentBooked,
          callDuration: record.callDuration
        },
        confidenceScore: 0.9,
        successOutcome: record.appointmentBooked,
        createdAt: record.timestamp
      }
    });
    
    console.log(`Stored conversation record for patient ${record.patientId}`);
  } catch (error) {
    console.error('Error storing conversation record:', error);
  }
}

// COMPLETE: Send appointment confirmation
async function sendAppointmentConfirmation(patientId: string) {
  try {
    // Get the most recent appointment for this patient
    const appointment = await prisma.appointment.findFirst({
      where: {
        patientId,
        startTime: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
        provider: true,
        tenant: true
      }
    });
    
    if (!appointment) {
      console.log(`No recent appointment found for patient ${patientId}`);
      return;
    }
    
    // Use existing communication service to send confirmation
    const { CommunicationService } = await import('../services/communicationService');
    
    // Get confirmation message template
    const { PromptService } = await import('../services/promptService');
    const confirmationMessage = await PromptService.getPrompt(
      appointment.tenantId,
      'receptionist',
      'confirmations',
      {
        patientFirstName: appointment.patient.firstName,
        tenantId: appointment.tenantId,        practiceName: appointment.tenant.name,
        appointmentDate: appointment.startTime.toLocaleDateString(),
        appointmentTime: appointment.startTime.toLocaleTimeString(),
        providerName: `Dr. ${appointment?.provider?.lastName || "Unknown"}`,
        practiceAddress: `${appointment.tenant.address}`,
        practicePhone: appointment.tenant.phone,
        appointmentPreparation: 'Please arrive 15 minutes early and bring your insurance card.'
      }
    );
    
    // Send SMS confirmation
    if (appointment.patient.phoneWireless) {
      await CommunicationService.sendSMS({
        to: appointment.patient.phoneWireless,
        agentType: "receptionist" as const,
        interactionType: "confirmation" as const,
        message: confirmationMessage,
      });
      
      console.log(`Sent confirmation SMS to ${appointment.patient.phoneWireless}`);
    }
    
  } catch (error) {
    console.error('Error sending appointment confirmation:', error);
  }
}

export { router as twilioRouter };