const path = require('path');
const envPath = path.resolve(__dirname, '../../.env');
console.log('Loading LLM .env from:', envPath);
require('dotenv').config({ path: envPath });
const axios = require('axios');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class RateLimiter {
    constructor(maxRequests, timeWindowMs) {
        this.maxRequests = maxRequests;
        this.timeWindowMs = timeWindowMs;
        this.requests = [];
    }

    async tryAcquire() {
        const now = Date.now();
        this.requests = this.requests.filter(
            timestamp => now - timestamp < this.timeWindowMs
        );

        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const timeToWaitMs = this.timeWindowMs - (now - oldestRequest);
            throw new Error(`Rate limit exceeded. Please try again in ${Math.ceil(timeToWaitMs / 1000)} seconds.`);
        }

        this.requests.push(now);
        return true;
    }
}

const rateLimiter = new RateLimiter(30, 60 * 1000);

// Providers tried in order. First success wins.
const PROVIDERS = [
    {
        name: 'gemini',
        available: () => !!process.env.GEMINI_API_KEY,
        call: async (prompt) => {
            const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
            const response = await axios.post(
                url,
                { contents: [{ parts: [{ text: prompt }] }] },
                {
                    headers: { 'Content-Type': 'application/json' },
                    params: { key: process.env.GEMINI_API_KEY.trim() },
                    timeout: 60000
                }
            );
            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Invalid response format from Gemini API');
            return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        },
        // Treat 429 and 503 as transient — will fall through to next provider after retries
        isTransient: (err) => {
            const s = err.response?.status;
            return err.code === 'ECONNABORTED' || s === 429 || s === 503 || s === 500;
        },
        isFatal: (err) => {
            const s = err.response?.status;
            return s === 401 || s === 403;
        }
    },
    {
        name: 'groq',
        available: () => !!process.env.GROQ_API_KEY,
        call: async (prompt) => {
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: process.env.GROQ_MODEL || 'llama3-70b-8192',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY.trim()}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );
            const text = response.data?.choices?.[0]?.message?.content;
            if (!text) throw new Error('Invalid response format from Groq API');
            return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        },
        isTransient: (err) => {
            const s = err.response?.status;
            return err.code === 'ECONNABORTED' || s === 429 || s === 503 || s === 500;
        },
        isFatal: (err) => {
            const s = err.response?.status;
            return s === 401 || s === 403;
        }
    }
];

class LLMService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY; // kept for backwards compat checks
    }

    async generate(prompt) {
        const available = PROVIDERS.filter(p => p.available());

        if (available.length === 0) {
            throw new Error('No LLM API keys configured. Set GEMINI_API_KEY or GROQ_API_KEY in .env');
        }

        let lastError;

        for (const provider of available) {
            const maxAttempts = 2;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await rateLimiter.tryAcquire();
                    console.log(`LLM request via ${provider.name} attempt ${attempt}/${maxAttempts}`);
                    const text = await provider.call(prompt);
                    if (attempt > 1 || provider !== available[0]) {
                        console.log(`LLM: succeeded via ${provider.name}`);
                    }
                    return text;
                } catch (error) {
                    lastError = error;
                    console.error(`LLM ${provider.name} attempt ${attempt} failed`, {
                        status: error.response?.status,
                        code: error.code,
                        message: error.message
                    });

                    if (provider.isFatal(error)) {
                        console.warn(`${provider.name}: invalid API key, skipping provider`);
                        break; // try next provider immediately
                    }
                    if (attempt < maxAttempts) {
                        await sleep(800 * attempt);
                    }
                    // after maxAttempts exhausted, fall through to next provider
                }
            }
        }

        throw new Error(lastError?.message || 'All LLM providers failed, please try again');
    }

    resetRateLimit() {
        rateLimiter.requests = [];
    }
}

module.exports = new LLMService();
