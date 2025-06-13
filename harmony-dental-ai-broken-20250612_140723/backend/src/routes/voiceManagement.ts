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

export { router as voiceManagementRouter };