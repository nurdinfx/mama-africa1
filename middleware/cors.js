import cors from 'cors';

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'https://mama-africa1.vercel.app',
      process.env.FRONTEND_URL,
      process.env.PRODUCTION_FRONTEND_URL
    ].filter(Boolean);

    // Allow all Vercel deployments and configured origins
    if (origin && (origin.includes('.vercel.app') || allowedOrigins.indexOf(origin) !== -1)) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Be more permissive - allow all origins for now
      console.log('⚠️ CORS: Allowing origin:', origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
};

export default cors(corsOptions);
