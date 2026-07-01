import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import './config/db.js';

// Routers
import authRouter from './routers/auth.router.js';
import staffRouter from './routers/staff.router.js';
import productRouter from './routers/product.router.js';
import saleRouter from './routers/sale.router.js';
import inventoryRouter from './routers/inventory.router.js';
import customerRouter from './routers/customer.router.js';
import returnRouter from './routers/return.router.js';
import reportRouter from './routers/report.router.js';
import shiftRouter from './routers/shift.router.js';
// Error handler
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

// Middleware
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow all if CORS_ORIGINS is '*', or no origin (Postman), or matching origin
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));


// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'POS API is running.' });
});

// Routes
app.use('/api/auth',      authRouter);
app.use('/api/staff',     staffRouter);
app.use('/api/products',  productRouter);
app.use('/api/sales',     saleRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/customers', customerRouter);
app.use('/api/returns',   returnRouter);
app.use('/api/reports',   reportRouter);
app.use('/api/shifts',    shiftRouter);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found.`,
  });
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});