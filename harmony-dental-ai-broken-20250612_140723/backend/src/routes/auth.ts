import { Router } from 'express';
import Joi from 'joi';
import { prisma } from '../config/database';
import { 
  hashPassword, 
  comparePassword, 
  generateToken,
  authenticateToken,
  AuthRequest 
} from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  practiceName: Joi.string().required(),
  subdomain: Joi.string().alphanum().min(3).max(30).required(),
  phone: Joi.string().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Register new practice (creates tenant + admin user)
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, firstName, lastName, practiceName, subdomain, phone } = value;

    // Check if subdomain or email already exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain }
    });

    if (existingTenant) {
      return res.status(400).json({ error: 'Subdomain already taken' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create tenant and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: practiceName,
          subdomain,
          phone,
          aiConfig: {
            receptionist: { enabled: true },
            scheduler: { enabled: true },
            billing: { enabled: false }, // Start with basic agents
          }
        }
      });

      // Create admin user
      const hashedPassword = await hashPassword(password);
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: 'admin'
        }
      });

      return { tenant, user };
    });

    // Generate JWT token
    const token = generateToken(result.user.id, result.tenant.id);

    logger.info(`New practice registered: ${practiceName} (${subdomain})`);

    res.status(201).json({
      message: 'Practice registered successfully',
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        subdomain: result.tenant.subdomain,
        planType: result.tenant.planType
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    // Find user with tenant info
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.tenant.isActive) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate token
    const token = generateToken(user.id, user.tenantId, user.email);

    logger.info(`User login: ${email} (${user.tenant.name})`);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        subdomain: user.tenant.subdomain,
        planType: user.tenant.planType
      },
      token: token // ENSURE TOKEN IS RETURNED
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            planType: true,
            aiConfig: true
          }
        }
      }
    });
    res.json({ user });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const newToken = generateToken(req.user!.id, req.user!.tenantId);
    res.json({ token: newToken });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

export { router as authRouter };