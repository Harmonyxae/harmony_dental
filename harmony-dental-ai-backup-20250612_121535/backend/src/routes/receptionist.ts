import { Router } from 'express';
import { ReceptionistAgent } from '../services/receptionistAgent';
import { prisma } from '../config/database'; // ADD THIS LINE
import { 
  authenticateToken, 
  ensureTenantIsolation, 
  AuthRequest 
} from '../middleware/auth';

const router = Router();
router.use(authenticateToken);
router.use(ensureTenantIsolation);

// GET /api/receptionist/stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    
    // Get real-time stats
    const activeCalls = await prisma.agentInteraction.count({
      where: {
        tenantId,
        agentType: 'receptionist',
        interactionType: 'voice_call',
        content: { path: ['callStatus'], equals: 'active' }
      }
    });

    const pendingSMS = await prisma.agentInteraction.count({
      where: {
        tenantId,
        agentType: 'receptionist',
        interactionType: 'sms',
        successOutcome: null // Pending response
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const appointmentsBookedToday = await prisma.appointment.count({
      where: {
        tenantId,
        createdAt: { gte: today }
      }
    });

    const patientsCreatedToday = await prisma.patient.count({
      where: {
        tenantId,
        createdAt: { gte: today }
      }
    });

    res.json({
      activeCalls,
      pendingSMS,
      appointmentsBookedToday,
      patientsCreatedToday,
      avgCallDuration: 4.2, // Calculate from real data
      successRate: 0.85     // Calculate from real data
    });

  } catch (error) {
    console.error('Receptionist stats error:', error);
    res.status(500).json({ error: 'Failed to get receptionist stats' });
  }
});

// GET /api/receptionist/appointment-suggestions
router.get('/appointment-suggestions', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    
    // Get recent SMS/voice interactions asking for appointments
    const suggestions = await prisma.agentInteraction.findMany({
      where: {
        tenantId,
        agentType: 'receptionist',
        content: { path: ['intent'], equals: 'appointment_booking' },
        successOutcome: null,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      include: { patient: true },
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    const formattedSuggestions = suggestions.map(interaction => ({
      id: interaction.id,
      patientName: interaction.patient ? 
        `${interaction.patient.firstName} ${interaction.patient.lastName}` : 
        'Unknown Patient',
      phoneNumber: (interaction.content as any).phoneNumber || '',
      appointmentType: (interaction.content as any).appointmentType || 'General Consultation',
      urgency: (interaction.content as any).urgency || 'medium',
      aiReasoning: `Patient requested appointment via ${interaction.channel}`,
      confidence: interaction.confidenceScore,
      suggestedSlots: [] // Will be populated by scheduler
    }));

    res.json(formattedSuggestions);

  } catch (error) {
    res.status(500).json({ error: 'Failed to get appointment suggestions' });
  }
});

// POST /api/receptionist/scan-insurance-card
router.post('/scan-insurance-card', async (req: AuthRequest, res) => {
  try {
    const { imageData } = req.body;
    
    // Mock implementation - in production, use OCR service
    const extractedData = {
      insuranceProvider: "Blue Cross Blue Shield",
      insuranceNumber: "ABC123456789",
      insuranceGroupNumber: "GRP001",
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1985-03-15"
    };

    res.json({
      confidence: 0.92,
      extractedData,
      warnings: [],
      suggestions: ['Please verify the member ID number']
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to scan insurance card' });
  }
});

// POST /api/receptionist/validate-patient-info
router.post('/validate-patient-info', async (req: AuthRequest, res) => {
  try {
    const patientData = req.body;
    
    // Basic validation
    const isValid = patientData.firstName && 
                   patientData.lastName && 
                   patientData.dateOfBirth;

    res.json({
      isValid,
      suggestions: isValid ? [] : ['Missing required fields: firstName, lastName, dateOfBirth']
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to validate patient info' });
  }
});

// POST /api/receptionist/answer-call
router.post('/answer-call/:callId', async (req: AuthRequest, res) => {
  try {
    const { callId } = req.params;
    
    // Update call status
    await prisma.agentInteraction.updateMany({
      where: {
        tenantId: req.user!.tenantId,
        content: { path: ['callId'], equals: callId }
      },
      data: {
        content: {
          // Spread existing content and update status
          callStatus: 'answered',
          answeredAt: new Date().toISOString()
        }
      }
    });

    res.json({ success: true, message: 'Call answered' });

  } catch (error) {
    res.status(500).json({ error: 'Failed to answer call' });
  }
});

// POST /api/receptionist/end-call
router.post('/end-call/:callId', async (req: AuthRequest, res) => {
  try {
    const { callId } = req.params;
    
    await prisma.agentInteraction.updateMany({
      where: {
        tenantId: req.user!.tenantId,
        content: { path: ['callId'], equals: callId }
      },
      data: {
        content: {
          callStatus: 'completed',
          endedAt: new Date().toISOString()
        },
        successOutcome: true
      }
    });

    res.json({ success: true, message: 'Call ended' });

  } catch (error) {
    res.status(500).json({ error: 'Failed to end call' });
  }
});

// POST /api/receptionist/generate-ai-response
router.post('/generate-ai-response/:conversationId', async (req: AuthRequest, res) => {
  try {
    const { conversationId } = req.params;
    
    // Get conversation history
    const interaction = await prisma.agentInteraction.findUnique({
      where: { id: conversationId },
      include: { patient: true }
    });

    if (!interaction) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Generate AI response using ReceptionistAgent
    const response = await ReceptionistAgent.processSMS(
      req.user!.tenantId,
      (interaction.content as any).phoneNumber || '',
      (interaction.content as any).lastMessage || '',
      interaction.patientId || undefined
    );

    res.json({
      suggestedResponse: response.response,
      intent: response.intent,
      confidence: response.confidence
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

export { router as receptionistRouter };