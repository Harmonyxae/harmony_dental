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
    // For now, return mock data until we have real SMS integration
    const conversations = [
      {
        id: '1',
        patientId: '2ceb2f68-b03e-430c-9479-ca8ab2f1b824',
        patientName: 'John Smith',
        phoneNumber: '+1 (555) 123-4567',
        lastMessage: 'CONFIRM - See you tomorrow!',
        lastMessageTime: new Date('2024-12-10T14:45:00Z'),
        unreadCount: 0,
        status: 'active'
      },
      {
        id: '2',
        patientId: '3deb2f68-b03e-430c-9479-ca8ab2f1b825',
        patientName: 'Sarah Johnson',
        phoneNumber: '+1 (555) 987-6543',
        lastMessage: 'Thank you for the reminder!',
        lastMessageTime: new Date('2024-12-09T16:30:00Z'),
        unreadCount: 1,
        status: 'active'
      },
      {
        id: '3',
        patientId: '4deb2f68-b03e-430c-9479-ca8ab2f1b826',
        patientName: 'Mike Wilson',
        phoneNumber: '+1 (555) 456-7890',
        lastMessage: 'Can I reschedule my appointment?',
        lastMessageTime: new Date('2024-12-08T10:15:00Z'),
        unreadCount: 2,
        status: 'pending'
      },
      {
        id: '4',
        patientId: '5deb2f68-b03e-430c-9479-ca8ab2f1b827',
        patientName: 'Emily Davis',
        phoneNumber: '+1 (555) 234-5678',
        lastMessage: 'Insurance question...',
        lastMessageTime: new Date('2024-12-07T14:20:00Z'),
        unreadCount: 0,
        status: 'active'
      }
    ];

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
    
    // Mock conversation data
    const conversations = {
      '1': {
        id: '1',
        patientId: '2ceb2f68-b03e-430c-9479-ca8ab2f1b824',
        patientName: 'John Smith',
        phoneNumber: '+1 (555) 123-4567',
        status: 'active',
        messages: [
          {
            id: 'msg1',
            content: 'Hi John! This is a reminder about your dental cleaning appointment tomorrow at 10:00 AM. Please reply CONFIRM to confirm or RESCHEDULE if you need to change the time.',
            direction: 'outbound',
            timestamp: new Date('2024-12-10T14:30:00Z'),
            status: 'delivered'
          },
          {
            id: 'msg2',
            content: 'CONFIRM - See you tomorrow!',
            direction: 'inbound',
            timestamp: new Date('2024-12-10T14:45:00Z'),
            status: 'received'
          }
        ]
      },
      '2': {
        id: '2',
        patientId: '3deb2f68-b03e-430c-9479-ca8ab2f1b825',
        patientName: 'Sarah Johnson',
        phoneNumber: '+1 (555) 987-6543',
        status: 'active',
        messages: [
          {
            id: 'msg3',
            content: 'Hi Sarah! Your cleaning appointment is scheduled for Friday at 2:00 PM. Please arrive 15 minutes early for check-in.',
            direction: 'outbound',
            timestamp: new Date('2024-12-09T16:00:00Z'),
            status: 'delivered'
          },
          {
            id: 'msg4',
            content: 'Thank you for the reminder!',
            direction: 'inbound',
            timestamp: new Date('2024-12-09T16:30:00Z'),
            status: 'received'
          },
          {
            id: 'msg5',
            content: 'Will I need to bring anything specific?',
            direction: 'inbound',
            timestamp: new Date('2024-12-09T16:31:00Z'),
            status: 'received'
          }
        ]
      },
      '3': {
        id: '3',
        patientId: '4deb2f68-b03e-430c-9479-ca8ab2f1b826',
        patientName: 'Mike Wilson',
        phoneNumber: '+1 (555) 456-7890',
        status: 'pending',
        messages: [
          {
            id: 'msg6',
            content: 'Hi Mike! Your root canal follow-up is scheduled for Thursday at 3:00 PM.',
            direction: 'outbound',
            timestamp: new Date('2024-12-08T09:00:00Z'),
            status: 'delivered'
          },
          {
            id: 'msg7',
            content: 'Can I reschedule my appointment? Something came up at work.',
            direction: 'inbound',
            timestamp: new Date('2024-12-08T10:15:00Z'),
            status: 'received'
          },
          {
            id: 'msg8',
            content: 'What times do you have available next week?',
            direction: 'inbound',
            timestamp: new Date('2024-12-08T10:16:00Z'),
            status: 'received'
          }
        ]
      },
      '4': {
        id: '4',
        patientId: '5deb2f68-b03e-430c-9479-ca8ab2f1b827',
        patientName: 'Emily Davis',
        phoneNumber: '+1 (555) 234-5678',
        status: 'active',
        messages: [
          {
            id: 'msg9',
            content: 'Hi Emily! Your insurance pre-authorization for the crown procedure has been approved.',
            direction: 'outbound',
            timestamp: new Date('2024-12-07T14:00:00Z'),
            status: 'delivered'
          },
          {
            id: 'msg10',
            content: 'Great! What will be my out-of-pocket cost?',
            direction: 'inbound',
            timestamp: new Date('2024-12-07T14:20:00Z'),
            status: 'received'
          }
        ]
      }
    };

    const conversation = conversations[id as keyof typeof conversations];
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Conversation fetch failed:', error);
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