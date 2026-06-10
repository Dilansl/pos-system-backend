export const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR on ${req.method} ${req.path}:`);
  console.error(err);

  // PostgreSQL unique violation (duplicate username/barcode)
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'A record with that value already exists.',
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Related record not found.',
    });
  }

  // PostgreSQL check constraint violation
  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'Value violates a data constraint.',
    });
  }

  // Default 500 error
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
};