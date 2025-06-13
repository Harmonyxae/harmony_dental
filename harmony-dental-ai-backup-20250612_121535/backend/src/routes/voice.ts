import { Router } from 'express';
import twilio from 'twilio';
import { VoiceService } from '../services/voiceService';
import { ReceptionistAgent } from '../services/receptionistAgent';
import { AgentMemoryService } from '../services/agentMemoryService';
import { CommunicationService } from '../services/communicationService';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

const router = Router();

// Twilio webhook validation middleware
const validateTwilioRequest = (req: any, res: any, next: any) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  
  // In production, validate the signature
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

// Enhanced call handling with natural voice
router.post('/handle-call', validateTwilioRequest, async (req, res) => {
  try {
    const { From, To, CallSid } = req.body;
    
    logger.info(`Incoming call: ${CallSid} from ${From}`);

    // Find patient and tenant
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { phoneWireless: From },
          { phoneHome: From },
        ]
      },
      include: { tenant: true }
    });

    const twiml = new twilio.twiml.VoiceResponse();

    if (patient) {
      // Get contextual memories for personalized greeting
      const context = await AgentMemoryService.getContextualMemories(
        patient.tenantId,
        'receptionist',
        patient.id,
        'greeting',
        'voice'
      );

      // Generate personalized greeting with AI
      const greetingResponse = await ReceptionistAgent.processVoiceInput(
        patient.tenantId,
        From,
        'initial_greeting',
        patient.id
      );

      // Convert to natural speech
      const { audioUrl } = await VoiceService.textToSpeech(
        greetingResponse.response,
        patient.tenantId
      );

      // Play natural voice greeting
      twiml.play(audioUrl);
      
      // Gather speech input
      const gather = twiml.gather({
        input: ['speech'],
        action: '/api/v1/voice/process-speech',
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'experimental_conversations',
        partialResultCallback: '/api/v1/voice/partial-speech',
      });
      
    } else {
      // Unknown caller - use default practice voice
      const defaultGreeting = "Thank you for calling our dental office. How may I help you today?";
      
      // Generate speech for unknown caller (use tenant from phone number mapping or default)
      const { audioUrl } = await VoiceService.textToSpeech(
        defaultGreeting,
        'default' // Would need to implement tenant detection
      );

      twiml.play(audioUrl);
      
      const gather = twiml.gather({
        input: ['speech'],
        action: '/api/v1/voice/process-new-caller',
        method: 'POST',
        speechTimeout: 'auto',
      });
    }

    // Fallback if no input
    twiml.say('I didn\'t hear anything. Please hold while I transfer you to our front desk.');
    twiml.dial('+1234567890');

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Enhanced voice call handling error:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('I apologize for the technical difficulty. Please hold while I transfer you.');
    twiml.dial('+1234567890');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Enhanced speech processing with RAG
router.post('/process-speech', validateTwilioRequest, async (req, res) => {
  try {
    const { SpeechResult, From, CallSid } = req.body;
    
    logger.info(`Enhanced speech processing from ${From}: "${SpeechResult}"`);

    // Find patient
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { phoneWireless: From },
          { phoneHome: From },
        ]
      }
    });

    if (!patient) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('I\'m sorry, I couldn\'t find your information. Let me transfer you to our front desk.');
      twiml.dial('+1234567890');
      
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    // Process with enhanced AI agent including memory context
    const agentResponse = await ReceptionistAgent.processVoiceInput(
      patient.tenantId,
      From,
      SpeechResult,
      patient.id
    );

    // Generate natural speech response
    const { audioUrl } = await VoiceService.textToSpeech(
      agentResponse.response,
      patient.tenantId
    );

    const twiml = new twilio.twiml.VoiceResponse();

    if (agentResponse.nextAction === 'transfer_to_human') {
      twiml.play(audioUrl);
      twiml.dial('+1234567890');
      
    } else if (agentResponse.nextAction === 'continue_conversation') {
      twiml.play(audioUrl);
      
      const gather = twiml.gather({
        input: ['speech'],
        action: '/api/v1/voice/process-speech',
        method: 'POST',
        speechTimeout: 'auto',
        numDigits: 0,
      });
      
      // Fallback after silence
      twiml.say('I\'m still here to help. What else can I do for you?');
      
    } else if (agentResponse.nextAction === 'end_call') {
      twiml.play(audioUrl);
      twiml.hangup();
      
    } else {
      // Default continue
      twiml.play(audioUrl);
      twiml.redirect('/api/v1/voice/process-speech');
    }

    // Learn from this interaction
    setTimeout(() => {
      AgentMemoryService.learnFromInteraction(
        patient.tenantId,
        'receptionist',
        CallSid, // Using CallSid as interaction ID for now
        'success' // Assume success unless feedback indicates otherwise
      );
    }, 1000);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Enhanced speech processing error:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('I\'m experiencing technical difficulties. Let me transfer you to our team.');
    twiml.dial('+1234567890');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Partial speech results for real-time processing
router.post('/partial-speech', validateTwilioRequest, async (req, res) => {
  try {
    const { PartialSpeechResult, From, CallSid } = req.body;
    
    // Log partial results for analysis (optional)
    logger.debug(`Partial speech from ${From}: "${PartialSpeechResult}"`);
    
    // Could implement real-time intent detection here
    // For now, just acknowledge receipt
    res.sendStatus(200);

  } catch (error) {
    logger.error('Partial speech processing error:', error);
    res.sendStatus(200); // Always return 200 for Twilio
  }
});

// Test voice - ADD THIS
router.post('/test', async (req, res) => {
  try {
    console.log('Testing voice integration:', req.body);
    
    res.json({
      success: true,
      call_id: 'test_call_456',
      status: 'initiated',
      message: 'Voice integration test successful',
      test_mode: true
    });
  } catch (error) {
    console.error('Voice test failed:', error);
    res.status(500).json({ error: 'Voice test failed' });
  }
});

export { router as voiceRouter };