/**
 * Global Error Handling Middleware
 * Ensures graceful error responses and logging
 */

const errorHandler = (err, req, res, next) => {
  console.error('🚨 Error caught by middleware:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Don't leak stack traces in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // API vs HTML error responses
  const isAPI = req.url.startsWith('/api/');
  
  if (isAPI) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: isDevelopment ? err.message : 'Something went wrong',
      ...(isDevelopment && { stack: err.stack })
    });
  } else {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px; background: #0f172a; color: white;">
          <h1>🚨 System Error</h1>
          <p>The trading dashboard encountered an error.</p>
          <p><a href="/" style="color: #3b82f6;">← Return to Dashboard</a></p>
          ${isDevelopment ? `<pre style="background: #1e293b; padding: 10px; margin-top: 20px;">${err.stack}</pre>` : ''}
        </body>
      </html>
    `);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Promise Rejection:', reason);
  // Don't exit in production to maintain uptime
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Graceful shutdown
  process.exit(1);
});

module.exports = errorHandler;