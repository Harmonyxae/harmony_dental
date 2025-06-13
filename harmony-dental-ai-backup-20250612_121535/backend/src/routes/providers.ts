import { Router } from 'express';
import Joi from 'joi';
import { prisma } from '../config/database';
import { 
  authenticateToken, 
  ensureTenantIsolation, 
  authorizeRoles,
  AuthRequest 
} from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Validation schemas
const createProviderSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  specialty: Joi.string().optional(),
  licenseNumber: Joi.string().optional(),
  npiNumber: Joi.string().optional(),
  schedulePreferences: Joi.object().default({}),
});

// Get all providers for tenant
router.get('/', async (req: AuthRequest, res) => {
  try {
    const providers = await prisma.provider.findMany({
      where: {
        tenantId: req.user!.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        licenseNumber: true,
        schedulePreferences: true,
        avgTreatmentTime: true,
        patientSatisfactionScore: true,
        productionEfficiencyScore: true,
        createdAt: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ]
    });

    res.json({ providers });

  } catch (error) {
    logger.error('Providers fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Create new provider
router.post('/', authorizeRoles('admin'), async (req: AuthRequest, res) => {
  try {
    const { error, value } = createProviderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const provider = await prisma.provider.create({
      data: {
        ...value,
        tenantId: req.user!.tenantId,
        treatmentPreferences: {},
        codingPatterns: {},
        voiceRecognitionProfile: {},
        avgTreatmentTime: {},
      }
    });

    logger.info(`Provider created: ${provider.firstName} ${provider.lastName}`);

    res.status(201).json({
      message: 'Provider created successfully',
      provider,
    });

  } catch (error) {
    logger.error('Provider creation error:', error);
    res.status(500).json({ error: 'Failed to create provider' });
  }
});

export { router as providerRouter };