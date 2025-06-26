require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Error logging function
function logError(error, req = null) {
  const timestamp = new Date().toISOString();
  const requestInfo = req ? `${req.method} ${req.url}` : 'No request context';
  
  console.error(`[${timestamp}] ERROR: ${error.message}`);
  console.error(`Request: ${requestInfo}`);
  console.error(`Stack: ${error.stack}`);
  
  // Log additional context if available
  if (req && req.body) {
    console.error(`Request body: ${JSON.stringify(req.body, null, 2)}`);
  }
}

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Body parsing middleware with error handling
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Handle JSON parsing errors
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    logError(new Error('Invalid JSON in request body'), req);
    return res.status(400).json({ 
      error: 'Invalid JSON format in request body',
      details: 'Please check your request format and try again'
    });
  }
  next(error);
});

app.use(express.static('.'));

// Import the API handler
const summarizeHandler = require('./api/summarize.js');

// API endpoints with enhanced error handling
app.post('/api/summarize', async (req, res) => {
  try {
    await summarizeHandler.default(req, res);
  } catch (error) {
    logError(error, req);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing your request'
      });
    }
  }
});

app.post('/api/summarize-multiple', async (req, res) => {
  try {
    await summarizeHandler.handleMultipleUrls(req, res);
  } catch (error) {
    logError(error, req);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing multiple articles'
      });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve the HTML file
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'index.html'));
  } catch (error) {
    logError(error, req);
    res.status(500).send('Internal Server Error: Unable to serve the page');
  }
});

// Handle 404 errors
app.use('*', (req, res) => {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] 404 Not Found: ${req.method} ${req.originalUrl}`);
  
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({ 
      error: 'API endpoint not found',
      availableEndpoints: ['/api/summarize', '/api/summarize-multiple', '/api/health']
    });
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>404 - Page Not Found</title></head>
      <body>
        <h1>404 - Page Not Found</h1>
        <p>The requested page could not be found.</p>
        <a href="/">Go back to home</a>
      </body>
      </html>
    `);
  }
});

// Global error handler
app.use((error, req, res, next) => {
  logError(error, req);
  
  // Don't send error response if headers already sent
  if (res.headersSent) {
    return next(error);
  }
  
  // Determine error type and appropriate response
  let statusCode = 500;
  let errorMessage = 'Internal server error';
  let errorDetails = 'An unexpected error occurred';
  
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorMessage = 'Validation error';
    errorDetails = error.message;
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    errorMessage = 'Unauthorized';
    errorDetails = 'Authentication required';
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorMessage = 'Service unavailable';
    errorDetails = 'External service is temporarily unavailable';
  } else if (error.code === 'ETIMEDOUT') {
    statusCode = 408;
    errorMessage = 'Request timeout';
    errorDetails = 'The request took too long to process';
  }
  
  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    res.status(statusCode).json({
      error: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(statusCode).send(`
      <!DOCTYPE html>
      <html>
      <head><title>${statusCode} - ${errorMessage}</title></head>
      <body>
        <h1>${statusCode} - ${errorMessage}</h1>
        <p>${errorDetails}</p>
        <a href="/">Go back to home</a>
      </body>
      </html>
    `);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  logError(error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 AI Wikipedia Summarizer is ready!`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
});
