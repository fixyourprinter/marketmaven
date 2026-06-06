const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./db/database');
const listingRoutes = require('./routes/listing.routes');
const authRoutes = require('./routes/auth.routes');

const maveyRoutes = require('./routes/mavey.routes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Telemetry Service
const telemetryService = require('./services/telemetry.service');

// Middleware
app.use(cors());
app.use(express.json());

// Telemetry Middleware
app.use((req, res, next) => {
  const startBytesRead = req.socket?.bytesRead || 0;
  const startBytesWritten = req.socket?.bytesWritten || 0;

  res.on('finish', () => {
    const endBytesRead = req.socket?.bytesRead || 0;
    const endBytesWritten = req.socket?.bytesWritten || 0;

    const bytesReceived = Math.max(0, endBytesRead - startBytesRead) || parseInt(req.headers['content-length'] || 0);
    const bytesSent = Math.max(0, endBytesWritten - startBytesWritten) || parseInt(res.get('Content-Length') || 0);

    telemetryService.recordNetworkRequest(bytesReceived, bytesSent, req.path, req.method);

    if (req.user) {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'Unknown';
      telemetryService.updateUserSession(req.user.userId, req.user.username, req.user.role, ip, req.originalUrl);
    }
  });

  next();
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/listings', listingRoutes);
app.use('/api', authRoutes);
app.use('/api', maveyRoutes);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
