const { BaseAgent } = require('./BaseAgent');
const OpenAI = require('openai');
const fs = require('fs');

class VoiceChartingAgent extends BaseAgent {
  constructor() {
    super('voice_charting');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async processVoiceInput(audioBuffer, patientContext) {
    try {
      // Step 1: Convert speech to text using Whisper
      const transcript = await this.speechToText(audioBuffer);
      
      // Step 2: Parse dental terminology and extract structured data
      const chartingData = await this.extractChartingData(transcript, patientContext);
      
      // Step 3: Validate and suggest CDT codes
      const validatedData = await this.validateAndEnhance(chartingData);
      
      // Step 4: Update patient chart
      const updatedChart = await this.updatePatientChart(validatedData, patientContext.patientId);
      
      return {
        transcript,
        chartingResults: validatedData,
        updatedChart,
        confidence: this.calculateConfidence(chartingData)
      };
    } catch (error) {
      console.error('Voice charting processing error:', error);
      throw error;
    }
  }

  async speechToText(audioBuffer) {
    try {
      // Save temporary audio file
      const tempAudioPath = `/tmp/audio_${Date.now()}.webm`;
      fs.writeFileSync(tempAudioPath, audioBuffer);

      // Use Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempAudioPath),
        model: "whisper-1",
        language: "en",
        prompt: "This is dental charting dictation including tooth numbers, surfaces, diagnoses, and procedures."
      });

      // Clean up temp file
      fs.unlinkSync(tempAudioPath);

      return transcription.text;
    } catch (error) {
      console.error('Speech to text error:', error);
      throw error;
    }
  }

  async extractChartingData(transcript, context) {
    // Get customizable prompt from service
    const prompt = await PromptService.getPrompt(
      context.tenantId,
      'voice_charting', // agentType
      'diagnosis_parsing', // category
      {
        tenantId: context.tenantId,
        patientId: context.patientId,
        patientName: context.patientName
      }
    );

    // Use the customized prompt
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: transcript }
      ]
    });

    const response = completion.choices[0].message.content;
    
    // Parse JSON response
    const jsonMatch = response.match(/\[.*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [];
  }

  async validateAndEnhance(chartingData) {
    // Validate CDT codes against database
    const validatedData = [];
    
    for (const entry of chartingData) {
      try {
        // Check if CDT code exists and is appropriate
        const procedure = await this.db.query(
          'SELECT * FROM procedures WHERE cdt_code = $1',
          [entry.cdtCode]
        );
        
        if (procedure.rows.length > 0) {
          entry.procedureDetails = procedure.rows[0];
          entry.validated = true;
        } else {
          // Suggest alternative CDT code
          entry.suggestedCode = await this.suggestCDTCode(entry);
          entry.validated = false;
        }
        
        validatedData.push(entry);
      } catch (error) {
        console.error('Validation error for entry:', entry, error);
      }
    }
    
    return validatedData;
  }

  async suggestCDTCode(entry) {
    // AI-powered CDT code suggestion based on diagnosis and procedure
    const prompt = `
Given this dental procedure information:
- Tooth: ${entry.toothNumber}
- Surfaces: ${entry.surfaces.join(', ')}
- Diagnosis: ${entry.diagnosis}
- Procedure: ${entry.procedure}

What is the most appropriate CDT code? Respond with just the code (e.g., D2392).
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 10
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('CDT suggestion error:', error);
      return null;
    }
  }

  async updatePatientChart(chartingData, patientId) {
    const updatedEntries = [];
    
    for (const entry of chartingData) {
      try {
        const result = await this.db.query(`
          INSERT INTO chart_entries (
            patient_id, tooth_number, surfaces, diagnosis, 
            procedure_description, cdt_code, status, confidence_score, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          patientId,
          entry.toothNumber,
          entry.surfaces,
          entry.diagnosis,
          entry.procedure,
          entry.cdtCode,
          'planned',
          entry.confidence,
          entry.notes
        ]);
        
        updatedEntries.push(result.rows[0]);
      } catch (error) {
        console.error('Chart update error:', error);
      }
    }
    
    return updatedEntries;
  }

  calculateConfidence(chartingData) {
    if (chartingData.length === 0) return 0;
    
    const avgConfidence = chartingData.reduce((sum, entry) => sum + entry.confidence, 0) / chartingData.length;
    return Math.round(avgConfidence * 100) / 100;
  }
}

module.exports = { VoiceChartingAgent };