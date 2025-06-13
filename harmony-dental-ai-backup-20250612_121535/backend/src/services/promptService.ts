import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { DEFAULT_PROMPT_TEMPLATES, PromptTemplate } from '../models/aiPromptTemplates';

export interface PromptContext {
  tenantId: string;
  patientId?: string;
  appointmentId?: string;
  providerId?: string;
  [key: string]: any; // Additional context variables
}

export class PromptService {
  
  // Initialize default prompts for a new tenant
  static async initializeDefaultPrompts(tenantId: string): Promise<void> {
    try {
      // Create default prompt templates if they don't exist
      await this.ensureDefaultTemplatesExist();
      
      // Create default customizations for the tenant
      for (const template of DEFAULT_PROMPT_TEMPLATES) {
        await prisma.promptCustomization.upsert({
          where: {
            tenantId_templateId: {
              tenantId,
              templateId: template.id
            }
          },
          create: {
            tenantId,
            templateId: template.id,
            customPrompt: template.defaultPrompt,
            variables: await this.getDefaultVariables(tenantId),
            lastModifiedBy: 'system',
            notes: 'Default initialization'
          },
          update: {} // Don't override existing customizations
        });
      }

      logger.info(`Default prompts initialized for tenant: ${tenantId}`);
      
    } catch (error) {
      logger.error('Failed to initialize default prompts:', error);
      throw error;
    }
  }

  // Get a specific prompt for a tenant with variables resolved
  static async getPrompt(
    tenantId: string, 
    agentType: string, 
    category: string, 
    context: PromptContext = { tenantId }
  ): Promise<string> {
    try {
      // Find the template
      const template = await prisma.promptTemplate.findFirst({
        where: { agentType, category }
      });

      if (!template) {
        throw new Error(`Prompt template not found: ${agentType}/${category}`);
      }

      // Get tenant's customization
      const customization = await prisma.promptCustomization.findUnique({
        where: {
          tenantId_templateId: {
            tenantId,
            templateId: template.id
          }
        },
        include: { tenant: true }
      });

      if (!customization || !customization.isActive) {
        // Fall back to default template
        return this.resolveVariables(template.defaultPrompt, context);
      }

      // Use customized prompt with resolved variables
      const resolvedPrompt = this.resolveVariables(
        customization.customPrompt, 
        { ...context, ...customization.variables as object }
      );

      return resolvedPrompt;

    } catch (error) {
      logger.error('Failed to get prompt:', error);
      throw error;
    }
  }

  // Update a prompt customization for a tenant
  static async updatePrompt(
    tenantId: string,
    templateId: string,
    customPrompt: string,
    variables: Record<string, any>,
    userId: string,
    notes?: string
  ): Promise<void> {
    try {
      await prisma.promptCustomization.upsert({
        where: {
          tenantId_templateId: {
            tenantId,
            templateId
          }
        },
        create: {
          tenantId,
          templateId,
          customPrompt,
          variables,
          lastModifiedBy: userId,
          notes
        },
        update: {
          customPrompt,
          variables,
          lastModifiedBy: userId,
          notes,
          updatedAt: new Date()
        }
      });

      logger.info(`Prompt updated: ${templateId} for tenant ${tenantId}`);

    } catch (error) {
      logger.error('Failed to update prompt:', error);
      throw error;
    }
  }

  // Get all prompts for a tenant (for UI management)
  static async getTenantPrompts(tenantId: string): Promise<any[]> {
    try {
      const prompts = await prisma.promptTemplate.findMany({
        include: {
          customizations: {
            where: { tenantId },
            select: {
              customPrompt: true,
              variables: true,
              isActive: true,
              lastModifiedBy: true,
              updatedAt: true,
              notes: true
            }
          }
        },
        orderBy: [
          { agentType: 'asc' },
          { category: 'asc' }
        ]
      });

      return prompts.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        agentType: template.agentType,
        category: template.category,
        defaultPrompt: template.defaultPrompt,
        variables: template.variables,
        isSystem: template.isSystem,
        customization: template.customizations[0] || null
      }));

    } catch (error) {
      logger.error('Failed to get tenant prompts:', error);
      throw error;
    }
  }

  // Resolve variables in a prompt template
  private static resolveVariables(prompt: string, context: PromptContext): string {
    let resolvedPrompt = prompt;

    // Get dynamic context data
    const dynamicContext = this.buildDynamicContext(context);
    const allContext = { ...context, ...dynamicContext };

    // Replace all variables in the format {variableName}
    Object.entries(allContext).forEach(([key, value]) => {
      const regex = new RegExp(`{${key}}`, 'g');
      resolvedPrompt = resolvedPrompt.replace(regex, String(value || ''));
    });

    return resolvedPrompt;
  }

  // Build dynamic context from database
  private static async buildDynamicContext(context: PromptContext): Promise<Record<string, any>> {
    const dynamicContext: Record<string, any> = {};

    try {
      // Get tenant info
      if (context.tenantId) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: context.tenantId }
        });
        
        if (tenant) {
          dynamicContext.practiceName = tenant.name;
          dynamicContext.practicePhone = tenant.phone;
          dynamicContext.practiceAddress = tenant.address;
        }
      }

      // Get patient info
      if (context.patientId) {
        const patient = await prisma.patient.findUnique({
          where: { id: context.patientId }
        });
        
        if (patient) {
          dynamicContext.patientFirstName = patient.firstName;
          dynamicContext.patientLastName = patient.lastName;
          dynamicContext.patientFullName = `${patient.firstName} ${patient.lastName}`;
        }
      }

      // Get appointment info
      if (context.appointmentId) {
        const appointment = await prisma.appointment.findUnique({
          where: { id: context.appointmentId },
          include: { provider: true }
        });
        
        if (appointment) {
          dynamicContext.appointmentDate = appointment.startTime.toLocaleDateString();
          dynamicContext.appointmentTime = appointment.startTime.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          dynamicContext.providerName = appointment.provider ? 
            `Dr. ${appointment.provider.lastName}` : 'our team';
        }
      }

      // Get provider info
      if (context.providerId) {
        const provider = await prisma.provider.findUnique({
          where: { id: context.providerId }
        });
        
        if (provider) {
          dynamicContext.providerName = `Dr. ${provider.lastName}`;
          dynamicContext.providerFirstName = provider.firstName;
          dynamicContext.providerSpecialty = provider.specialty;
        }
      }

    } catch (error) {
      logger.error('Failed to build dynamic context:', error);
    }

    return dynamicContext;
  }

  // Get default variables for a tenant
  public static async getDefaultVariables(tenantId: string): Promise<Record<string, any>> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });

      return {
        agentName: 'Harmony',
        practiceName: tenant?.name || 'Our Dental Practice',
        practicePhone: tenant?.phone || '(555) 123-4567',
        practiceAddress: tenant?.address || '123 Main St, Your City',
        communicationTone: 'friendly and professional',
        officeHours: 'Monday-Friday 8:00 AM - 5:00 PM',
        emergencyProtocol: 'For dental emergencies outside office hours, please call our emergency line.',
        cancellationPolicy: 'Please give us 24 hours notice for cancellations.',
        // Add more defaults as needed
      };
    } catch (error) {
      logger.error('Failed to get default variables:', error);
      return {};
    }
  }

  // Ensure default templates exist in database
  private static async ensureDefaultTemplatesExist(): Promise<void> {
    for (const template of DEFAULT_PROMPT_TEMPLATES) {
      await prisma.promptTemplate.upsert({
        where: { id: template.id },
        create: template,
        update: {
          name: template.name,
          description: template.description,
          defaultPrompt: template.defaultPrompt,
          variables: template.variables,
          // Don't update isSystem to prevent overriding user changes
        }
      });
    }
  }
}