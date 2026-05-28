const path = require('path');
const envPath = path.resolve(__dirname, '../../.env');
console.log('Loading LLM .env from:', envPath);
require('dotenv').config({ path: envPath });
const axios = require('axios');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function readKeyPool(prefix, fallbackName) {
    const keys = [];
    const csv = process.env[`${prefix}S`];
    if (csv) {
        keys.push(...csv.split(',').map((key) => key.trim()).filter(Boolean));
    }

    for (let i = 1; i <= 10; i++) {
        const key = process.env[`${prefix}_${i}`];
        if (key && key.trim()) keys.push(key.trim());
    }

    const fallback = process.env[fallbackName || prefix];
    if (keys.length === 0 && fallback && fallback.trim()) keys.push(fallback.trim());

    return [...new Set(keys)];
}

class ApiKeyPool {
    constructor(keys, cooldownMs = 60 * 1000) {
        this.cooldownMs = cooldownMs;
        this.entries = keys.map((value, index) => ({ index: index + 1, value, cooldownUntil: 0 }));
        this.index = 0;
    }

    hasKeys() {
        return this.entries.length > 0;
    }

    getNextKey() {
        if (this.entries.length === 0) return null;
        const now = Date.now();

        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[this.index % this.entries.length];
            this.index += 1;
            if (!entry.cooldownUntil || entry.cooldownUntil <= now) return entry;
        }

        return null;
    }

    markCooldown(entry, ms = this.cooldownMs) {
        if (entry) entry.cooldownUntil = Date.now() + ms;
    }

    getStatus() {
        const now = Date.now();
        return this.entries.map((entry) => ({
            index: entry.index,
            cooldownUntil: entry.cooldownUntil > now ? new Date(entry.cooldownUntil).toISOString() : null,
        }));
    }
}

const geminiKeyPool = new ApiKeyPool(readKeyPool('GEMINI_API_KEY', 'GEMINI_API_KEY'));
const groqKeyPool = new ApiKeyPool(readKeyPool('GROQ_API_KEY', 'GROQ_API_KEY'));

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

const configuredKeyCount = Math.max(1, geminiKeyPool.entries.length + groqKeyPool.entries.length);
const rateLimiter = new RateLimiter(
    Number(process.env.LLM_RATE_LIMIT_PER_MINUTE || Math.max(30, configuredKeyCount * 12)),
    60 * 1000
);

// ─── Provider Definitions ──────────────────────────────────────────────────────

/**
 * Groq model rotation list — on rate-limit or transient failure within
 * the Groq provider, the next model in the list is tried.
 */
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'gemma2-9b-it',
    'mixtral-8x7b-32768',
];

/**
 * Each provider exposes:
 *   name          – human-readable label (appears in logs)
 *   available()   – true when the required env var is set
 *   call(prompt)  – returns the generated text (string)
 *   isTransient(err) – true for errors worth retrying (429, 503, 500, timeout)
 *   isFatal(err)  – true for auth errors (skip provider entirely)
 */
const PROVIDERS = [
    // ── Gemini ──────────────────────────────────────────────────────────────
    {
        name: 'gemini',
        available: () => geminiKeyPool.hasKeys(),
        call: async (prompt) => {
            const keyEntry = geminiKeyPool.getNextKey();
            if (!keyEntry) {
                const err = new Error('All Gemini API keys are cooling down');
                err.code = 'ALL_KEYS_COOLDOWN';
                throw err;
            }
            const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
            try {
                const response = await axios.post(
                    url,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        params: { key: keyEntry.value },
                        timeout: 60000
                    }
                );
                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('Invalid response format from Gemini API');
                return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            } catch (err) {
                if (err.response?.status === 429) {
                    geminiKeyPool.markCooldown(keyEntry);
                }
                throw err;
            }
        },
        isTransient: (err) => {
            const s = err.response?.status;
            return err.code === 'ECONNABORTED' || s === 429 || s === 503 || s === 500;
        },
        isFatal: (err) => {
            const s = err.response?.status;
            return s === 401 || s === 403 || s === 402;
        }
    },

    // ── DeepSeek ────────────────────────────────────────────────────────────
    {
        name: 'deepseek',
        available: () => !!process.env.DEEPSEEK_API_KEY,
        call: async (prompt) => {
            const response = await axios.post(
                'https://api.deepseek.com/chat/completions',
                {
                    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 8192,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY.trim()}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 90000 // DeepSeek can be slower for complex reasoning
                }
            );
            const text = response.data?.choices?.[0]?.message?.content;
            if (!text) throw new Error('Invalid response format from DeepSeek API');
            return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        },
        isTransient: (err) => {
            const s = err.response?.status;
            return err.code === 'ECONNABORTED' || s === 429 || s === 503 || s === 500 || s === 502;
        },
        isFatal: (err) => {
            const s = err.response?.status;
            return s === 401 || s === 403 || s === 402;
        }
    },

    // ── Groq (multi-model rotation) ─────────────────────────────────────────
    {
        name: 'groq',
        available: () => groqKeyPool.hasKeys(),
        call: async (prompt, _modelOverride) => {
            const keyEntry = groqKeyPool.getNextKey();
            if (!keyEntry) {
                const err = new Error('All Groq API keys are cooling down');
                err.code = 'ALL_KEYS_COOLDOWN';
                throw err;
            }
            // Groq supports model rotation — try each model in order
            const models = _modelOverride ? [_modelOverride] : GROQ_MODELS;
            let lastErr;

            for (const model of models) {
                try {
                    const response = await axios.post(
                        'https://api.groq.com/openai/v1/chat/completions',
                        {
                            model,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.7
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${keyEntry.value}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 60000
                        }
                    );
                    const text = response.data?.choices?.[0]?.message?.content;
                    if (!text) throw new Error(`Invalid response format from Groq API (model: ${model})`);
                    console.log(`Groq: succeeded with model ${model}`);
                    return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                } catch (err) {
                    lastErr = err;
                    const status = err.response?.status;
                    console.warn(`Groq model ${model} failed (status: ${status || err.code})`);
                    if (status === 429) {
                        groqKeyPool.markCooldown(keyEntry);
                        throw err;
                    }
                    // If auth error, no point trying other models — same key
                    if (status === 401 || status === 403) throw err;
                    // For rate limit or transient errors, try next model
                    if (status === 429 || status === 503 || status === 500 || err.code === 'ECONNABORTED') {
                        continue;
                    }
                    // For other errors, also try next model
                    continue;
                }
            }
            throw lastErr || new Error('All Groq models exhausted');
        },
        isTransient: (err) => {
            const s = err.response?.status;
            return err.code === 'ECONNABORTED' || s === 429 || s === 503 || s === 500;
        },
        isFatal: (err) => {
            const s = err.response?.status;
            return s === 401 || s === 403 || s === 402;
        }
    }
];

// ─── Task-Based Routing ────────────────────────────────────────────────────────

/**
 * Maps task categories to preferred provider ordering.
 * The generate() method uses this to pick the optimal chain for each task.
 *
 * Tasks:
 *   'fast'      – quick, latency-sensitive tasks (SRS edits, questions, decompose)
 *   'reasoning' – deep analysis (system design, schema design)
 *   'code'      – code generation, translation, testing
 *   'review'    – code review, multi-agent review
 *   'creative'  – diagram generation, creative outputs
 *   'default'   – generic fallback order
 */
const TASK_ROUTING = {
    fast:      ['gemini', 'groq', 'deepseek'],
    reasoning: ['deepseek', 'gemini', 'groq'],
    code:      ['deepseek', 'gemini', 'groq'],
    review:    ['deepseek', 'gemini', 'groq'],
    creative:  ['gemini', 'deepseek', 'groq'],
    default:   ['gemini', 'deepseek', 'groq'],
};

// ─── LLM Service ───────────────────────────────────────────────────────────────

class LLMService {
    constructor() {
        this.apiKey = geminiKeyPool.entries[0]?.value; // kept for backwards compat checks
        // Track provider health — temporarily skip providers with auth failures
        this._disabledProviders = new Map(); // name → re-enable timestamp
    }

    /**
     * Get list of all available (configured) providers with health status.
     */
    getStatus() {
        const now = Date.now();
        return PROVIDERS.map(p => {
            const disabled = this._disabledProviders.get(p.name);
            const isDisabled = disabled && disabled > now;
            return {
                name: p.name,
                configured: p.available(),
                healthy: p.available() && !isDisabled,
                disabledUntil: isDisabled ? new Date(disabled).toISOString() : null,
            };
        });
    }

    getKeyPoolStatus() {
        return {
            gemini: geminiKeyPool.getStatus(),
            groq: groqKeyPool.getStatus(),
        };
    }

    /**
     * Get the ordered provider list for a given task.
     * @param {string} task – one of: fast, reasoning, code, review, creative, default
     * @returns {object[]} ordered provider objects
     */
    _getProvidersForTask(task) {
        const order = TASK_ROUTING[task] || TASK_ROUTING.default;
        const now = Date.now();
        const providerMap = new Map(PROVIDERS.map(p => [p.name, p]));

        return order
            .map(name => providerMap.get(name))
            .filter(p => {
                if (!p || !p.available()) return false;
                const disabled = this._disabledProviders.get(p.name);
                if (disabled && disabled > now) return false;
                return true;
            });
    }

    /**
     * Generate text using the optimal LLM provider for the given task.
     *
     * @param {string} prompt – the full prompt text
     * @param {object} [options] – optional settings
     * @param {string} [options.task='default'] – task category for routing
     * @returns {Promise<string>} generated text
     */
    async generate(prompt, options = {}) {
        const task = options.task || 'default';
        const available = this._getProvidersForTask(task);

        if (available.length === 0) {
            // Check if any providers are configured at all
            const anyConfigured = PROVIDERS.some(p => p.available());
            if (!anyConfigured) {
                throw new Error('No LLM API keys configured. Set GEMINI_API_KEY, DEEPSEEK_API_KEY, or GROQ_API_KEY in .env');
            }
            // Providers are configured but temporarily disabled — clear and retry
            this._disabledProviders.clear();
            return this.generate(prompt, options);
        }

        let lastError;

        for (const provider of available) {
            const maxAttempts = 2;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await rateLimiter.tryAcquire();
                    console.log(`LLM [${task}] → ${provider.name} attempt ${attempt}/${maxAttempts}`);
                    const text = await provider.call(prompt);
                    if (attempt > 1 || provider !== available[0]) {
                        console.log(`LLM [${task}]: succeeded via ${provider.name}`);
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
                        console.warn(`${provider.name}: auth error, disabling for 5 minutes`);
                        this._disabledProviders.set(provider.name, Date.now() + 5 * 60 * 1000);
                        break; // try next provider immediately
                    }
                    if (attempt < maxAttempts) {
                        // For rate limit errors, wait longer before retry
                        const isRateLimit = error.response?.status === 429;
                        await sleep(isRateLimit ? 2000 * attempt : 800 * attempt);
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

    /**
     * Clear all disabled providers (useful for testing / admin reset).
     */
    resetProviderHealth() {
        this._disabledProviders.clear();
    }
}

module.exports = new LLMService();
