// server.js - OpenAI to NVIDIA NIM API Proxy
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const SHOW_REASONING = true;

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'stepfun-ai/step-3.5-flash',
  'gpt-4': 'deepseek-ai/deepseek-v3.2',
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.2',
  'gpt-4o': 'deepseek-ai/deepseek-v3.2',
  'claude-3-opus': 'z.ai/glm-4.7',
  'claude-3-sonnet': 'z.ai/glm-4.7',
  'gemini-pro': 'deepseek-ai/deepseek-v3.2'
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'OpenAI to NVIDIA NIM Proxy', reasoning_display: SHOW_REASONING });
});

app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy'
  }));
  res.json({ object: 'list', data: models });
});

async function handleChat(req, res) {
  try {
    const { model, messages, temperature, max_tokens } = req.body;

    const enhancedMessages = [
      {
        role: 'system',
        content: 'Write long, detailed, immersive responses with multiple paragraphs, dialogue, and internal thoughts. Never give short or cut-off replies.'
      },
      ...messages
    ];

    let nimModel = MODEL_MAPPING[model];
    if (!nimModel) {
      const modelLower = model.toLowerCase();
      if (modelLower.includes('gpt-4') || modelLower.includes('claude-opus') || modelLower.includes('405b')) {
        nimModel = 'deepseek-ai/deepseek-v3.2';
      } else {
        nimModel = 'deepseek-ai/deepseek-v3.2';
      }
    }

    const nimRequest = {
      model: nimModel,
      messages: enhancedMessages,
      temperature: temperature || 0.85,
      top_p: 0.95,
      max_tokens: max_tokens || 4096,
      stream: false
    };

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: 'json'
    });

    const openaiResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: response.data.choices.map(choice => {
        let fullContent = choice.message?.content || '';
        if (SHOW_REASONING && choice.message?.reasoning_content) {
          fullContent = '<think>\n' + choice.message.reasoning_content + '\n</think>\n\n' + fullContent;
        }
        return {
          index: choice.index,
          message: {
            role: choice.message.role,
            content: fullContent
          },
          finish_reason: choice.finish_reason
        };
      }),
      usage: response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    res.json(openaiResponse);

  } catch (error) {
    console.error('Proxy error:', error.message);
    if (error.response) {
      console.error('NVIDIA error:', JSON.stringify(error.response.data));
    }
    res.status(error.response?.status || 500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'invalid_request_error',
        code: error.response?.status || 500
      }
    });
  }
}

app.post('/v1/chat/completions', handleChat);
app.post('/chat/completions', handleChat);

app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.path} not found`,
      type: 'invalid_request_error',
      code: 404
    }
  });
});

app.listen(PORT, () => {
  console.log(`OpenAI to NVIDIA NIM Proxy running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
