import OpenAI from 'openai';
import { config } from '../config/config';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export interface MemoryEntry {
  key: string;
  value: any;
  contextId?: string;
  memoryType: 'patient_specific' | 'practice_specific' | 'cross_practice';
  confidenceLevel: number;
  source: 'interaction' | 'manual' | 'imported';
  tags?: string[];
}

export interface MemoryQuery {
  query: string;
  contextId?: string;
  memoryType?: string;
  limit?: number;
  minConfidence?: number;
}

export class AgentMemoryService {

  // Store a new memory entry
  static async storeMemory(
    tenantId: string,
    agentType: string,
    memoryEntry: MemoryEntry,
    interactionId?: string
  ): Promise<void> {
    try {
      // Generate embedding for the memory content
      const embedding = await this.generateEmbedding(JSON.stringify(memoryEntry.value));

      // Check if similar memory already exists
      const existingMemory = await prisma.agentMemory.findFirst({
        where: {
          tenantId,
          agentType,
          memoryType: memoryEntry.memoryType,
          contextId: memoryEntry.contextId,
          memoryKey: memoryEntry.key
        }
      });

      if (existingMemory) {
        // Update existing memory
        await prisma.agentMemory.update({
          where: { id: existingMemory.id },
          data: {
            memoryValue: memoryEntry.value,
            confidenceLevel: Math.max(existingMemory.confidenceLevel.toNumber(), memoryEntry.confidenceLevel),
            usageCount: existingMemory.usageCount + 1,
            lastReinforced: new Date(),
            learnedFromInteractionId: interactionId
          }
        });
      } else {
        // Create new memory
        await prisma.agentMemory.create({
          data: {
            tenantId,
            agentType,
            memoryType: memoryEntry.memoryType,
            contextId: memoryEntry.contextId,
            memoryKey: memoryEntry.key,
            memoryValue: memoryEntry.value,
            confidenceLevel: memoryEntry.confidenceLevel,
            learnedFromInteractionId: interactionId
          }
        });
      }

      logger.info(`Memory stored: ${memoryEntry.key} for ${agentType} agent`);

    } catch (error) {
      logger.error('Failed to store memory:', error);
      throw error;
    }
  }

  // Retrieve relevant memories using RAG
  static async retrieveMemories(
    tenantId: string,
    agentType: string,
    query: MemoryQuery
  ): Promise<any[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query.query);

      // Build where conditions
      const whereConditions: any = {
        tenantId,
        agentType,
        confidenceLevel: {
          gte: query.minConfidence || 0.5
        }
      };

      if (query.memoryType) {
        whereConditions.memoryType = query.memoryType;
      }

      if (query.contextId) {
        whereConditions.contextId = query.contextId;
      }

      // Get memories (in production, you'd use vector similarity search)
      const memories = await prisma.agentMemory.findMany({
        where: whereConditions,
        orderBy: [
          { usageCount: 'desc' },
          { lastReinforced: 'desc' }
        ],
        take: query.limit || 10
      });

      // Filter and rank memories based on relevance
      const relevantMemories = await this.rankMemoriesByRelevance(
        memories,
        query.query,
        queryEmbedding
      );

      // Update usage count for retrieved memories
      const memoryIds = relevantMemories.map(m => m.id);
      if (memoryIds.length > 0) {
        await prisma.agentMemory.updateMany({
          where: { id: { in: memoryIds } },
          data: { usageCount: { increment: 1 } }
        });
      }

      return relevantMemories;

    } catch (error) {
      logger.error('Failed to retrieve memories:', error);
      return [];
    }
  }

  // Learn from successful interactions
  static async learnFromInteraction(
    tenantId: string,
    agentType: string,
    interactionId: string,
    outcome: 'success' | 'failure',
    userFeedback?: string
  ): Promise<void> {
    try {
      // Get the interaction details
      const interaction = await prisma.agentInteraction.findUnique({
        where: { id: interactionId },
        include: { patient: true }
      });

      if (!interaction) {
        logger.warn(`Interaction not found for learning: ${interactionId}`);
        return;
      }

      const content = interaction.content as any;

      // Extract learnable patterns based on outcome
      if (outcome === 'success') {
        await this.extractSuccessPatterns(tenantId, agentType, interaction, interactionId);
      } else {
        await this.extractFailurePatterns(tenantId, agentType, interaction, userFeedback, interactionId);
      }

      // Update interaction with learning outcome
      await prisma.agentInteraction.update({
        where: { id: interactionId },
        data: {
          successOutcome: outcome === 'success',
          humanFeedback: userFeedback
        }
      });

      logger.info(`Learning completed from interaction: ${interactionId}`);

    } catch (error) {
      logger.error('Failed to learn from interaction:', error);
    }
  }

  // Extract successful patterns for learning
  private static async extractSuccessPatterns(
    tenantId: string,
    agentType: string,
    interaction: any,
    interactionId: string
  ): Promise<void> {
    const content = interaction.content as any;

    // Learn patient communication preferences
    if (interaction.patientId && content.agentResponse) {
      const patientMemory: MemoryEntry = {
        key: `communication_preference_${interaction.channel}`,
        value: {
          preferredChannel: interaction.channel,
          responseStyle: content.agentResponse.length > 100 ? 'detailed' : 'concise',
          successfulTone: this.analyzeTone(content.agentResponse),
          timestamp: interaction.createdAt
        },
        contextId: interaction.patientId,
        memoryType: 'patient_specific',
        confidenceLevel: 0.8,
        source: 'interaction'
      };

      await this.storeMemory(tenantId, agentType, patientMemory, interactionId);
    }

    // Learn successful response patterns for intent
    if (content.intent && content.agentResponse) {
      const intentMemory: MemoryEntry = {
        key: `successful_response_${content.intent}`,
        value: {
          intent: content.intent,
          successfulResponse: content.agentResponse,
          context: content.userMessage || content.userSpeech,
          channel: interaction.channel,
          confidenceScore: content.confidence || 1.0
        },
        memoryType: 'practice_specific',
        confidenceLevel: 0.9,
        source: 'interaction'
      };

      await this.storeMemory(tenantId, agentType, intentMemory, interactionId);
    }

    // Learn appointment booking patterns
    if (content.intent === 'appointment_booking' && content.appointmentCreated) {
      const bookingMemory: MemoryEntry = {
        key: 'successful_booking_pattern',
        value: {
          userRequest: content.userMessage,
          bookingFlow: content.bookingFlow,
          appointmentDetails: content.appointmentDetails,
          conversionSteps: content.conversionSteps
        },
        memoryType: 'practice_specific',
        confidenceLevel: 1.0,
        source: 'interaction'
      };

      await this.storeMemory(tenantId, agentType, bookingMemory, interactionId);
    }
  }

  // Extract failure patterns for improvement
  private static async extractFailurePatterns(
    tenantId: string,
    agentType: string,
    interaction: any,
    userFeedback: string | undefined,
    interactionId: string
  ): Promise<void> {
    const content = interaction.content as any;

    // Learn from failed interactions
    if (content.intent && content.agentResponse) {
      const failureMemory: MemoryEntry = {
        key: `failed_response_${content.intent}`,
        value: {
          intent: content.intent,
          failedResponse: content.agentResponse,
          userContext: content.userMessage || content.userSpeech,
          failureReason: userFeedback || 'Unknown',
          channel: interaction.channel,
          timestamp: interaction.createdAt
        },
        memoryType: 'practice_specific',
        confidenceLevel: 0.3, // Low confidence for failure patterns
        source: 'interaction'
      };

      await this.storeMemory(tenantId, agentType, failureMemory, interactionId);
    }

    // Store feedback for future improvement
    if (userFeedback) {
      const feedbackMemory: MemoryEntry = {
        key: 'user_feedback',
        value: {
          feedback: userFeedback,
          context: content,
          interactionType: interaction.interactionType,
          channel: interaction.channel,
          timestamp: interaction.createdAt
        },
        contextId: interaction.patientId,
        memoryType: 'patient_specific',
        confidenceLevel: 1.0,
        source: 'manual'
      };

      await this.storeMemory(tenantId, agentType, feedbackMemory, interactionId);
    }
  }

  // Get contextual memories for agent responses
  static async getContextualMemories(
    tenantId: string,
    agentType: string,
    patientId?: string,
    intent?: string,
    channel?: string
  ): Promise<string> {
    try {
      let contextMemories : any[] = [];

      // Get patient-specific memories
      if (patientId) {
        const patientMemories = await this.retrieveMemories(tenantId, agentType, {
          query: `patient preferences communication ${channel}`,
          contextId: patientId,
          memoryType: 'patient_specific',
          limit: 3
        });
        contextMemories.push(...patientMemories);
      }

      // Get intent-specific successful patterns
      if (intent) {
        const intentMemories = await this.retrieveMemories(tenantId, agentType, {
          query: `successful response ${intent}`,
          memoryType: 'practice_specific',
          limit: 2
        });
        contextMemories.push(...intentMemories);
      }

      // Get general practice patterns
      const practiceMemories = await this.retrieveMemories(tenantId, agentType, {
        query: `practice specific patterns ${channel}`,
        memoryType: 'practice_specific',
        limit: 2
      });
      contextMemories.push(...practiceMemories);

      // Format memories for AI context
      if (contextMemories.length === 0) {
        return '';
      }

      const formattedContext = contextMemories.map(memory => {
        const value = memory.memoryValue as any;
        return `Memory: ${memory.memoryKey}\nContent: ${JSON.stringify(value)}\nConfidence: ${memory.confidenceLevel}`;
      }).join('\n\n');

      return `\n\nRELEVANT CONTEXT FROM PREVIOUS INTERACTIONS:\n${formattedContext}\n\nUse this context to provide more personalized and effective responses.`;

    } catch (error) {
      logger.error('Failed to get contextual memories:', error);
      return '';
    }
  }

  // Generate embedding for text (simplified - in production use proper vector DB)
  private static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      return response.data[0].embedding;

    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      return [];
    }
  }

  // Rank memories by relevance (simplified similarity)
  private static async rankMemoriesByRelevance(
    memories: any[],
    query: string,
    queryEmbedding: number[]
  ): Promise<any[]> {
    // Simplified ranking - in production, use proper vector similarity
    return memories
      .map(memory => ({
        ...memory,
        relevanceScore: this.calculateSimpleRelevance(memory, query)
      }))
      .filter(memory => memory.relevanceScore > 0.3)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  // Simple relevance calculation (replace with proper vector similarity)
  private static calculateSimpleRelevance(memory: any, query: string): number {
    const memoryText = JSON.stringify(memory.memoryValue).toLowerCase();
    const queryLower = query.toLowerCase();
    
    const words = queryLower.split(' ');
    let matchScore = 0;

    words.forEach(word => {
      if (memoryText.includes(word)) {
        matchScore += 1;
      }
    });

    return Math.min(matchScore / words.length, 1.0);
  }

  // Analyze tone of text (simplified)
  private static analyzeTone(text: string): string {
    const friendlyWords = ['please', 'thank', 'happy', 'glad', 'welcome'];
    const professionalWords = ['appointment', 'schedule', 'confirm', 'office'];
    
    const lowerText = text.toLowerCase();
    
    const friendlyCount = friendlyWords.filter(word => lowerText.includes(word)).length;
    const professionalCount = professionalWords.filter(word => lowerText.includes(word)).length;

    if (friendlyCount > professionalCount) return 'friendly';
    if (professionalCount > friendlyCount) return 'professional';
    return 'balanced';
  }

  // Clean up old memories (maintenance function)
  static async cleanupOldMemories(tenantId: string, daysToKeep: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Delete low-confidence, unused memories
      const result = await prisma.agentMemory.deleteMany({
        where: {
          tenantId,
          createdAt: { lt: cutoffDate },
          usageCount: { lt: 2 },
          confidenceLevel: { lt: 0.5 }
        }
      });

      logger.info(`Cleaned up ${result.count} old memories for tenant ${tenantId}`);

    } catch (error) {
      logger.error('Failed to cleanup old memories:', error);
    }
  }
}