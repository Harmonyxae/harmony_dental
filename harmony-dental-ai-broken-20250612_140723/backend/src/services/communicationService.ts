import twilio from 'twilio';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

// Initialize Twilio client
const twilioClient = twilio(config.twilio.TWILIO_ACCOUNT_SID, config.twilio.TWILIO_AUTH_TOKEN);

export interface SMSMessage {
  to: string;
  message: string;
  patientId?: string;
  appointmentId?: string;
  agentType: string;
  interactionType: string;
}

export interface VoiceCallOptions {
  to: string;
  patientId?: string;
  appointmentId?: string;
  agentType: string;
  interactionType: string;
  callbackUrl?: string;
}

export class CommunicationService {
  
  // Send SMS message
  static async sendSMS(params: SMSMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { to, message, patientId, appointmentId, agentType, interactionType } = params;

      // Send SMS via Twilio
      const twilioMessage = await twilioClient.messages.create({
        body: message,
        from: config.twilio.TWILIO_PHONE_NUMBER,
        to: to,
      });

      // Log interaction for AI learning
      if (patientId) {
        await this.logCommunicationInteraction({
          patientId,
          appointmentId,
          agentType,
          interactionType,
          channel: 'sms',
          content: {
            outbound: true,
            message: message,
            to: to,
            twilioMessageId: twilioMessage.sid,
          },
          confidenceScore: 1.0, // SMS sending is always confident
          successOutcome: true,
        });
      }

      logger.info(`SMS sent successfully: ${twilioMessage.sid} to ${to}`);
      
      return {
        success: true,
        messageId: twilioMessage.sid,
      };

    } catch (error) {
      logger.error('SMS sending failed:', error);
      
      // Log failed interaction
      if (params.patientId) {
        await this.logCommunicationInteraction({
          patientId: params.patientId,
          appointmentId: params.appointmentId,
          agentType: params.agentType,
          interactionType: params.interactionType,
          channel: 'sms',
          content: {
            outbound: true,
            message: params.message,
            to: params.to,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          confidenceScore: 0.0,
          successOutcome: false,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Initiate voice call
  static async initiateCall(params: VoiceCallOptions): Promise<{ success: boolean; callId?: string; error?: string }> {
    try {
      const { to, patientId, appointmentId, agentType, interactionType, callbackUrl } = params;

      // Create TwiML for AI-powered call
      const twimlUrl = callbackUrl || `${process.env.BASE_URL}/api/v1/voice/handle-call`;

      const call = await twilioClient.calls.create({
        url: twimlUrl,
        to: to,
        from: config.twilio.TWILIO_PHONE_NUMBER,
        statusCallback: `${process.env.BASE_URL}/api/v1/voice/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        record: true, // Record for training and compliance
        recordingStatusCallback: `${process.env.BASE_URL}/api/v1/voice/recording-status`,
      });

      // Log call initiation
      if (patientId) {
        await this.logCommunicationInteraction({
          patientId,
          appointmentId,
          agentType,
          interactionType,
          channel: 'voice',
          content: {
            outbound: true,
            to: to,
            twilioCallId: call.sid,
            callInitiated: new Date().toISOString(),
          },
          confidenceScore: 1.0,
          successOutcome: null, // Will be updated when call completes
        });
      }

      logger.info(`Voice call initiated: ${call.sid} to ${to}`);

      return {
        success: true,
        callId: call.sid,
      };

    } catch (error) {
      logger.error('Voice call initiation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Handle incoming SMS webhook
  static async handleIncomingSMS(from: string, body: string, messageId: string): Promise<void> {
    try {
      // Find patient by phone number
      const patient = await prisma.patient.findFirst({
        where: {
          OR: [
            { phoneWireless: from },
            { phoneHome: from },
          ]
        },
        include: {
          tenant: true,
        }
      });

      if (!patient) {
        logger.warn(`Incoming SMS from unknown number: ${from}`);
        // Could send auto-reply asking them to call the office
        return;
      }

      // Log incoming message
      await this.logCommunicationInteraction({
        tenantId: patient.tenantId,
        patientId: patient.id,
        agentType: 'receptionist', // Default to receptionist for SMS
        interactionType: 'inbound_sms',
        channel: 'sms',
        content: {
          inbound: true,
          message: body,
          from: from,
          twilioMessageId: messageId,
        },
        confidenceScore: 1.0,
        successOutcome: true,
      });

      // Trigger Receptionist Agent to process and respond
      await this.processIncomingSMS(patient, body, from);

    } catch (error) {
      logger.error('Incoming SMS handling failed:', error);
    }
  }

  // Process incoming SMS with Receptionist Agent (placeholder for now)
  static async processIncomingSMS(patient: any, message: string, from: string): Promise<void> {
    // This will be implemented with OpenAI integration
    logger.info(`Processing SMS from ${patient.firstName} ${patient.lastName}: "${message}"`);
    
    // For now, just acknowledge receipt
    await this.sendSMS({
      to: from,
      message: `Hi ${patient.firstName}! We received your message and will respond shortly. For urgent matters, please call us directly.`,
      patientId: patient.id,
      agentType: 'receptionist',
      interactionType: 'auto_reply',
    });
  }

  // Log communication interaction for AI learning
  private static async logCommunicationInteraction(params: {
    tenantId?: string;
    patientId: string;
    appointmentId?: string;
    agentType: string;
    interactionType: string;
    channel: string;
    content: object;
    confidenceScore: number;
    successOutcome: boolean | null;
    durationSeconds?: number;
  }): Promise<void> {
    try {
      // Get tenant ID if not provided
      let tenantId = params.tenantId;
      if (!tenantId) {
        const patient = await prisma.patient.findUnique({
          where: { id: params.patientId },
          select: { tenantId: true }
        });
        tenantId = patient?.tenantId;
      }

      if (!tenantId) {
        logger.error('Cannot log interaction: tenant ID not found');
        return;
      }

      await prisma.agentInteraction.create({
        data: {
          tenantId,
          patientId: params.patientId,
          appointmentId: params.appointmentId,
          agentType: params.agentType,
          interactionType: params.interactionType,
          channel: params.channel,
          content: params.content,
          confidenceScore: params.confidenceScore,
          successOutcome: params.successOutcome,
          durationSeconds: params.durationSeconds,
        }
      });

    } catch (error) {
      logger.error('Failed to log communication interaction:', error);
    }
  }

  // Send appointment confirmation SMS
  static async sendAppointmentConfirmation(appointmentId: string): Promise<boolean> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: true,
          provider: true,
        }
      });

      if (!appointment || !appointment.patient.phoneWireless) {
        return false;
      }

      const appointmentDate = appointment.startTime.toLocaleDateString();
      const appointmentTime = appointment.startTime.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const message = `Hi ${appointment.patient.firstName}! This is a confirmation for your dental appointment on ${appointmentDate} at ${appointmentTime} with Dr. ${appointment.provider?.lastName || 'our team'}. Reply YES to confirm or call us to reschedule.`;

      const result = await this.sendSMS({
        to: appointment.patient.phoneWireless,
        message,
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        agentType: 'receptionist',
        interactionType: 'appointment_confirmation',
      });

      // Update appointment confirmation log
      if (result.success) {
        const confirmationLog = [
          ...(appointment.confirmationAttempts as any[]),
          {
            timestamp: new Date().toISOString(),
            method: 'sms',
            agentType: 'receptionist',
            messageId: result.messageId,
            success: true,
          }
        ];

        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { confirmationAttempts: confirmationLog }
        });
      }

      return result.success;

    } catch (error) {
      logger.error('Appointment confirmation failed:', error);
      return false;
    }
  }

  // Send appointment reminder SMS
  static async sendAppointmentReminder(appointmentId: string): Promise<boolean> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: true,
          provider: true,
        }
      });

      if (!appointment || !appointment.patient.phoneWireless) {
        return false;
      }

      const appointmentDate = appointment.startTime.toLocaleDateString();
      const appointmentTime = appointment.startTime.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const message = `Reminder: ${appointment.patient.firstName}, you have a dental appointment tomorrow (${appointmentDate}) at ${appointmentTime}. Please call if you need to reschedule.`;

      const result = await this.sendSMS({
        to: appointment.patient.phoneWireless,
        message,
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        agentType: 'receptionist',
        interactionType: 'appointment_reminder',
      });

      return result.success;

    } catch (error) {
      logger.error('Appointment reminder failed:', error);
      return false;
    }
  }
}