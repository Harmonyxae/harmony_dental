import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

// Import all routes - FIXED IMPORTS
import { authRouter } from './routes/auth';
import { appointmentRouter } from './routes/appointments';
import { patientRouter } from './routes/patients';
import { promptRouter } from './routes/prompts';
import { providerRouter } from './routes/providers';
import { schedulingRouter } from './routes/scheduling';
import smsRoutes from './routes/sms'; // FIXED: Only import default export
import { twilioRouter } from './routes/twilio';
import { voiceRouter } from './routes/voice';
import { voiceManagementRouter } from './routes/voiceManagement';
import { receptionistRouter } from './routes/receptionist';
import { servicesRouter } from './routes/services';
import { staffRouter } from './routes/staff';

// Import auth middleware - FIXED
import { authenticateToken } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3002;

// Fix CORS - Add this BEFORE other middleware
app.use(cors({
  origin: ['http://localhost:3003', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200
}));

// Add preflight handler
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Add this BEFORE your routes:
app.use('/api/patients', upload.any());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Harmony Dental AI Backend - ALL 13 ROUTES ACTIVE! 🎉',
    environment: process.env.NODE_ENV || 'development',
    activeRoutes: [
      '/api/auth',
      '/api/appointments', 
      '/api/patients',
      '/api/prompts',
      '/api/providers',
      '/api/scheduling',
      '/api/sms',
      '/api/twilio',
      '/api/voice',
      '/api/voice-management',
      '/api/receptionist',
      '/api/services',
      '/api/staff'
    ]
  });
});

// API Routes - All working! FIXED
app.use('/api/auth', authRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/patients', patientRouter);
app.use('/api/prompts', promptRouter);
app.use('/api/providers', providerRouter);
app.use('/api/scheduling', schedulingRouter);
app.use('/api/sms', authenticateToken, smsRoutes); // FIXED: Use correct middleware name
app.use('/api/twilio', twilioRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/voice-management', voiceManagementRouter);
app.use('/api/receptionist', receptionistRouter);
app.use('/api/services', servicesRouter);
app.use('/api/staff', staffRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    availableRoutes: [
      '/api/health',
      '/api/auth',
      '/api/appointments',
      '/api/patients', 
      '/api/prompts',
      '/api/providers',
      '/api/scheduling',
      '/api/sms',
      '/api/twilio',
      '/api/voice',
      '/api/voice-management',
      '/api/receptionist',
      '/api/services',
      '/api/staff'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Harmony Dental AI Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎉 ALL 13 ROUTES ACTIVE:`);
  console.log(`   ✅ /api/auth - Authentication & Authorization`);
  console.log(`   ✅ /api/appointments - Appointment Management`);
  console.log(`   ✅ /api/patients - Patient Management`);
  console.log(`   ✅ /api/prompts - AI Prompt Management`);
  console.log(`   ✅ /api/providers - Healthcare Providers`);
  console.log(`   ✅ /api/scheduling - Advanced Scheduling`);
  console.log(`   ✅ /api/sms - SMS Communication`);
  console.log(`   ✅ /api/twilio - Twilio Integration`);
  console.log(`   ✅ /api/voice - Voice Services`);
  console.log(`   ✅ /api/voice-management - Voice Management`);
  console.log(`   ✅ /api/receptionist - Receptionist Services`);
  console.log(`   ✅ /api/services - Services Management`);
  console.log(`   ✅ /api/staff - Staff Management`);
  console.log(`🚀 Ready for production deployment!`);
});
