import { Router } from 'express';
import { VoiceService } from '../services/voiceService';
import { AgentMemoryService } from '../services/agentMemoryService';
import { 
  authenticateToken, 
  ensureTenantIsolation, 
  authorizeRoles,
  AuthRequest 
} from '../middleware/auth';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

const router = Router();

router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Get available voices
router.get('/voices', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const voices = await VoiceService.getAvailableVoices();
    
    res.json({ voices });

  } catch (error) {
    logger.error('Failed to fetch voices:', error);
    res.status(500).json({ error: 'Failed to fetch available voices' });
  }
});

// Test text-to-speech
router.post('/test-tts', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { text, voiceConfig } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const { audioUrl } = await VoiceService.textToSpeech(
      text,
      req.user!.tenantId,
      voiceConfig
    );

    res.json({ 
      message: 'TTS generated successfully',
      audioUrl,
      text 
    });

  } catch (error) {
    logger.error('TTS test failed:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// Update voice settings
router.put('/settings', authorizeRoles('admin'), async (req: AuthRequest, res) => {
  try {
    const { voiceConfig } = req.body;

    await VoiceService.updateVoiceSettings(
      req.user!.tenantId,
      voiceConfig
    );

    res.json({ message: 'Voice settings updated successfully' });

  } catch (error) {
    logger.error('Failed to update voice settings:', error);
    res.status(500).json({ error: 'Failed to update voice settings' });
  }
});

// Get agent memory insights
router.get('/memory/insights', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { agentType = 'receptionist', days = 30 } = req.query;

    // Get memory statistics
    const memoryStats = await prisma.agentMemory.groupBy({
      by: ['memoryType'],
      where: {
        tenantId: req.user!.tenantId,
        agentType: agentType as string,
        createdAt: {
          gte: new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000)
        }
      },
      _count: true,
      _avg: {
        confidenceLevel: true,
        usageCount: true
      }
    });

    // Get top memories
    const topMemories = await prisma.agentMemory.findMany({
      where: {
        tenantId: req.user!.tenantId,
        agentType: agentType as string
      },
      orderBy: [
        { usageCount: 'desc' },
        { confidenceLevel: 'desc' }
      ],
      take: 10,
      select: {
        memoryKey: true,
        memoryValue: true,
        usageCount: true,
        confidenceLevel: true,
        memoryType: true,
        lastReinforced: true
      }
    });

    res.json({
      stats: memoryStats,
      topMemories,
      agentType,
      period: `${days} days`
    });

  } catch (error) {
    logger.error('Failed to get memory insights:', error);
    res.status(500).json({ error: 'Failed to get memory insights' });
  }
});

// Train agent from feedback
router.post('/memory/train', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { interactionId, outcome, feedback } = req.body;

    await AgentMemoryService.learnFromInteraction(
      req.user!.tenantId,
      'receptionist',
      interactionId,
      outcome,
      feedback
    );

    res.json({ message: 'Agent training completed successfully' });

  } catch (error) {
    logger.error('Agent training failed:', error);
    res.status(500).json({ error: 'Failed to train agent' });
  }
});

// Get active calls
router.get('/active-calls', authorizeRoles('admin', 'doctor', 'receptionist'), async (req: AuthRequest, res) => {
  try {
    // Query recent calls from your database or Twilio
    const activeCalls = await prisma.appointment.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: 'in_progress', // Or however you track active calls
        startTime: {
          gte: new Date(Date.now() - 4 * 60 * 60 * 1000) // Last 4 hours
        }
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phoneWireless: true,
            phoneHome: true
          }
        }
      },
      orderBy: {
        startTime: 'desc'
      }
    });

    // Transform to match frontend expectations
    const callsData = activeCalls.map(call => ({
      id: call.id,
      patientName: `${call.patient?.firstName} ${call.patient?.lastName}`,
      phoneNumber: call.patient?.phoneWireless || call.patient?.phoneHome,
      startTime: call.startTime,
      status: 'in-progress',
      aiAgent: call.createdByAgent === 'ai', // FIXED: Convert string to boolean
      duration: Math.floor((new Date().getTime() - new Date(call.startTime).getTime()) / 1000)
    }));

    res.json(callsData);

  } catch (error) {
    logger.error('Failed to fetch active calls:', error);
    res.status(500).json({ error: 'Failed to fetch active calls' });
  }
});

// Get call queue
router.get('/queue', authorizeRoles('admin', 'doctor', 'receptionist'), async (req: AuthRequest, res) => {
  try {
    // Get pending appointments that might be waiting for calls
    const queuedCalls = await prisma.appointment.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: 'scheduled',
        startTime: {
          gte: new Date(),
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next 24 hours
        }
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phoneWireless: true,
            phoneHome: true
          }
        }
      },
      orderBy: {
        startTime: 'asc'
      },
      take: 10
    });

    const queueData = queuedCalls.map((call, index) => ({
      id: call.id,
      patientName: `${call.patient?.firstName} ${call.patient?.lastName}`,
      phoneNumber: call.patient?.phoneWireless || call.patient?.phoneHome,
      queuePosition: index + 1,
      estimatedWaitTime: (index + 1) * 120, // 2 minutes per position
      callReason: 'appointment_confirmation',
      scheduledTime: call.startTime
    }));

    res.json(queueData);

  } catch (error) {
    logger.error('Failed to fetch call queue:', error);
    res.status(500).json({ error: 'Failed to fetch call queue' });
  }
});

// Get call statistics
router.get('/stats', authorizeRoles('admin', 'doctor', 'receptionist'), async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's call stats from appointments
    const totalCallsToday = await prisma.appointment.count({
      where: {
        tenantId: req.user!.tenantId,
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    // FIXED: Use string instead of boolean for createdByAgent
    const successfulBookings = await prisma.appointment.count({
      where: {
        tenantId: req.user!.tenantId,
        createdByAgent: 'ai', // FIXED: Use string value
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    const activeCallsCount = await prisma.appointment.count({
      where: {
        tenantId: req.user!.tenantId,
        status: 'in_progress'
      }
    });

    const stats = {
      totalCallsToday,
      activeCallsCount,
      averageWaitTime: 45,
      successfulBookings,
      missedCalls: Math.max(0, totalCallsToday - successfulBookings),
      aiSuccessRate: totalCallsToday > 0 ? (successfulBookings / totalCallsToday) : 0
    };

    res.json(stats);

  } catch (error) {
    logger.error('Failed to fetch call stats:', error);
    res.status(500).json({ error: 'Failed to fetch call stats' });
  }
});

export { router as voiceManagementRouter };