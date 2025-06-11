import { Router } from 'express';
import { SchedulerAgent } from '../services/schedulerAgent';
import { authenticateToken, ensureTenantIsolation } from '../middleware/auth';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticateToken);
router.use(ensureTenantIsolation);

// POST /api/scheduling/optimize - Find optimal appointment time
router.post('/optimize', async (req: any, res) => {
  try {
    const { 
      patientId, 
      appointmentType, 
      preferredDates, 
      preferredTimes, 
      providerId, 
      urgency 
    } = req.body;
    const tenantId = req.user.tenantId;

    const schedulerAgent = new SchedulerAgent();
    
    const optimization = await schedulerAgent.optimizeSchedule({
      tenantId,
      patientId,
      appointmentType,
      urgency: urgency || 'routine',
      callerId: '', // Not needed for optimization
      preferredProvider: providerId
    });

    // Get actual available slots for the suggested times
    const availableSlots = await getAvailableSlotsForDates(
      tenantId,
      preferredDates,
      providerId,
      parseInt(req.body.duration) || 60
    );

    res.json({
      optimization,
      availableSlots,
      recommendation: {
        suggestedDate: optimization.suggestedTime.toISOString().split('T')[0],
        suggestedTime: optimization.suggestedTime.toTimeString().slice(0, 5),
        confidence: optimization.optimizationScore,
        reasoning: optimization.reasoning
      }
    });

  } catch (error) {
    logger.error('Scheduling optimization error:', error);
    res.status(500).json({ error: 'Failed to optimize schedule' });
  }
});

// POST /api/appointments/reschedule - Reschedule existing appointment
router.put('/reschedule', async (req: any, res) => {
  try {
    const { appointmentId, newDate, newTime, reason } = req.body;
    const tenantId = req.user.tenantId;

    // Validate appointment exists
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { patient: true, provider: true }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Check new time availability
    const newDateTime = new Date(`${newDate}T${newTime}:00`);
    const endTime = new Date(newDateTime.getTime() + 60 * 60 * 1000);

    const conflict = await prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: appointment.providerId,
        id: { not: appointmentId },
        status: { not: 'cancelled' },
        startTime: { lt: endTime },
        endTime: { gt: newDateTime }
      }
    });

    if (conflict) {
      return res.status(409).json({ 
        error: 'Time slot not available',
        conflictingAppointment: {
          startTime: conflict.startTime,
          endTime: conflict.endTime
        }
      });
    }

    // Update appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        startTime: newDateTime,
        endTime: endTime,
        notes: appointment.notes ? 
          `${appointment.notes}\n\nRescheduled: ${reason || 'No reason provided'}` :
          `Rescheduled: ${reason || 'No reason provided'}`
      },
      include: {
        patient: true,
        provider: true
      }
    });

    // Log rescheduling for AI learning
    await prisma.agentInteraction.create({
      data: {
        tenantId,
        patientId: appointment.patientId,
        agentType: 'scheduler',
        interactionType: 'reschedule',
        channel: 'voice',
        content: {
          originalTime: appointment.startTime,
          newTime: newDateTime,
          reason: reason || 'Not specified'
        },
        confidenceScore: 1.0,
        successOutcome: true
      }
    });

    res.json({
      success: true,
      appointment: updatedAppointment,
      message: 'Appointment rescheduled successfully'
    });

  } catch (error) {
    logger.error('Rescheduling error:', error);
    res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
});

// POST /api/appointments/waitlist - Add to waitlist
router.post('/waitlist', async (req: any, res) => {
  try {
    const { 
      patientId, 
      preferredDate, 
      preferredTime, 
      appointmentType, 
      priority 
    } = req.body;
    const tenantId = req.user.tenantId;

    // Validate patient
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId }
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Create waitlist entry
    const waitlistEntry = await prisma.appointmentWaitlist.create({
      data: {
        tenantId,
        patientId,
        preferredDate: new Date(preferredDate),
        preferredTime,
        appointmentType,
        priority: priority || 'medium',
        status: 'active',
        createdByAgent: 'scheduler'
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phoneWireless: true
          }
        }
      }
    });

    res.json({
      success: true,
      waitlistEntry,
      message: 'Added to waitlist successfully',
      estimatedCallBack: 'within 24 hours'
    });

  } catch (error) {
    logger.error('Waitlist error:', error);
    res.status(500).json({ error: 'Failed to add to waitlist' });
  }
});

// GET /api/patients/appointment-history - Get patient history
router.get('/appointment-history', async (req: any, res) => {
  try {
    const { patientId, phoneNumber } = req.query;
    const tenantId = req.user.tenantId;

    let patient;
    
    if (patientId) {
      patient = await prisma.patient.findFirst({
        where: { id: patientId, tenantId }
      });
    } else if (phoneNumber) {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      patient = await prisma.patient.findFirst({
        where: {
          tenantId,
          OR: [
            { phoneHome: { contains: cleanPhone } },
            { phoneHome: { contains: cleanPhone } },
            { phoneWireless: { contains: cleanPhone } }
          ]
        }
      });
    }

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Get appointment history
    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { startTime: 'desc' },
      take: 10,
      include: {
        provider: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Calculate patterns
    const totalAppointments = appointments.length;
    const noShows = appointments.filter(apt => apt.status === 'no_show').length;
    const cancellations = appointments.filter(apt => apt.status === 'cancelled').length;
    const completed = appointments.filter(apt => apt.status === 'completed').length;

    res.json({
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        preferredAppointmentTimes: patient.preferredAppointmentTimes,
        noShowRiskScore: patient.noShowRiskScore
      },
      appointmentHistory: appointments,
      patterns: {
        totalAppointments,
        completionRate: totalAppointments > 0 ? (completed / totalAppointments) : 0,
        noShowRate: totalAppointments > 0 ? (noShows / totalAppointments) : 0,
        cancellationRate: totalAppointments > 0 ? (cancellations / totalAppointments) : 0
      }
    });

  } catch (error) {
    logger.error('Patient history error:', error);
    res.status(500).json({ error: 'Failed to get patient history' });
  }
});

async function getAvailableSlotsForDates(
  tenantId: string, 
  dates: string[], 
  providerId?: string, 
  duration: number = 60
) {
  const slots: any[] = [];
  
  for (const date of dates) {
    const dayStart = new Date(`${date}T08:00:00`);
    const dayEnd = new Date(`${date}T17:00:00`);
    
    // Get existing appointments for the day
    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId,
        providerId: providerId || undefined,
        startTime: { gte: dayStart, lt: dayEnd },
        status: { not: 'cancelled' }
      },
      orderBy: { startTime: 'asc' }
    });

    // Find available slots (simplified)
    let currentTime = new Date(dayStart);
    const daySlots: any[] = [];

    while (currentTime < dayEnd) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);
      
      const hasConflict = appointments.some(apt =>
        (currentTime >= apt.startTime && currentTime < apt.endTime) ||
        (slotEnd > apt.startTime && slotEnd <= apt.endTime)
      );

      if (!hasConflict && slotEnd <= dayEnd) {
        daySlots.push({
          startTime: new Date(currentTime),
          endTime: new Date(slotEnd),
          available: true
        });
      }

      currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-minute increments
    }

    slots.push({
      date,
      slots: daySlots
    });
  }

  return slots;
}

export { router as schedulingRouter };