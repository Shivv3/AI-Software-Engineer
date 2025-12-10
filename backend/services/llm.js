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

class LLMService {
    constructor() {
        // Defer hard failure until generate() so the server can start and surface a friendly error.
        this.apiKey = process.env.GEMINI_API_KEY;
    }

    async generate(prompt) {
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }

        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        const data = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };
        const config = {
            headers: { 'Content-Type': 'application/json' },
            params: { key: this.apiKey.trim() },
            timeout: 60000
        };

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await rateLimiter.tryAcquire();
                console.log(`Gemini request attempt ${attempt}/${maxAttempts}`);
                const response = await axios.post(url, data, config);

                if (response.data?.candidates?.[0]?.content?.parts?.[0]) {
                    let text = response.data.candidates[0].content.parts[0].text;
                    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                    return text;
                }
                throw new Error('Invalid response format from Gemini API');
            } catch (error) {
                const status = error.response?.status;
                const transient = error.code === 'ECONNABORTED' || status === 429 || status === 503 || status === 500;
                const network = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED';
                console.error('LLM attempt failed', { attempt, status, code: error.code, message: error.message });

                if (status === 401 || status === 403) {
                    throw new Error('Invalid API key - please check your configuration');
                }
                if (!transient && !network && attempt === maxAttempts) {
                    throw new Error(error.response?.data?.error?.message || 'LLM service error, please try again');
                }
                if (attempt === maxAttempts) {
                    throw new Error('LLM temporarily unavailable, please try again in a few moments');
                }
                await sleep(800 * attempt);
            }
        }
        throw new Error('LLM temporarily unavailable, please try again in a few moments');
    }

    resetRateLimit() {
        rateLimiter.requests = [];
    }
}

module.exports = new LLMService();