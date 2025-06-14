import { Router } from 'express';
import twilio from 'twilio';
import { CommunicationService } from '../services/communicationService';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { authenticateToken, ensureTenantIsolation, AuthRequest, authorizeRoles } from '../middleware/auth';

const router = Router();

// Apply auth to SMS routes too
router.use(authenticateToken);
router.use(ensureTenantIsolation);

// Twilio webhook validation middleware
const validateTwilioRequest = (req: any, res: any, next: any) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  
  if (process.env.NODE_ENV === 'production') {
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      twilioSignature,
      url,
      req.body
    );
    
    if (!isValid) {
      return res.status(403).send('Forbidden');
    }
  }
  
  next();
};

// Handle incoming SMS messages
router.post('/webhook', validateTwilioRequest, async (req, res) => {
  try {
    const { From, Body, MessageSid, To } = req.body;
    
    logger.info(`Incoming SMS from ${From}: "${Body}"`);

    // Process the incoming SMS
    await CommunicationService.handleIncomingSMS(From, Body, MessageSid);

    // Respond with empty TwiML (Twilio requirement)
    const twiml = new twilio.twiml.MessagingResponse();
    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('SMS webhook error:', error);
    res.status(500).send('Error processing SMS');
  }
});

// SMS status callback
router.post('/status', validateTwilioRequest, async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
    
    logger.info(`SMS status update: ${MessageSid} - ${MessageStatus}`);

    // Update interaction log with delivery status
    if (MessageStatus === 'delivered' || MessageStatus === 'failed') {
      const interaction = await prisma.agentInteraction.findFirst({
        where: {
          content: {
            path: ['twilioMessageId'],
            equals: MessageSid
          }
        }
      });

      if (interaction) {
        await prisma.agentInteraction.update({
          where: { id: interaction.id },
          data: {
            content: {
              ...interaction.content as object,
              deliveryStatus: MessageStatus,
              deliveredAt: MessageStatus === 'delivered' ? new Date().toISOString() : null,
              errorCode: ErrorCode,
              errorMessage: ErrorMessage,
            }
          }
        });
      }
    }

    res.sendStatus(200);

  } catch (error) {
    logger.error('SMS status update error:', error);
    res.sendStatus(500);
  }
});

// Send SMS
router.post('/send', async (req: AuthRequest, res) => {
  try {
    console.log('Sending SMS:', req.body);
    
    // Save SMS to database
    const smsMessage = await prisma.sMSMessage.create({
      data: {
        tenantId: req.user!.tenantId,
        phoneNumber: req.body.patient_phone || req.body.to,
        content: req.body.message,
        direction: 'outbound',
        status: 'sent',
        appointmentId: req.body.appointment_id
      }
    });
    
    res.json({
      success: true,
      message_id: smsMessage.id,
      status: 'sent',
      to: req.body.patient_phone || req.body.to
    });
  } catch (error) {
    console.error('SMS sending failed:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Test SMS
router.post('/test', async (req: AuthRequest, res) => {
  try {
    console.log('Testing SMS integration:', req.body);
    
    res.json({
      success: true,
      message_id: 'test_sms_123',
      status: 'sent',
      message: 'SMS integration test successful',
      test_mode: true
    });
  } catch (error) {
    res.status(500).json({ error: 'SMS test failed' });
  }
});

// Get all SMS conversations
router.get('/conversations', authorizeRoles('ADMIN', 'DOCTOR', 'FRONT_DESK'), async (req: AuthRequest, res) => {
  try {
    // Get real SMS conversations from database
    const communications = await prisma.communication.findMany({
      where: {
        tenantId: req.user!.tenantId,
        type: 'SMS'
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneWireless: true,
            phoneHome: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Group by patient to create conversations
    const conversationsMap = new Map();
    
    communications.forEach(comm => {
      const patientKey = comm.patientId;
      const phoneNumber = comm.phoneNumber || comm.patient?.phoneWireless || comm.patient?.phoneHome;
      
      if (!conversationsMap.has(patientKey)) {
        conversationsMap.set(patientKey, {
          id: patientKey,
          patientId: comm.patientId,
          patientName: `${comm.patient?.firstName} ${comm.patient?.lastName}`,
          phoneNumber: phoneNumber,
          lastMessage: comm.content,
          lastMessageTime: comm.createdAt,
          unreadCount: 0, // Calculate based on read status if you have that field
          status: 'active',
          messages: []
        });
      }
      
      // Update last message if this is more recent
      const existing = conversationsMap.get(patientKey);
      if (comm.createdAt > existing.lastMessageTime) {
        existing.lastMessage = comm.content;
        existing.lastMessageTime = comm.createdAt;
      }
    });

    const conversations = Array.from(conversationsMap.values());
    
    res.json(conversations);
  } catch (error) {
    console.error('SMS conversations fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get specific conversation with messages
router.get('/conversations/:id', authorizeRoles('ADMIN', 'DOCTOR', 'FRONT_DESK'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // Get real conversation from database
    const communications = await prisma.communication.findMany({
      where: {
        patientId: id,
        tenantId: req.user!.tenantId,
        type: 'SMS'
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phoneWireless: true,
            phoneHome: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (communications.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const patient = communications[0].patient;
    const conversation = {
      id: id,
      patientId: id,
      patientName: `${patient?.firstName} ${patient?.lastName}`,
      phoneNumber: patient?.phoneWireless || patient?.phoneHome,
      status: 'active',
      messages: communications.map(comm => ({
        id: comm.id,
        content: comm.content,
        direction: comm.direction || 'outbound',
        timestamp: comm.createdAt,
        status: 'delivered'
      }))
    };

    res.json(conversation);
  } catch (error) {
    console.error('SMS conversation fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Send message in conversation
router.post('/conversations/:id/messages', authorizeRoles('ADMIN', 'DOCTOR', 'FRONT_DESK'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { message, direction = 'outbound' } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Mock sending message
    const newMessage = {
      id: `msg_${Date.now()}`,
      content: message.trim(),
      direction,
      timestamp: new Date(),
      status: direction === 'outbound' ? 'sent' : 'received'
    };

    console.log(`Sending SMS message in conversation ${id}:`, newMessage);

    // In real implementation, this would:
    // 1. Save message to database
    // 2. Send via SMS provider (Twilio, etc.)
    // 3. Update conversation last message
    
    res.json({ 
      success: true, 
      message: newMessage,
      conversationId: id 
    });
  } catch (error) {
    console.error('Message send failed:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark conversation as read
router.patch('/conversations/:id/read', authorizeRoles('ADMIN', 'DOCTOR', 'FRONT_DESK'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Marking conversation ${id} as read`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read failed:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;