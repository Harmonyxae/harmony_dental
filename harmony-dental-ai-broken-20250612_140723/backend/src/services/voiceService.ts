import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config, voiceConfig } from '../config/config';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { ElevenLabs, ElevenLabsClient } from 'elevenlabs';

export interface VoiceConfig {
  voiceId: string;
  stability: number;
  similarityBoost: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface VoiceCloneConfig {
  name: string;
  description: string;
  files: Buffer[];
  labels?: Record<string, string>;
}

export class VoiceService {
  private static readonly ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
  private client: any;

  constructor() {
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
  }

  // Generate speech from text using ElevenLabs
  static async textToSpeech(
    text: string,
    tenantId: string,
    voiceConfig?: Partial<VoiceConfig>
  ): Promise<{ audioBuffer: Buffer; audioUrl?: string }> {
    try {
      // Get tenant's voice configuration
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { aiConfig: true }
      });

      const defaultVoiceConfig = tenant?.aiConfig as any;
      const finalVoiceConfig: VoiceConfig = {
        voiceId: defaultVoiceConfig?.voice?.voiceId || 'EXAVITQu4vr4xnSDxMaL', // Default Bella voice
        stability: defaultVoiceConfig?.voice?.stability || 0.5,
        similarityBoost: defaultVoiceConfig?.voice?.similarityBoost || 0.8,
        style: defaultVoiceConfig?.voice?.style || 0.0,
        useSpeakerBoost: defaultVoiceConfig?.voice?.useSpeakerBoost || true,
        ...voiceConfig
      };

      const response = await axios.post(
        `${this.ELEVENLABS_API_URL}/text-to-speech/${finalVoiceConfig.voiceId}`,
        {
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: finalVoiceConfig.stability,
            similarity_boost: finalVoiceConfig.similarityBoost,
            style: finalVoiceConfig.style,
            use_speaker_boost: finalVoiceConfig.useSpeakerBoost
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY
          },
          responseType: 'arraybuffer'
        }
      );

      const audioBuffer = Buffer.from(response.data);

      // Optionally save to file and return URL for Twilio
      const audioUrl = await this.saveAudioFile(audioBuffer, tenantId);

      logger.info(`TTS generated: ${text.length} chars for tenant ${tenantId}`);

      return {
        audioBuffer,
        audioUrl
      };

    } catch (error) {
      logger.error('TTS generation failed:', error);
      throw new Error('Failed to generate speech');
    }
  }

  // Clone a voice for a practice (custom voice training)
  static async cloneVoice(
    tenantId: string,
    voiceCloneConfig: VoiceCloneConfig
  ): Promise<{ voiceId: string; status: string }> {
    try {
      const formData = new FormData();
      formData.append('name', voiceCloneConfig.name);
      formData.append('description', voiceCloneConfig.description);
      
      // Add audio files
      voiceCloneConfig.files.forEach((file, index) => {
        formData.append('files', new Blob([file]), `sample_${index}.mp3`);
      });

      if (voiceCloneConfig.labels) {
        formData.append('labels', JSON.stringify(voiceCloneConfig.labels));
      }

      const response = await axios.post(
        `${this.ELEVENLABS_API_URL}/voices/add`,
        formData,
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const voiceId = response.data.voice_id;

      // Save voice configuration to tenant
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          aiConfig: {
            ...(await this.getTenantAIConfig(tenantId)),
            voice: {
              voiceId,
              isCustom: true,
              name: voiceCloneConfig.name,
              createdAt: new Date().toISOString()
            }
          }
        }
      });

      logger.info(`Voice cloned successfully: ${voiceId} for tenant ${tenantId}`);

      return {
        voiceId,
        status: 'success'
      };

    } catch (error) {
      logger.error('Voice cloning failed:', error);
      throw new Error('Failed to clone voice');
    }
  }

  // Get available voices
  static async getAvailableVoices(): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.ELEVENLABS_API_URL}/voices`,
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY
          }
        }
      );

      return response.data.voices.map((voice: any) => ({
        voiceId: voice.voice_id,
        name: voice.name,
        category: voice.category,
        description: voice.description,
        previewUrl: voice.preview_url,
        labels: voice.labels,
        settings: voice.settings
      }));

    } catch (error) {
      logger.error('Failed to get available voices:', error);
      return [];
    }
  }

  // Convert speech to text using OpenAI Whisper
  static async speechToText(audioBuffer: Buffer): Promise<string> {
    try {
      // Save audio to temporary file
      const tempPath = path.join('/tmp', `audio_${Date.now()}.mp3`);
      fs.writeFileSync(tempPath, audioBuffer);

      // Use OpenAI Whisper for transcription
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempPath));
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${config.openai.apiKey}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      // Clean up temp file
      fs.unlinkSync(tempPath);

      const transcript = response.data.text;
      logger.info(`STT transcribed: "${transcript}"`);

      return transcript;

    } catch (error) {
      logger.error('STT transcription failed:', error);
      throw new Error('Failed to transcribe speech');
    }
  }

  // Save audio file for Twilio playback
  private static async saveAudioFile(
    audioBuffer: Buffer,
    tenantId: string
  ): Promise<string> {
    try {
      // Create directory if it doesn't exist
      const audioDir = path.join(process.cwd(), 'public', 'audio', tenantId);
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      // Save file with timestamp
      const filename = `tts_${Date.now()}.mp3`;
      const filepath = path.join(audioDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      // Return public URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      return `${baseUrl}/audio/${tenantId}/${filename}`;

    } catch (error) {
      logger.error('Failed to save audio file:', error);
      throw error;
    }
  }

  // Get tenant AI configuration
  private static async getTenantAIConfig(tenantId: string): Promise<any> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiConfig: true }
    });
    return tenant?.aiConfig || {};
  }

  // Update tenant voice settings
  static async updateVoiceSettings(
    tenantId: string,
    voiceConfig: Partial<VoiceConfig>
  ): Promise<void> {
    try {
      const currentConfig = await this.getTenantAIConfig(tenantId);
      
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          aiConfig: {
            ...currentConfig,
            voice: {
              ...currentConfig.voice,
              ...voiceConfig,
              updatedAt: new Date().toISOString()
            }
          }
        }
      });

      logger.info(`Voice settings updated for tenant ${tenantId}`);

    } catch (error) {
      logger.error('Failed to update voice settings:', error);
      throw error;
    }
  }

  // ADD: Conversational AI Agent Management
  async createConversationalAgent(config: {
    name: string;
    systemPrompt: string;
    voiceId: string;
    firstMessage?: string;
    tools?: any[];
    dynamicVariables?: Record<string, any>;
  }) {
    try {
      const agent = await this.client.conversationalAi.agents.create({
        conversationConfig: {
          agent: {
            prompt: {
              prompt: voiceConfig.systemPrompt,
              firstMessage: voiceConfig.firstMessage
            },
            tts: {
              voiceId: voiceConfig.voiceId,
              model: 'eleven_turbo_v2_5',
              outputFormat: 'pcm_16000' // For Twilio integration
            },
            llm: {
              model: 'gpt-4o-mini' // Cost-effective for dental use
            },
            tools: voiceConfig.tools || []
          }
        },
        platformSettings: {
          auth: {
            enableAuth: true // For security
          }
        }
      });

      return agent;
    } catch (error) {
      console.error('Error creating conversational agent:', error);
      throw error;
    }
  }

  // ADD: Server Tools for Dental Operations
  async createDentalServerTools() {
    return [
      {
        type: 'server',
        name: 'check_availability',
        description: 'Check appointment availability for a specific date and time',
        url: `${process.env.API_BASE_URL}/api/appointments/availability`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`
        },
        queryParameters: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format',
            required: true
          },
          time: {
            type: 'string', 
            description: 'Time in HH:MM format',
            required: true
          }
        }
      },
      {
        type: 'server',
        name: 'book_appointment',
        description: 'Book an appointment for a patient',
        url: `${process.env.API_BASE_URL}/api/appointments/book`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`,
          'Content-Type': 'application/json'
        },
        bodyParameters: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
            required: true
          },
          appointmentDate: {
            type: 'string',
            description: 'Appointment date in YYYY-MM-DD format',
            required: true
          },
          appointmentTime: {
            type: 'string',
            description: 'Appointment time in HH:MM format', 
            required: true
          },
          procedureType: {
            type: 'string',
            description: 'Type of dental procedure',
            required: true
          }
        }
      },
      {
        type: 'server',
        name: 'get_patient_info',
        description: 'Retrieve patient information by phone number',
        url: `${process.env.API_BASE_URL}/api/patients/by-phone`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer {{secret__api_token}}`
        },
        queryParameters: {
          phoneNumber: {
            type: 'string',
            description: 'Patient phone number',
            required: true
          }
        }
      }
    ];
  }

  // ADD: Get Signed URL for Client Connections
  async getSignedUrl(agentId: string): Promise<string> {
    try {
      const response = await this.client.conversationalAi.conversations.getSignedUrl({
        agentId: agentId
      });
      return response.signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      throw error;
    }
  }
}