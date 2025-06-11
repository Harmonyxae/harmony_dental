import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      log: [
        { level: 'error', emit: 'stdout' },
        { level: 'info', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
      errorFormat: 'pretty',
    });

    // Simple connection logging - no query events
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Database client initialized in development mode');
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public getClient(): PrismaClient {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('📤 Database disconnected successfully');
    } catch (error) {
      logger.error('❌ Database disconnection failed:', error);
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('❌ Database health check failed:', error);
      return false;
    }
  }

  public async getTenant(tenantId: string) {
    try {
      return await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          users: true,
          patients: true,
          providers: true,
        },
      });
    } catch (error) {
      logger.error(`❌ Failed to get tenant ${tenantId}:`, error);
      throw error;
    }
  }

  public async validateTenantAccess(tenantId: string, userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          tenantId: tenantId,
        },
      });
      return !!user;
    } catch (error) {
      logger.error(`❌ Failed to validate tenant access:`, error);
      return false;
    }
  }
}

export const database = DatabaseService.getInstance();
export const prisma = database.getClient();

export const {
  connect: connectDatabase,
  disconnect: disconnectDatabase,
  healthCheck: databaseHealthCheck,
  getTenant,
  validateTenantAccess,
} = database;
