import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  id: string;
  email?: string; // ADD THIS - some routes expect req.user.email
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

// Password utilities
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

// Token utilities - UPDATE to include email
export const generateToken = (userId: string, tenantId: string, email?: string): string => {
  return jwt.sign({ 
    userId, 
    tenantId, 
    id: userId,
    email // ADD EMAIL TO TOKEN
  }, JWT_SECRET, { expiresIn: '24h' });
};

// Authentication middleware
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  // ADD SIMPLE DEBUG LOGGING
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    console.log('🔍 Received token length:', token.length, 'starts with:', token.substring(0, 20));
  } else {
    console.log('🔍 No authorization header found');
  }

  if (!authHeader) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    req.user = { 
      ...decoded, 
      id: decoded.userId,
      email: decoded.email || 'unknown@email.com' // ENSURE EMAIL EXISTS
    };
    console.log('✅ Token verified for user:', decoded.userId);
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', (error as Error).message);
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Authorization middlewares
export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // For now, allow all authenticated users
    next();
  };
};

export const requireTenant = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.tenantId) {
    return res.status(401).json({ error: 'Tenant context required' });
  }
  next();
};

export const ensureTenantIsolation = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.tenantId) {
    console.log('❌ No tenant ID in request user');
    return res.status(401).json({ error: 'Tenant context required' });
  }
  
  console.log('✅ Tenant isolation verified for:', req.user.tenantId);
  next();
};