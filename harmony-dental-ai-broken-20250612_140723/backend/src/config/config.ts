import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
  // Application
  NODE_ENV: string;
  PORT: number;
  FRONTEND_URL: string;
  API_BASE_URL: string;
  
  // Database
  DATABASE_URL: string;
  REDIS_URL: string;
  
  // Authentication
  JWT_SECRET: string;
  jwtSecret: string;  // Alias for auth.ts
  jwtExpiresIn: string;
  bcryptRounds: number;
  
  // AI Services
  OPENAI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  
  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  
  // Other settings
  DEFAULT_CONFIDENCE_THRESHOLD: number;
  MEMORY_RETENTION_DAYS: number;
  LOG_LEVEL: string;
}

// Required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER'
];

// Validate required environment variables
function validateEnvVars(): void {
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file and ensure all required variables are set');
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Validate environment variables
validateEnvVars();

export const config = {
  // Application
  app: {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3002'),
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3002',
  },
  
  // Database
  database: {
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  // Authentication
  auth: {
    JWT_SECRET: process.env.JWT_SECRET!,
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
  },
  
  // AI Services
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
  },
  
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY!,
  },
  
  // Twilio
  twilio: {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID!,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN!,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER!,
  },
  
  // Other settings
  DEFAULT_CONFIDENCE_THRESHOLD: parseFloat(process.env.DEFAULT_CONFIDENCE_THRESHOLD || '0.5'),
  MEMORY_RETENTION_DAYS: parseInt(process.env.MEMORY_RETENTION_DAYS || '90'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Backward compatibility - keep the flat structure too
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3002'),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3002',
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY!,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID!,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN!,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER!,
};


// Additional properties for voice service
export const voiceConfig = {
  systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful dental receptionist.',
  firstMessage: process.env.FIRST_MESSAGE || 'Hello! How can I help you today?',
  voiceId: process.env.VOICE_ID || 'default',
  tools: JSON.parse(process.env.TOOLS || '[]')
};
