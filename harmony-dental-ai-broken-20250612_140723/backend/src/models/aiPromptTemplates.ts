// AI Prompt Templates for different dental practice scenarios

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  agentType: 'receptionist' | 'scheduler' | 'follow_up' | 'emergency';
  category: string;
  defaultPrompt: string;
  variables: string[]; // Variables that can be injected like {practiceName}, {patientName}
  isSystem: boolean; // System prompts vs user-customizable
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'receptionist_greeting',
    name: 'Phone Greeting',
    description: 'How the AI greets callers when they first call',
    agentType: 'receptionist',
    category: 'greeting',
    defaultPrompt: `Hello! Thank you for calling {practiceName}. My name is {agentName}, and I'm here to help you today. How may I assist you?`,
    variables: ['practiceName', 'agentName'],
    isSystem: false
  },
  {
    id: 'receptionist_sms_greeting',
    name: 'SMS Greeting',
    description: 'Initial SMS response when patients text the practice',
    agentType: 'receptionist',
    category: 'greeting',
    defaultPrompt: `Hi! This is {agentName} from {practiceName}. I received your message and I'm here to help. What can I assist you with today?`,
    variables: ['practiceName', 'agentName'],
    isSystem: false
  },
  {
    id: 'appointment_scheduling',
    name: 'Appointment Scheduling',
    description: 'When patients want to schedule an appointment',
    agentType: 'scheduler',
    category: 'scheduling',
    defaultPrompt: `I'd be happy to help you schedule an appointment! Let me check our availability. What type of appointment do you need - is this for a cleaning, consultation, or do you have any specific concerns? Also, what days and times work best for you?`,
    variables: ['practiceName', 'availableSlots'],
    isSystem: false
  },
  {
    id: 'patient_identification',
    name: 'Patient Identification',
    description: 'Identifying and verifying patient information',
    agentType: 'receptionist',
    category: 'verification',
    defaultPrompt: `To better assist you, may I please have your full name and date of birth? This helps me locate your information in our system.`,
    variables: ['practiceName'],
    isSystem: true
  },
  {
    id: 'insurance_verification',
    name: 'Insurance Information',
    description: 'Collecting and verifying insurance details',
    agentType: 'receptionist',
    category: 'insurance',
    defaultPrompt: `I'll need to verify your insurance information. Could you please provide me with your insurance company name and your member ID number? This helps us determine your coverage and any copayment requirements.`,
    variables: ['practiceName'],
    isSystem: false
  },
  {
    id: 'emergency_assessment',
    name: 'Emergency Assessment',
    description: 'Assessing dental emergencies and urgency',
    agentType: 'emergency',
    category: 'emergency',
    defaultPrompt: `I understand you're having a dental emergency. Can you describe what's happening? Are you experiencing severe pain, swelling, or any trauma to your teeth or mouth? This will help me determine the urgency and get you the appropriate care.`,
    variables: ['practiceName', 'emergencyProtocol'],
    isSystem: true
  },
  {
    id: 'post_treatment_followup',
    name: 'Post-Treatment Follow-up',
    description: 'Following up with patients after treatment',
    agentType: 'follow_up',
    category: 'followup',
    defaultPrompt: `Hi {patientName}! This is {agentName} from {practiceName}. I'm calling to check on how you're feeling after your {treatmentType} treatment yesterday. Are you experiencing any pain or discomfort? Do you have any questions about your post-treatment care?`,
    variables: ['patientName', 'practiceName', 'agentName', 'treatmentType'],
    isSystem: false
  },
  {
    id: 'appointment_reminder',
    name: 'Appointment Reminder',
    description: 'Reminding patients of upcoming appointments',
    agentType: 'receptionist',
    category: 'reminder',
    defaultPrompt: `Hi {patientName}! This is a friendly reminder from {practiceName}. You have an appointment scheduled for {appointmentDate} at {appointmentTime}. Please reply to confirm, or call us if you need to reschedule.`,
    variables: ['patientName', 'practiceName', 'appointmentDate', 'appointmentTime'],
    isSystem: false
  },
  {
    id: 'payment_discussion',
    name: 'Payment and Billing',
    description: 'Discussing payment options and billing questions',
    agentType: 'receptionist',
    category: 'billing',
    defaultPrompt: `I can help you with payment options for your treatment. We accept cash, credit cards, and many insurance plans. We also offer payment plans for larger treatments. Would you like me to explain your coverage or discuss payment plan options?`,
    variables: ['practiceName', 'paymentOptions'],
    isSystem: false
  },
  {
    id: 'after_hours_emergency',
    name: 'After Hours Emergency',
    description: 'Handling emergency calls outside business hours',
    agentType: 'emergency',
    category: 'emergency',
    defaultPrompt: `You've reached {practiceName} after hours. If this is a dental emergency involving severe pain, swelling, or trauma, please call our emergency line at {emergencyNumber}. For non-urgent matters, please call back during business hours or leave a message and we'll return your call first thing in the morning.`,
    variables: ['practiceName', 'emergencyNumber', 'businessHours'],
    isSystem: true
  }
];

// Helper function to get templates by agent type
export function getTemplatesByAgentType(agentType: PromptTemplate['agentType']): PromptTemplate[] {
  return DEFAULT_PROMPT_TEMPLATES.filter(template => template.agentType === agentType);
}

// Helper function to get template by ID
export function getTemplateById(id: string): PromptTemplate | undefined {
  return DEFAULT_PROMPT_TEMPLATES.find(template => template.id === id);
}
