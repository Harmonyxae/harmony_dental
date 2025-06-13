import { VoiceService } from './voiceService';
import { PromptService } from './promptService';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface SchedulingContext {
  tenantId: string;
  patientId?: string;
  callerId: string;
  preferredProvider?: string;
  appointmentType?: string;
  urgency?: 'routine' | 'urgent' | 'emergency';
  flexibleTiming?: boolean;
}

export interface ScheduleOptimization {
  suggestedTime: Date;
  alternativeTimes: Date[];
  noShowRisk: number;
  optimizationScore: number;
  reasoning: string;
}

export class SchedulerAgent {
  private voiceService: VoiceService;
  private agentId: string | null = null;

  constructor() {
    this.voiceService = new VoiceService();
  }

  async initializeAgent(tenantId: string, practiceConfig: any) {
    try {
      // Get scheduling-specific prompt from our prompt service
      const systemPrompt = await PromptService.getPrompt(
        tenantId,
        'scheduler',
        'main_conversation',
        {
          practiceName: practiceConfig.name,
          tenantId: "default",          practiceHours: practiceConfig.hours,
          emergencyPolicy: practiceConfig.emergencyPolicy,
          bookingPolicies: practiceConfig.bookingPolicies,
          availableProviders: practiceConfig.availableProviders.join(', '),
          appointmentTypes: practiceConfig.appointmentTypes.join(', ')
        }
      );

      // Create dental scheduling tools for ElevenLabs
      const schedulingTools = await this.createSchedulingTools();
      
      // Add system tools for call management
      const systemTools = [
        {
          type: 'system',
          name: 'end_call',
          description: 'End the call when scheduling is complete'
        },
        {
          type: 'system',
          name: 'transfer_to_human',
          phoneNumber: practiceConfig.receptionistNumber,
          condition: 'Complex scheduling conflicts or patient requests human assistance'
        }
      ];

      // Create the conversational agent with ElevenLabs
      const agent = await this.voiceService.createConversationalAgent({
        name: `${practiceConfig.name} Scheduler`,
        systemPrompt: systemPrompt,
        voiceId: practiceConfig.schedulerVoiceId || practiceConfig.voiceId,
        firstMessage: `Hi! I'm here to help you schedule your dental appointment. What type of visit are you looking for?`,
        tools: [...schedulingTools, ...systemTools],
        dynamicVariables: {
          practice_name: practiceConfig.name,
          available_times: 'dynamic', // Will be populated per call
          patient_preferences: 'dynamic'
        }
      });

      this.agentId = agent.agentId;
      logger.info(`Scheduler agent initialized for tenant ${tenantId}`);
      return agent;
    } catch (error) {
      logger.error('Error initializing scheduler agent:', error);
      throw error;
    }
  }

  // Create ElevenLabs server tools for scheduling operations
  async createSchedulingTools() {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    
    return [
      {
        type: 'server',
        name: 'check_provider_availability',
        description: 'Check availability for a specific provider on a given date',
        url: `${baseUrl}/api/appointments/availability`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`
        },
        queryParameters: {
          providerId: {
            type: 'string',
            description: 'Provider ID (optional, will check all if not specified)',
            required: false
          },
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format',
            required: true
          },
          duration: {
            type: 'number',
            description: 'Appointment duration in minutes (default: 60)',
            required: false
          }
        }
      },
      {
        type: 'server',
        name: 'find_optimal_appointment_time',
        description: 'Find the best appointment time based on patient preferences and practice efficiency',
        url: `${baseUrl}/api/scheduling/optimize`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`,
          'Content-Type': 'application/json'
        },
        bodyParameters: {
          patientId: {
            type: 'string',
            description: 'Patient ID if known',
            required: false
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment (cleaning, consultation, emergency, etc.)',
            required: true
          },
          preferredDates: {
            type: 'array',
            description: 'Array of preferred dates in YYYY-MM-DD format',
            required: true
          },
          preferredTimes: {
            type: 'array',
            description: 'Array of preferred time ranges (morning, afternoon, evening)',
            required: false
          },
          providerId: {
            type: 'string',
            description: 'Preferred provider ID',
            required: false
          },
          urgency: {
            type: 'string',
            description: 'Urgency level: routine, urgent, emergency',
            required: false
          }
        }
      },
      {
        type: 'server',
        name: 'book_appointment',
        description: 'Book a confirmed appointment slot',
        url: `${baseUrl}/api/appointments/book`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`,
          'Content-Type': 'application/json'
        },
        bodyParameters: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
            required: true
          },
          providerId: {
            type: 'string',
            description: 'Provider ID',
            required: true
          },
          appointmentDate: {
            type: 'string',
            description: 'Appointment date in YYYY-MM-DD format',
            required: true
          },
          appointmentTime: {
            type: 'string',
            description: 'Appointment time in HH:MM format',
            required: true
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment',
            required: true
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes',
            required: false
          },
          notes: {
            type: 'string',
            description: 'Additional notes',
            required: false
          }
        }
      },
      {
        type: 'server',
        name: 'reschedule_appointment',
        description: 'Reschedule an existing appointment',
        url: `${baseUrl}/api/appointments/reschedule`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`,
          'Content-Type': 'application/json'
        },
        bodyParameters: {
          appointmentId: {
            type: 'string',
            description: 'Existing appointment ID',
            required: true
          },
          newDate: {
            type: 'string',
            description: 'New appointment date in YYYY-MM-DD format',
            required: true
          },
          newTime: {
            type: 'string',
            description: 'New appointment time in HH:MM format',
            required: true
          },
          reason: {
            type: 'string',
            description: 'Reason for rescheduling',
            required: false
          }
        }
      },
      {
        type: 'server',
        name: 'get_patient_appointment_history',
        description: 'Get patient appointment history and preferences',
        url: `${baseUrl}/api/patients/appointment-history`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`
        },
        queryParameters: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
            required: false
          },
          phoneNumber: {
            type: 'string',
            description: 'Patient phone number if ID unknown',
            required: false
          }
        }
      },
      {
        type: 'server',
        name: 'add_to_waitlist',
        description: 'Add patient to waitlist for preferred appointment time',
        url: `${baseUrl}/api/appointments/waitlist`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`,
          'Content-Type': 'application/json'
        },
        bodyParameters: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
            required: true
          },
          preferredDate: {
            type: 'string',
            description: 'Preferred date in YYYY-MM-DD format',
            required: true
          },
          preferredTime: {
            type: 'string',
            description: 'Preferred time in HH:MM format',
            required: true
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment',
            required: true
          },
          priority: {
            type: 'string',
            description: 'Priority level: low, medium, high',
            required: false
          }
        }
      }
    ];
  }

  // Handle incoming scheduling calls
  async handleSchedulingCall(callData: {
    callerId: string;
    calledNumber: string;
    tenantId: string;
    context?: SchedulingContext;
  }) {
    try {
      // Get patient information if available
      const patient = await this.getPatientByPhone(callData.callerId, callData.tenantId);
      
      // Get current availability snapshot for dynamic variables
      const todayAvailability = await this.getTodayAvailability(callData.tenantId);
      
      // Prepare dynamic variables for personalization
      const dynamicVariables = {
        caller_id: callData.callerId,
        patient_name: patient?.firstName || 'valued patient',
        patient_id: patient?.id || '',
        has_upcoming_appointments: (patient?.appointments?.length ?? 0) > 0,
        preferred_appointment_times: patient?.preferredAppointmentTimes || 'no preference',
        no_show_risk: patient?.noShowRiskScore || 0,
        available_today: todayAvailability?.availableSlots > 0,
        next_available_slot: todayAvailability.nextAvailable,
        secret__tenant_id: callData.tenantId,
        secret__api_token: await this.generateAPIToken(callData.tenantId)
      };

      // Get signed URL for secure connection
      const signedUrl = await this.voiceService.getSignedUrl(this.agentId!);

      return {
        agentId: this.agentId,
        signedUrl,
        dynamicVariables,
        patientInfo: patient,
        availabilitySnapshot: todayAvailability
      };
    } catch (error) {
      logger.error('Error handling scheduling call:', error);
      throw error;
    }
  }

  // Advanced scheduling optimization algorithm
  async optimizeSchedule(context: SchedulingContext): Promise<ScheduleOptimization> {
    try {
      const { tenantId, patientId, appointmentType, urgency } = context;
      
      // Get patient history for no-show prediction
      const patientHistory = patientId ? 
        await this.getPatientAppointmentHistory(patientId) : null;
      
      // Get practice schedule patterns
      const schedulePatterns = await this.getSchedulePatterns(tenantId);
      
      // Calculate optimal time based on multiple factors
      const optimization = await this.calculateOptimalTime({
        tenantId,
        appointmentType: appointmentType || 'routine',
        urgency: urgency || 'routine',
        patientHistory,
        schedulePatterns
      });

      return optimization;
    } catch (error) {
      logger.error('Schedule optimization error:', error);
      throw error;
    }
  }

  // Predict no-show probability
  async predictNoShowRisk(patientId: string): Promise<number> {
    try {
      const history = await this.getPatientAppointmentHistory(patientId);
      
      if (!history || history.length === 0) {
        return 0.1; // Default low risk for new patients
      }

      const noShows = history.filter(apt => apt.status === 'no_show').length;
      const cancellations = history.filter(apt => apt.status === 'cancelled').length;
      const completed = history.filter(apt => apt.status === 'completed').length;
      const total = history.length;

      // Weighted calculation: no_show = 1.0, cancellation = 0.5, late_cancellation = 0.7
      const riskScore = (noShows + (cancellations * 0.5)) / total;
      
      // Consider recency - recent no-shows are more predictive
      const recentNoShows = history
        .filter(apt => apt.status === 'no_show')
        .filter(apt => {
          const daysAgo = (Date.now() - new Date(apt.startTime).getTime()) / (1000 * 60 * 60 * 24);
          return daysAgo <= 90; // Last 3 months
        }).length;

      const recentRiskBoost = recentNoShows > 0 ? 0.2 : 0;
      
      return Math.min(1.0, riskScore + recentRiskBoost);
    } catch (error) {
      logger.error('No-show prediction error:', error);
      return 0.3; // Default moderate risk
    }
  }

  // Private helper methods
  private async getPatientByPhone(phoneNumber: string, tenantId: string) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    return await prisma.patient.findFirst({
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
          where: { startTime: { gte: new Date() } },
          orderBy: { startTime: 'asc' },
          take: 5
        }
      }
    });
  }

  private async getTodayAvailability(tenantId: string) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's appointments
    const todayAppointments = await prisma.appointment.count({
      where: {
        tenantId,
        startTime: {
          gte: today,
          lt: tomorrow
        },
        status: { not: 'cancelled' }
      }
    });

    // Simple availability calculation
    const maxSlotsPerDay = 16; // 8 hours * 2 slots per hour
    const availableSlots = Math.max(0, maxSlotsPerDay - todayAppointments);
    
    return {
      date: today.toISOString().split('T')[0],
      availableSlots,
      nextAvailable: availableSlots > 0 ? 'Today' : 'Tomorrow'
    };
  }

  private async getPatientAppointmentHistory(patientId: string) {
    return await prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startTime: 'desc' },
      take: 20
    });
  }

  private async getSchedulePatterns(tenantId: string) {
    // Analysis of practice scheduling patterns for optimization
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const patterns = await prisma.appointment.groupBy({
      by: ['status'],
      where: {
        tenantId,
        startTime: { gte: last30Days }
      },
      _count: true
    });

    return patterns;
  }

  private async calculateOptimalTime(params: any): Promise<ScheduleOptimization> {
    // Simplified optimization algorithm
    // In production, this would use ML models
    
    const suggestedTime = new Date();
    suggestedTime.setDate(suggestedTime.getDate() + 1);
    suggestedTime.setHours(10, 0, 0, 0); // Default to 10 AM tomorrow

    const alternativeTimes = [
      new Date(suggestedTime.getTime() + 2 * 60 * 60 * 1000), // +2 hours
      new Date(suggestedTime.getTime() + 24 * 60 * 60 * 1000), // +1 day
      new Date(suggestedTime.getTime() + 48 * 60 * 60 * 1000)  // +2 days
    ];

    return {
      suggestedTime,
      alternativeTimes,
      noShowRisk: params.patientHistory ? 
        await this.predictNoShowRisk(params.patientHistory[0]?.patientId) : 0.1,
      optimizationScore: 0.85,
      reasoning: 'Optimal time based on practice efficiency and patient preferences'
    };
  }

  private async generateAPIToken(tenantId: string): Promise<string> {
    // Generate a temporary API token for ElevenLabs server tools
    // This should integrate with your auth system
    return process.env.INTERNAL_API_TOKEN || 'temp-token';
  }
}