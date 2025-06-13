import { prisma } from '../config/database';
import { Router } from 'express';
import Joi from 'joi';
import { 
  authenticateToken, 
  ensureTenantIsolation, 
  authorizeRoles,
  AuthRequest 
} from '../middleware/auth';
import { PromptService } from '../services/promptService';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Validation schemas
const updatePromptSchema = Joi.object({
  customPrompt: Joi.string().required(),
  variables: Joi.object().default({}),
  notes: Joi.string().optional()
});

// Get all prompts for the tenant
router.get('/', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const prompts = await PromptService.getTenantPrompts(req.user!.tenantId);
    
    res.json({ prompts });

  } catch (error) {
    logger.error('Failed to fetch prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// Get prompts by agent type
router.get('/agent/:agentType', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { agentType } = req.params;
    
    const allPrompts = await PromptService.getTenantPrompts(req.user!.tenantId);
    const agentPrompts = allPrompts.filter(p => p.agentType === agentType);
    
    res.json({ 
      agentType,
      prompts: agentPrompts 
    });

  } catch (error) {
    logger.error('Failed to fetch agent prompts:', error);
    res.status(500).json({ error: 'Failed to fetch agent prompts' });
  }
});

// Update a specific prompt
router.put('/:templateId', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { templateId } = req.params;
    const { error, value } = updatePromptSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { customPrompt, variables, notes } = value;

    await PromptService.updatePrompt(
      req.user!.tenantId,
      templateId,
      customPrompt,
      variables,
      req.user!.id,
      notes
    );

    logger.info(`Prompt updated: ${templateId} by ${req.user!.email}`);

    res.json({ 
      message: 'Prompt updated successfully',
      templateId 
    });

  } catch (error) {
    logger.error('Failed to update prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// Reset prompt to default
router.post('/:templateId/reset', authorizeRoles('admin'), async (req: AuthRequest, res) => {
  try {
    const { templateId } = req.params;

    // Get the default template
    const template = await prisma.promptTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Reset to default
    await PromptService.updatePrompt(
      req.user!.tenantId,
      templateId,
      template.defaultPrompt,
      await PromptService.getDefaultVariables(req.user!.tenantId),
      req.user!.id,
      'Reset to default'
    );

    logger.info(`Prompt reset to default: ${templateId} by ${req.user!.email}`);

    res.json({ 
      message: 'Prompt reset to default successfully',
      templateId 
    });

  } catch (error) {
    logger.error('Failed to reset prompt:', error);
    res.status(500).json({ error: 'Failed to reset prompt' });
  }
});

// Test a prompt with sample data
router.post('/:templateId/test', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { templateId } = req.params;
    const { testContext = {} } = req.body;

    // Get the template
    const template = await prisma.promptTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Generate test prompt with context
    const testPrompt = await PromptService.getPrompt(
      req.user!.tenantId,
      template.agentType,
      template.category,
      { tenantId: req.user!.tenantId, ...testContext }
    );

    res.json({ 
      templateId,
      testPrompt,
      context: testContext
    });

  } catch (error) {
    logger.error('Failed to test prompt:', error);
    res.status(500).json({ error: 'Failed to test prompt' });
  }
});

// Get available variables for a template
router.get('/:templateId/variables', authorizeRoles('admin', 'doctor'), async (req: AuthRequest, res) => {
  try {
    const { templateId } = req.params;

    const template = await prisma.promptTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get default variables for this tenant
    const defaultVariables = await PromptService.getDefaultVariables(req.user!.tenantId);

    res.json({
      templateId,
      availableVariables: template.variables,
      currentValues: defaultVariables,
      description: template.description
    });

  } catch (error) {
    logger.error('Failed to get template variables:', error);
    res.status(500).json({ error: 'Failed to get template variables' });
  }
});

export { router as promptRouter };