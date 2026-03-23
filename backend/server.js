const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: ['https://amazing-wisp-16aa99.netlify.app', 'https://college-erp-frontend-production.up.railway.app', 'http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '5mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/student/login', loginLimiter);
app.use('/api/auth/teacher/login', loginLimiter);
app.use('/api/admin/login', loginLimiter);

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/students',    require('./routes/students'));
app.use('/api/attendance',  require('./routes/attendance'));
app.use('/api/fees',        require('./routes/fees'));
app.use('/api/subjects',    require('./routes/subjects'));
app.use('/api/marks',       require('./routes/marks'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/levels',      require('./routes/levels'));
app.use('/api/programmes',  require('./routes/programmes'));
app.use('/api/faculties',   require('./routes/faculties'));
app.use('/api/enrollment',  require('./routes/enrollment'));
app.use('/api/disciplines', require('./routes/disciplines'));

app.use((err, req, res, next) => {
  console.error(err);
  console.error("GLOBAL ERROR:", err.message, err.stack); res.status(500).json({ error: err.message });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
