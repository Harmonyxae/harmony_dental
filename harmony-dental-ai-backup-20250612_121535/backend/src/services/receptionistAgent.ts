import OpenAI from 'openai';
import { config } from '../config/config';
import { PromptService } from './promptService';
import { CommunicationService } from './communicationService';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { VoiceService } from './voiceService';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export interface ConversationContext {
  tenantId: string;
  patientId?: string;
  appointmentId?: string;
  channel: 'sms' | 'voice';
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  intent?: string;
  entities?: Record<string, any>;
}

export class ReceptionistAgent {
  private voiceService: VoiceService;
  private agentId: string | null = null;

  constructor() {
    this.voiceService = new VoiceService();
  }

  async initializeAgent(tenantId: string, practiceConfig: any) {
    try {
      // Get customized prompt from our prompt service
      const systemPrompt = await PromptService.getPrompt(
        tenantId,
        'receptionist',
        'main_conversation',
        {
          practiceName: practiceConfig.name,
          tenantId: tenantId,          practiceHours: practiceConfig.hours,
          practiceSpecialty: practiceConfig.specialty,
          emergencyNumber: practiceConfig.emergencyNumber
        }
      );

      // Create server tools for dental operations
      const dentalTools = await this.voiceService.createDentalServerTools();
      
      // Add system tools for call management
      const systemTools = [
        {
          type: 'system',
          name: 'end_call',
          description: 'End the call when the conversation is complete or the patient says goodbye'
        },
        {
          type: 'system', 
          name: 'transfer_to_human',
          phoneNumber: practiceConfig.receptionistNumber,
          condition: 'When the patient requests to speak with a human or has a complex issue'
        }
      ];

      // Create the conversational agent
      const agent = await this.voiceService.createConversationalAgent({
        name: `${practiceConfig.name} Receptionist`,
        systemPrompt: systemPrompt,
        voiceId: practiceConfig.voiceId || 'default',
        firstMessage: `Hello! Thank you for calling ${practiceConfig.name}. How can I help you today?`,
        tools: [...dentalTools, ...systemTools]
      });

      this.agentId = agent.agentId;
      return agent;
    } catch (error) {
      console.error('Error initializing receptionist agent:', error);
      throw error;
    }
  }

  async handleIncomingCall(callData: {
    callerId: string;
    calledNumber: string;
    tenantId: string;
  }) {
    try {
      // Get patient information if available
      const patientInfo = await this.getPatientByPhone(callData.callerId, callData.tenantId);
      
      // Prepare dynamic variables for personalization
      const dynamicVariables = {
        caller_id: callData.callerId,
        patient_name: patientInfo?.firstName || 'valued patient',
        has_upcoming_appointments: (patientInfo?.upcomingAppointments?.length ?? 0) > 0,
        last_visit: patientInfo?.lastVisit || 'no previous visits',
        secret__tenant_id: callData.tenantId
      };

      // Get signed URL for secure connection
      const signedUrl = await this.voiceService.getSignedUrl(this.agentId!);

      return {
        agentId: this.agentId,
        signedUrl,
        dynamicVariables,
        patientInfo
      };
    } catch (error) {
      console.error('Error handling incoming call:', error);
      throw error;
    }
  }

  private async getPatientByPhone(phoneNumber: string, tenantId: string) {
    try {
      // Clean phone number (remove formatting)
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      // Search for patient by phone number
      const patient = await prisma.patient.findFirst({
        where: {
          tenantId,
          OR: [
            { phoneHome: { contains: cleanPhone } },
            { phoneHome: { contains: cleanPhone } },
            { phoneWireless: { contains: cleanPhone } }
          ]
        },
        include: {
          appointments: {
            where: {
              startTime: { gte: new Date() }
            },
            orderBy: { startTime: 'asc' },
            take: 3
          }
        }
      });

      if (patient) {
        return {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          upcomingAppointments: patient?.appointments || [],
          lastVisit: await this.getLastVisitDate(patient.id)
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting patient by phone:', error);
      return null;
    }
  }

  private async getLastVisitDate(patientId: string): Promise<string | null> {
    try {
      const lastAppointment = await prisma.appointment.findFirst({
        where: {
          patientId,
          startTime: { lt: new Date() },
          status: 'completed'
        },
        orderBy: { startTime: 'desc' }
      });

      return lastAppointment ? 
        lastAppointment.startTime.toLocaleDateString() : 
        null;
    } catch (error) {
      console.error('Error getting last visit:', error);
      return null;
    }
  }

  // Process incoming SMS message
  static async processSMS(
    tenantId: string,
    patientPhone: string,
    message: string,
    patientId?: string
  ): Promise<{ response: string; intent: string; confidence: number }> {
    try {
      // Build conversation context
      const context: ConversationContext = {
        tenantId,
        patientId,
        channel: 'sms',
        conversationHistory: []
      };

      // Get recent conversation history if patient exists
      if (patientId) {
        context.conversationHistory = await this.getRecentConversationHistory(
          patientId, 
          'sms', 
          5 // Last 5 messages
        );
      }

      // Determine intent and get appropriate prompt
      const intent = await this.determineIntent(message, context);
      context.intent = intent;

      let systemPrompt: string;
      let response: string;

      switch (intent) {
        case 'appointment_booking':
          systemPrompt = await PromptService.getPrompt(
            tenantId, 
            'receptionist', 
            'appointment_booking',
            { tenantId, patientId }
          );
          response = await this.handleAppointmentBooking(message, context, systemPrompt);
          break;

        case 'appointment_confirmation':
          response = await this.handleAppointmentConfirmation(message, context);
          break;

        case 'faq':
          systemPrompt = await PromptService.getPrompt(
            tenantId, 
            'receptionist', 
            'faq_handling',
            { tenantId, patientId }
          );
          response = await this.handleFAQ(message, context, systemPrompt);
          break;

        case 'greeting':
        default:
          systemPrompt = await PromptService.getPrompt(
            tenantId, 
            'receptionist', 
            'sms_greeting',
            { tenantId, patientId }
          );
          response = await this.generateResponse(message, context, systemPrompt);
          break;
      }

      // Log the interaction
      await this.logInteraction(tenantId, patientId, 'sms', {
        userMessage: message,
        agentResponse: response,
        intent,
        confidence: 0.85 // Will be replaced with actual confidence scoring
      });

      return {
        response,
        intent,
        confidence: 0.85
      };

    } catch (error) {
      logger.error('SMS processing failed:', error);
      
      // Fallback response
      const fallbackPrompt = `I apologize, but I'm experiencing technical difficulties. Please call our office directly or try again in a few minutes.`;
      
      return {
        response: fallbackPrompt,
        intent: 'error',
        confidence: 0.0
      };
    }
  }

  // Process voice call interaction
  static async processVoiceInput(
    tenantId: string,
    patientPhone: string,
    speechText: string,
    patientId?: string
  ): Promise<{ response: string; intent: string; nextAction?: string }> {
    try {
      const context: ConversationContext = {
        tenantId,
        patientId,
        channel: 'voice',
        conversationHistory: []
      };

      // Get conversation history
      if (patientId) {
        context.conversationHistory = await this.getRecentConversationHistory(
          patientId, 
          'voice', 
          3 // Shorter history for voice
        );
      }

      const intent = await this.determineIntent(speechText, context);
      context.intent = intent;

      let systemPrompt: string;
      let response: string;
      let nextAction: string | undefined;

      switch (intent) {
        case 'appointment_booking':
          systemPrompt = await PromptService.getPrompt(
            tenantId, 
            'receptionist', 
            'appointment_booking',
            { tenantId, patientId }
          );
          response = await this.handleAppointmentBooking(speechText, context, systemPrompt);
          nextAction = 'continue_conversation';
          break;

        case 'emergency':
          response = 'I understand this is urgent. Let me connect you with someone immediately.';
          nextAction = 'transfer_to_human';
          break;

        default:
          systemPrompt = await PromptService.getPrompt(
            tenantId, 
            'receptionist', 
            'voice_greeting',
            { tenantId, patientId }
          );
          response = await this.generateResponse(speechText, context, systemPrompt);
          nextAction = 'continue_conversation';
          break;
      }

      // Log voice interaction
      await this.logInteraction(tenantId, patientId, 'voice', {
        userSpeech: speechText,
        agentResponse: response,
        intent,
        nextAction
      });

      return { response, intent, nextAction };

    } catch (error) {
      logger.error('Voice processing failed:', error);
      return {
        response: 'I apologize for the technical difficulty. Let me transfer you to our front desk.',
        intent: 'error',
        nextAction: 'transfer_to_human'
      };
    }
  }

  // Determine user intent using OpenAI
  private static async determineIntent(
    userInput: string, 
    context: ConversationContext
  ): Promise<string> {
    try {
      const intentPrompt = `Analyze the following user message and determine their intent. Consider the conversation context.

User message: "${userInput}"

Channel: ${context.channel}
Previous context: ${context.conversationHistory.length > 0 ? 'Ongoing conversation' : 'First message'}

Possible intents:
- appointment_booking: User wants to schedule a new appointment
- appointment_confirmation: User is confirming/responding to appointment confirmation
- appointment_cancellation: User wants to cancel an appointment
- appointment_reschedule: User wants to change appointment time
- faq: User has a general question about services, hours, location, etc.
- emergency: User has a dental emergency
- greeting: General greeting or unclear intent
- payment_inquiry: Questions about billing or payment

Respond with only the intent name (lowercase, underscore-separated).`;

      const response = await (openai.chat.completions.create as any)({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: intentPrompt },
          { role: 'user', content: userInput }
        ],
        max_tokens: 50,
        temperature: 0.1
      });

      const intent = response.choices[0]?.message?.content?.trim().toLowerCase() || 'greeting';
      
      logger.info(`Intent determined: ${intent} for message: "${userInput}"`);
      
      return intent;

    } catch (error) {
      logger.error('Intent determination failed:', error);
      return 'greeting'; // Default fallback
    }
  }

  // Handle appointment booking requests
  private static async handleAppointmentBooking(
    userInput: string,
    context: ConversationContext,
    systemPrompt: string
  ): Promise<string> {
    try {
      // Get available appointment times for context
      const availabilityContext = await this.getAvailabilityContext(context.tenantId);
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...context.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { 
          role: 'system', 
          content: `Current availability context: ${JSON.stringify(availabilityContext)}` 
        },
        { role: 'user', content: userInput }
      ];

      const response = await (openai.chat.completions.create as any)({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 300,
        temperature: 0.7
      });

      return response.choices[0]?.message?.content || 
        'I\'d be happy to help you schedule an appointment. Could you please let me know your preferred date and time?';

    } catch (error) {
      logger.error('Appointment booking handling failed:', error);
      return 'I\'m having trouble accessing our scheduling system. Could you please call our office directly to book your appointment?';
    }
  }

  // Handle FAQ questions
  private static async handleFAQ(
    userInput: string,
    context: ConversationContext,
    systemPrompt: string
  ): Promise<string> {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ];

      const response = await (openai.chat.completions.create as any)({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 250,
        temperature: 0.5
      });

      return response.choices[0]?.message?.content || 
        'I\'d be happy to help answer your question. Could you please be more specific about what you\'d like to know?';

    } catch (error) {
      logger.error('FAQ handling failed:', error);
      return 'I\'m sorry, I\'m having trouble accessing that information right now. Please call our office and we\'ll be happy to help!';
    }
  }

  // Handle appointment confirmations
  private static async handleAppointmentConfirmation(
    userInput: string,
    context: ConversationContext
  ): Promise<string> {
    const input = userInput.toLowerCase().trim();
    
    if (['yes', 'y', 'confirm', 'confirmed', 'ok', 'okay'].includes(input)) {
      // Find and confirm the appointment
      if (context.patientId) {
        const upcomingAppointment = await prisma.appointment.findFirst({
          where: {
            patientId: context.patientId,
            startTime: { gte: new Date() },
            status: 'scheduled'
          },
          orderBy: { startTime: 'asc' }
        });

        if (upcomingAppointment) {
          await prisma.appointment.update({
            where: { id: upcomingAppointment.id },
            data: { 
              status: 'confirmed',
              confirmed: true 
            }
          });

          return 'Perfect! Your appointment is confirmed. We look forward to seeing you!';
        }
      }
      
      return 'Thank you for confirming! Your appointment is all set.';
      
    } else if (['no', 'n', 'cancel', 'reschedule', 'change'].includes(input)) {
      return 'I understand you need to make changes to your appointment. Please call our office at your earliest convenience and we\'ll help you reschedule.';
    }

    return 'I didn\'t quite understand. Could you please reply with "YES" to confirm your appointment or "NO" if you need to reschedule?';
  }

  // Generate general response using OpenAI
  private static async generateResponse(
    userInput: string,
    context: ConversationContext,
    systemPrompt: string
  ): Promise<string> {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...context.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userInput }
      ];

      const response = await (openai.chat.completions.create as any)({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 200,
        temperature: 0.7
      });

      return response.choices[0]?.message?.content || 
        'I\'m here to help! Could you please let me know how I can assist you today?';

    } catch (error) {
      logger.error('Response generation failed:', error);
      return 'I\'m here to help! Please let me know what you need assistance with.';
    }
  }

  // Get recent conversation history
  private static async getRecentConversationHistory(
    patientId: string,
    channel: string,
    limit: number = 5
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>> {
    try {
      const interactions = await prisma.agentInteraction.findMany({
        where: {
          patientId,
          channel,
          agentType: 'receptionist'
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          content: true,
          createdAt: true
        }
      });

      return interactions.reverse().map(interaction => {
        const content = interaction.content as any;
        return {
          role: content.inbound ? 'user' : 'assistant',
          content: content.message || content.userMessage || content.agentResponse || '',
          timestamp: interaction.createdAt
        };
      });

    } catch (error) {
      logger.error('Failed to get conversation history:', error);
      return [];
    }
  }

  // Get availability context for appointment booking
  private static async getAvailabilityContext(tenantId: string): Promise<any> {
    try {
      // Get next 7 days of availability
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const providers = await prisma.provider.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true }
      });

      const appointments = await prisma.appointment.count({
        where: {
          tenantId,
          startTime: {
            gte: startDate,
            lte: endDate
          },
          status: { not: 'cancelled' }
        }
      });

      return {
        availableProviders: providers.map(p => `Dr. ${p.lastName}`),
        nextWeekAvailability: appointments < 50 ? 'good' : 'limited', // Simple heuristic
        officeHours: 'Monday-Friday 8:00 AM - 5:00 PM'
      };

    } catch (error) {
      logger.error('Failed to get availability context:', error);
      return { availability: 'Please call for current availability' };
    }
  }

  // Log agent interaction
  private static async logInteraction(
    tenantId: string,
    patientId: string | undefined,
    channel: string,
    interactionData: any
  ): Promise<void> {
    try {
      await prisma.agentInteraction.create({
        data: {
          tenantId,
          patientId,
          agentType: 'receptionist',
          interactionType: interactionData.intent || 'general',
          channel,
          content: interactionData,
          confidenceScore: interactionData.confidence || 0.85,
          successOutcome: true // Will be updated based on user feedback
        }
      });
    } catch (error) {
      logger.error('Failed to log interaction:', error);
    }
  }
}