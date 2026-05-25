function notFound(req, res) {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
  });
}

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const requestId = req.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (status >= 500) {
    console.error(`[${requestId}]`, err);
  }

  res.status(status).json({
    error: err.message || 'Internal server error',
    code,
    requestId,
  });
}

module.exports = { errorHandler, notFound };
