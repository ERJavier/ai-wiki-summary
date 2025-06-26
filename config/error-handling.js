// Error handling configuration and utilities

const ERROR_TYPES = {
    VALIDATION: 'ValidationError',
    AUTHENTICATION: 'AuthenticationError',
    RATE_LIMIT: 'RateLimitError',
    TIMEOUT: 'TimeoutError',
    NETWORK: 'NetworkError',
    API: 'APIError',
    SERVER: 'ServerError'
};

const ERROR_CODES = {
    INVALID_URL: 'INVALID_URL',
    ARTICLE_NOT_FOUND: 'ARTICLE_NOT_FOUND',
    API_KEY_INVALID: 'API_KEY_INVALID',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    TIMEOUT: 'TIMEOUT',
    INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
    CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
    INVALID_RESPONSE: 'INVALID_RESPONSE'
};

const ERROR_MESSAGES = {
    [ERROR_CODES.INVALID_URL]: 'Please provide a valid Wikipedia article URL',
    [ERROR_CODES.ARTICLE_NOT_FOUND]: 'The specified Wikipedia article could not be found',
    [ERROR_CODES.API_KEY_INVALID]: 'API configuration error. Please contact support',
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait a moment and try again',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later',
    [ERROR_CODES.TIMEOUT]: 'Request timed out. Please try again with a shorter article',
    [ERROR_CODES.INSUFFICIENT_CREDITS]: 'Service quota exceeded. Please try again later',
    [ERROR_CODES.CONTENT_TOO_LONG]: 'Article is too long to process. Please try a shorter article',
    [ERROR_CODES.INVALID_RESPONSE]: 'Invalid response from service. Please try again'
};

const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    retryableStatuses: [429, 500, 502, 503, 504],
    retryableErrors: ['timeout', 'network', 'ECONNRESET', 'ENOTFOUND']
};

class AppError extends Error {
    constructor(message, code, statusCode = 500, isOperational = true) {
        super(message);
        
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, code = ERROR_CODES.INVALID_URL) {
        super(message, code, 400);
    }
}

class APIError extends AppError {
    constructor(message, code, statusCode = 500) {
        super(message, code, statusCode);
    }
}

class RateLimitError extends AppError {
    constructor(message = ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_EXCEEDED], retryAfter = 60) {
        super(message, ERROR_CODES.RATE_LIMIT_EXCEEDED, 429);
        this.retryAfter = retryAfter;
    }
}

function categorizeError(error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return { type: ERROR_TYPES.TIMEOUT, retryable: true };
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return { type: ERROR_TYPES.NETWORK, retryable: true };
    }
    
    if (error.statusCode) {
        if (error.statusCode === 429) {
            return { type: ERROR_TYPES.RATE_LIMIT, retryable: true };
        }
        if (error.statusCode >= 500) {
            return { type: ERROR_TYPES.SERVER, retryable: true };
        }
        if (error.statusCode === 401 || error.statusCode === 403) {
            return { type: ERROR_TYPES.AUTHENTICATION, retryable: false };
        }
        if (error.statusCode >= 400) {
            return { type: ERROR_TYPES.VALIDATION, retryable: false };
        }
    }
    
    return { type: ERROR_TYPES.API, retryable: true };
}

function shouldRetry(error, attempt, maxRetries = RETRY_CONFIG.maxRetries) {
    if (attempt >= maxRetries) return false;
    
    const { retryable } = categorizeError(error);
    return retryable;
}

function calculateRetryDelay(attempt, baseDelay = RETRY_CONFIG.baseDelay, maxDelay = RETRY_CONFIG.maxDelay) {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitteredDelay = exponentialDelay + Math.random() * 1000;
    return Math.min(jitteredDelay, maxDelay);
}

function sanitizeError(error) {
    // Remove sensitive information from error messages
    let message = error.message;
    
    // Remove API keys or tokens
    message = message.replace(/Bearer\s+[A-Za-z0-9_-]+/g, 'Bearer [REDACTED]');
    message = message.replace(/api[_-]?key[=:]\s*[A-Za-z0-9_-]+/gi, 'api_key=[REDACTED]');
    message = message.replace(/token[=:]\s*[A-Za-z0-9_.-]+/gi, 'token=[REDACTED]');
    
    return {
        message,
        code: error.code || 'UNKNOWN_ERROR',
        type: error.name || 'Error',
        statusCode: error.statusCode,
        timestamp: new Date().toISOString()
    };
}

function logError(error, context = {}) {
    const sanitized = sanitizeError(error);
    const logEntry = {
        ...sanitized,
        context,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    console.error('Application Error:', JSON.stringify(logEntry, null, 2));
}

module.exports = {
    ERROR_TYPES,
    ERROR_CODES,
    ERROR_MESSAGES,
    RETRY_CONFIG,
    AppError,
    ValidationError,
    APIError,
    RateLimitError,
    categorizeError,
    shouldRetry,
    calculateRetryDelay,
    sanitizeError,
    logError
}; 