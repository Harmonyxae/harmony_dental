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

// Apply authentication and tenant isolation to all routes
router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Validation schemas
const createAppointmentSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  providerId: Joi.string().uuid().optional(),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
  appointmentType: Joi.string().optional(),
  operatory: Joi.string().optional(),
  notes: Joi.string().optional(),
  pattern: Joi.string().optional(), // Open Dental compatibility
  status: Joi.string().valid('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show').default('scheduled'),
  
  // AI Scheduler fields
  createdByAgent: Joi.string().optional(),
  aiConfidenceScore: Joi.number().min(0).max(1).default(1.00),
  waitlistPriority: Joi.number().integer().min(0).default(0),
});

const updateAppointmentSchema = Joi.object({
  patientId: Joi.string().uuid(),
  providerId: Joi.string().uuid(),
  startTime: Joi.date(),
  endTime: Joi.date(),
  appointmentType: Joi.string(),
  operatory: Joi.string(),
  notes: Joi.string(),
  pattern: Joi.string(),
  status: Joi.string().valid('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'),
  createdByAgent: Joi.string(),
  aiConfidenceScore: Joi.number().min(0).max(1),
  waitlistPriority: Joi.number().integer().min(0),
});

const appointmentSearchSchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  providerId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  status: Joi.string().optional(),
  operatory: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// Get appointments with filtering, search and pagination
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { error, value } = appointmentSearchSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { startDate, endDate, providerId, patientId, status, operatory, page, limit } = value;
    const skip = (page - 1) * limit;

    // Build where conditions
    const whereConditions: any = {
      tenantId: req.user!.tenantId,
    };

    if (startDate && endDate) {
      whereConditions.startTime = {
        gte: startDate,
        lte: endDate,
      };
    } else if (startDate) {
      whereConditions.startTime = { gte: startDate };
    } else if (endDate) {
      whereConditions.startTime = { lte: endDate };
    }

    if (providerId) whereConditions.providerId = providerId;
    if (patientId) whereConditions.patientId = patientId;
    if (status) whereConditions.status = status;
    if (operatory) whereConditions.operatory = operatory;

    // Get appointments with related data
    const [appointments, totalCount] = await Promise.all([
      prisma.appointment.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: { startTime: 'asc' },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneWireless: true,
              email: true,
              noShowRiskScore: true,
            }
          },
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialty: true,
            }
          },
          procedures: {
            select: {
              id: true,
              procedureCode: true,
              status: true,
              amount: true,
            }
          }
        }
      }),
      prisma.appointment.count({ where: whereConditions })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      appointments,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    });

  } catch (error) {
    logger.error('Appointments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Get daily schedule view (optimized for scheduling interface)
router.get('/schedule/:date', async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const selectedDate = new Date(date);
    
    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Get start and end of day
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all appointments for the day, grouped by provider
    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId: req.user!.tenantId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        }
      },
      orderBy: [
        { providerId: 'asc' },
        { startTime: 'asc' }
      ],
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneWireless: true,
            noShowRiskScore: true,
            preferredAppointmentTimes: true,
          }
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
          }
        }
      }
    });

    // Group appointments by provider for easier scheduling UI
    const scheduleByProvider = appointments.reduce((acc: any, appointment) => {
      const providerId = appointment.providerId || 'unassigned';
      if (!acc[providerId]) {
        acc[providerId] = {
          provider: appointment.provider,
          appointments: []
        };
      }
      acc[providerId].appointments.push(appointment);
      return acc;
    }, {});

    // Get provider list for the practice
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
        schedulePreferences: true,
      }
    });

    res.json({
      date: selectedDate.toISOString().split('T')[0],
      scheduleByProvider,
      providers,
      totalAppointments: appointments.length,
    });

  } catch (error) {
    logger.error('Schedule fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Get single appointment by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        tenantId: req.user!.tenantId,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleInitial: true,
            dateOfBirth: true,
            phoneHome: true,
            phoneWireless: true,
            email: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            zipCode: true,
            noShowRiskScore: true,
            communicationPreferences: true,
            preferredAppointmentTimes: true,
          }
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
            schedulePreferences: true,
          }
        },
        procedures: {
          select: {
            id: true,
            procedureCode: true,
            toothNumber: true,
            surface: true,
            status: true,
            amount: true,
            notes: true,
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ appointment });

  } catch (error) {
    logger.error('Appointment fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// Create new appointment
router.post('/', authorizeRoles('admin', 'doctor', 'front_desk'), async (req: AuthRequest, res) => {
  try {
    const { error, value } = createAppointmentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { patientId, providerId, startTime, endTime, ...appointmentData } = value;

    // Validate patient exists and belongs to tenant
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        tenantId: req.user!.tenantId,
      }
    });

    if (!patient) {
      return res.status(400).json({ error: 'Invalid patient ID' });
    }

    // Validate provider if specified
    if (providerId) {
      const provider = await prisma.provider.findFirst({
        where: {
          id: providerId,
          tenantId: req.user!.tenantId,
          isActive: true,
        }
      });

      if (!provider) {
        return res.status(400).json({ error: 'Invalid provider ID' });
      }
    }

    // Check for appointment conflicts
    const conflictingAppointments = await prisma.appointment.findMany({
      where: {
        tenantId: req.user!.tenantId,
        providerId: providerId || undefined,
        status: { not: 'cancelled' },
        OR: [
          {
            // New appointment starts during existing appointment
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } }
            ]
          },
          {
            // New appointment ends during existing appointment
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } }
            ]
          },
          {
            // New appointment encompasses existing appointment
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } }
            ]
          }
        ]
      }
    });

    if (conflictingAppointments.length > 0) {
      return res.status(409).json({ 
        error: 'Appointment time conflict detected',
        conflictingAppointments: conflictingAppointments.map(apt => ({
          id: apt.id,
          startTime: apt.startTime,
          endTime: apt.endTime,
          providerId: apt.providerId,
        }))
      });
    }

    // Calculate predicted no-show risk based on patient history
    const patientAppointmentHistory = await prisma.appointment.findMany({
      where: {
        patientId,
        tenantId: req.user!.tenantId,
        status: { in: ['completed', 'no_show', 'cancelled'] }
      },
      select: { status: true }
    });

    let predictedNoShowRisk = patient.noShowRiskScore.toNumber();
    if (patientAppointmentHistory.length > 0) {
      const noShows = patientAppointmentHistory.filter(apt => apt.status === 'no_show').length;
      const cancellations = patientAppointmentHistory.filter(apt => apt.status === 'cancelled').length;
      const total = patientAppointmentHistory.length;
      
      predictedNoShowRisk = (noShows + (cancellations * 0.5)) / total;
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        tenantId: req.user!.tenantId,
        patientId,
        providerId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        predictedNoShowRisk,
        patientCommunicationLog: [],
        confirmationAttempts: [],
        ...appointmentData,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneWireless: true,
          }
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          }
        }
      }
    });

    // Update patient's last interaction time
    await prisma.patient.update({
      where: { id: patientId },
      data: { lastAgentInteraction: new Date() }
    });

    logger.info(`Appointment created: ${appointment.id} for ${patient.firstName} ${patient.lastName}`);

    res.status(201).json({
      message: 'Appointment created successfully',
      appointment,
    });

  } catch (error) {
    logger.error('Appointment creation error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment
router.put('/:id', authorizeRoles('admin', 'doctor', 'front_desk'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { error, value } = updateAppointmentSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Verify appointment exists and belongs to tenant
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id,
        tenantId: req.user!.tenantId,
      }
    });

    if (!existingAppointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // If updating patient or provider, validate they exist
    if (value.patientId) {
      const patient = await prisma.patient.findFirst({
        where: {
          id: value.patientId,
          tenantId: req.user!.tenantId,
        }
      });

      if (!patient) {
        return res.status(400).json({ error: 'Invalid patient ID' });
      }
    }

    if (value.providerId) {
      const provider = await prisma.provider.findFirst({
        where: {
          id: value.providerId,
          tenantId: req.user!.tenantId,
          isActive: true,
        }
      });

      if (!provider) {
        return res.status(400).json({ error: 'Invalid provider ID' });
      }
    }

    // Check for conflicts if updating time
    if (value.startTime || value.endTime) {
      const newStartTime = value.startTime ? new Date(value.startTime) : existingAppointment.startTime;
      const newEndTime = value.endTime ? new Date(value.endTime) : existingAppointment.endTime;
      const checkProviderId = value.providerId || existingAppointment.providerId;

      const conflictingAppointments = await prisma.appointment.findMany({
        where: {
          tenantId: req.user!.tenantId,
          providerId: checkProviderId,
          status: { not: 'cancelled' },
          id: { not: id }, // Exclude current appointment
          OR: [
            {
              AND: [
                { startTime: { lte: newStartTime } },
                { endTime: { gt: newStartTime } }
              ]
            },
            {
              AND: [
                { startTime: { lt: newEndTime } },
                { endTime: { gte: newEndTime } }
              ]
            },
            {
              AND: [
                { startTime: { gte: newStartTime } },
                { endTime: { lte: newEndTime } }
              ]
            }
          ]
        }
      });

      if (conflictingAppointments.length > 0) {
        return res.status(409).json({ 
          error: 'Appointment time conflict detected',
          conflictingAppointments: conflictingAppointments.map(apt => ({
            id: apt.id,
            startTime: apt.startTime,
            endTime: apt.endTime,
          }))
        });
      }
    }

    // Log status changes for AI learning
    const statusChanged = value.status && value.status !== existingAppointment.status;
    
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...value,
        startTime: value.startTime ? new Date(value.startTime) : undefined,
        endTime: value.endTime ? new Date(value.endTime) : undefined,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneWireless: true,
          }
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          }
        }
      }
    });

    // If status changed to no_show or cancelled, update patient risk score
    if (statusChanged && (value.status === 'no_show' || value.status === 'cancelled')) {
      await updatePatientRiskScore(existingAppointment.patientId, value.status);
    }

    logger.info(`Appointment updated: ${id} - ${statusChanged ? `Status: ${value.status}` : 'Details updated'}`);

    res.json({
      message: 'Appointment updated successfully',
      appointment: updatedAppointment,
    });

  } catch (error) {
    logger.error('Appointment update error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Confirm appointment (used by AI agents and staff)
router.patch('/:id/confirm', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { confirmationMethod, agentType } = req.body;

    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        tenantId: req.user!.tenantId,
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phoneWireless: true,
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Log confirmation attempt
    const confirmationLog = [
      ...(appointment.confirmationAttempts as any[]),
      {
        timestamp: new Date().toISOString(),
        method: confirmationMethod || 'manual',
        agentType: agentType || 'human',
        success: true,
        userId: req.user!.id,
      }
    ];

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        confirmed: true,
        status: 'confirmed',
        confirmationAttempts: confirmationLog,
      }
    });

    logger.info(`Appointment confirmed: ${id} via ${confirmationMethod || 'manual'}`);

    res.json({
      message: 'Appointment confirmed successfully',
      appointment: updatedAppointment,
    });

  } catch (error) {
    logger.error('Appointment confirmation error:', error);
    res.status(500).json({ error: 'Failed to confirm appointment' });
  }
});

// Get available time slots for scheduling (AI Scheduler Agent helper)
router.get('/availability/:providerId', async (req: AuthRequest, res) => {
  try {
    const { providerId } = req.params;
    const { date, duration = 60 } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date parameter required' });
    }

    const selectedDate = new Date(date as string);
    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Validate provider
    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        tenantId: req.user!.tenantId,
        isActive: true,
      }
    });

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Get existing appointments for the day
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(8, 0, 0, 0); // Default start time

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(17, 0, 0, 0); // Default end time

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        tenantId: req.user!.tenantId,
        providerId,
        startTime: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: { not: 'cancelled' }
      },
      orderBy: { startTime: 'asc' }
    });

    // Calculate available slots (simplified algorithm)
    const appointmentDuration = parseInt(duration as string);
    const availableSlots: Array<{ startTime: Date; endTime: Date; duration: number }> = [];
    let currentTime = new Date(startOfDay);

    while (currentTime < endOfDay) {
      const slotEnd = new Date(currentTime.getTime() + appointmentDuration * 60000);
      
      // Check if slot conflicts with existing appointments
      const hasConflict = existingAppointments.some(apt => 
        (currentTime >= apt.startTime && currentTime < apt.endTime) ||
        (slotEnd > apt.startTime && slotEnd <= apt.endTime) ||
        (currentTime <= apt.startTime && slotEnd >= apt.endTime)
      );

      if (!hasConflict && slotEnd <= endOfDay) {
        availableSlots.push({
          startTime: new Date(currentTime),
          endTime: new Date(slotEnd),
          duration: appointmentDuration,
        });
      }

      currentTime = new Date(currentTime.getTime() + 15 * 60000); // 15-minute increments
    }

    res.json({
      provider: {
        id: provider.id,
        name: `${provider.firstName} ${provider.lastName}`,
      },
      date: selectedDate.toISOString().split('T')[0],
      availableSlots,
      existingAppointments: existingAppointments.length,
    });

  } catch (error) {
    logger.error('Availability check error:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Cancel appointment
router.patch('/:id/cancel', authorizeRoles('admin', 'doctor', 'front_desk'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason, notifyPatient = true } = req.body;

    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        tenantId: req.user!.tenantId,
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phoneWireless: true,
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (['cancelled', 'completed'].includes(appointment.status)) {
      return res.status(400).json({ error: `Cannot cancel ${appointment.status} appointment` });
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: appointment.notes ? 
          `${appointment.notes}\n\nCancelled: ${reason || 'No reason provided'}` :
          `Cancelled: ${reason || 'No reason provided'}`,
      }
    });

    // Update patient cancellation pattern for AI learning
    await updatePatientRiskScore(appointment.patientId, 'cancelled');

    logger.info(`Appointment cancelled: ${id} - Reason: ${reason || 'Not specified'}`);

    res.json({
      message: 'Appointment cancelled successfully',
      appointment: updatedAppointment,
      notificationSent: notifyPatient, // Will be implemented with SMS service
    });

  } catch (error) {
    logger.error('Appointment cancellation error:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

// GET /api/appointments/availability - Check availability
router.get('/availability', async (req: any, res) => {
  try {
    const { date, time, providerId } = req.query;
    const tenantId = req.user.tenantId;

    if (!date || !time) {
      return res.status(400).json({ 
        error: 'Date and time are required' 
      });
    }

    // Parse the requested date and time
    const requestedDateTime = new Date(`${date}T${time}:00`);
    
    // Check if the slot is available
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: providerId || undefined,
        startTime: {
          gte: requestedDateTime,
          lt: new Date(requestedDateTime.getTime() + 60 * 60 * 1000) // 1 hour slot
        },
        status: { not: 'cancelled' }
      }
    });

    const isAvailable = !existingAppointment;

    // Get alternative times if not available
    let alternatives: Array<{ date: string; time: string; dateTime: Date }> = [];
    if (!isAvailable) {
      alternatives = await getAlternativeSlots(tenantId, requestedDateTime, providerId);
    }

    res.json({
      available: isAvailable,
      requestedTime: requestedDateTime,
      alternatives
    });

  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// POST /api/appointments/book - Book appointment via AI
router.post('/book', async (req: any, res) => {
  try {
    const { 
      patientId, 
      appointmentDate, 
      appointmentTime, 
      procedureType,
      providerId 
    } = req.body;
    const tenantId = req.user.tenantId;

    // Validate patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId }
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Create appointment
    const startTime = new Date(`${appointmentDate}T${appointmentTime}:00`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default

    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        providerId: providerId || await getDefaultProvider(tenantId),
        startTime,
        endTime,
        status: 'scheduled',
        appointmentType: procedureType || 'General Consultation',
        notes: `Booked via AI Agent on ${new Date().toISOString()}`,
        confirmed: false
      },
      include: {
        patient: true,
        provider: true
      }
    });

    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        date: appointmentDate,
        time: appointmentTime,
        patient: `${patient.firstName} ${patient.lastName}`,
        provider: appointment.provider ? `Dr. ${appointment.provider.lastName}` : 'Provider TBD',
        type: procedureType
      }
    });

  } catch (error) {
    console.error('Error booking appointment:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// GET /api/patients/by-phone - Get patient by phone number
router.get('/patients/by-phone', async (req: any, res) => {
  try {
    const { phoneNumber } = req.query;
    const tenantId = req.user.tenantId;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    const patient = await prisma.patient.findFirst({
      where: {
        tenantId,
        OR: [
          { phoneHome: { contains: cleanPhone } },
          { phoneWireless: { contains: cleanPhone } }
        ]
      },
      include: {
        appointments: {
          where: { startTime: { gte: new Date() } },
          orderBy: { startTime: 'asc' },
          take: 3
        }
      }
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phoneWireless || patient.phoneHome,
        upcomingAppointments: patient.appointments || []
      }
    });

  } catch (error) {
    console.error('Error finding patient:', error);
    res.status(500).json({ error: 'Failed to find patient' });
  }
});

// Delete appointment
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const appointmentId = req.params.id;
    const tenantId = req.user!.tenantId;

    console.log('🗑️ Deleting appointment:', appointmentId);

    // Check if appointment exists and belongs to tenant
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId: tenantId
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Delete the appointment
    await prisma.appointment.delete({
      where: {
        id: appointmentId
      }
    });

    console.log('✅ Appointment deleted successfully');
    res.json({ message: 'Appointment deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting appointment:', error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

async function getAlternativeSlots(tenantId: string, requestedTime: Date, providerId?: string) {
  // Simple algorithm to find next 3 available slots
  const alternatives: Array<{ date: string; time: string; dateTime: Date }> = [];
  let currentTime = new Date(requestedTime);
  
  for (let i = 0; i < 7 && alternatives.length < 3; i++) {
    currentTime.setDate(currentTime.getDate() + 1);
    
    // Check 9 AM slot
    const morningSlot = new Date(currentTime);
    morningSlot.setHours(9, 0, 0, 0);
    
    const morningAvailable = await prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: providerId || undefined,
        startTime: {
          gte: morningSlot,
          lt: new Date(morningSlot.getTime() + 60 * 60 * 1000)
        },
        status: { not: 'cancelled' }
      }
    });

    if (!morningAvailable) {
      alternatives.push({
        date: morningSlot.toISOString().split('T')[0],
        time: '09:00',
        dateTime: morningSlot
      });
    }
  }

  return alternatives;
}

async function getDefaultProvider(tenantId: string): Promise<string> {
  const provider = await prisma.provider.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  
  return provider?.id || '';
}

// Helper function to update patient risk scores based on appointment patterns
async function updatePatientRiskScore(patientId: string, outcome: string) {
  try {
    // Get patient's recent appointment history
    const recentAppointments = await prisma.appointment.findMany({
      where: {
        patientId,
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
        }
      },
      select: { status: true }
    });

    if (recentAppointments.length === 0) return;

    const noShows = recentAppointments.filter(apt => apt.status === 'no_show').length;
    const cancellations = recentAppointments.filter(apt => apt.status === 'cancelled').length;
    const completed = recentAppointments.filter(apt => apt.status === 'completed').length;
    const total = recentAppointments.length;

    // Calculate new risk score (weighted: no_show = 1.0, cancellation = 0.5, completed = -0.1)
    const riskScore = Math.max(0, Math.min(1, 
      (noShows + (cancellations * 0.5) - (completed * 0.1)) / total
    ));

    await prisma.patient.update({
      where: { id: patientId },
      data: { noShowRiskScore: riskScore }
    });

  } catch (error) {
    logger.error('Risk score update error:', error);
  }
}

export { router as appointmentRouter };