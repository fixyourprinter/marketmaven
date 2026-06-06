const os = require('os');

class TelemetryService {
  constructor() {
    this.ollama = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalPromptTokens: 0,
      totalEvalTokens: 0,
      totalDurationMs: 0,
      recentRequests: [] // Array of the last 20 requests
    };
    
    this.network = {
      totalRequests: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      requestTimestamps: [] // Used to calculate rolling requests per second
    };
    
    // Map of userId -> session metadata
    this.activeSessions = new Map();
  }

  /**
   * Log an Ollama API request's outcome and token metrics
   */
  recordOllamaRequest(model, action, promptTokens, evalTokens, durationMs, success) {
    this.ollama.totalRequests++;
    if (success) {
      this.ollama.successfulRequests++;
    } else {
      this.ollama.failedRequests++;
    }
    this.ollama.totalPromptTokens += (promptTokens || 0);
    this.ollama.totalEvalTokens += (evalTokens || 0);
    this.ollama.totalDurationMs += (durationMs || 0);

    this.ollama.recentRequests.unshift({
      timestamp: new Date().toISOString(),
      model: model || 'unknown',
      action: action || 'unknown',
      promptTokens: promptTokens || 0,
      evalTokens: evalTokens || 0,
      durationMs: durationMs || 0,
      success: !!success
    });

    // Cap history at 20 items
    if (this.ollama.recentRequests.length > 20) {
      this.ollama.recentRequests.pop();
    }
  }

  /**
   * Record standard HTTP network stats
   */
  recordNetworkRequest(bytesReceived, bytesSent, path, method) {
    this.network.totalRequests++;
    this.network.totalBytesReceived += (bytesReceived || 0);
    this.network.totalBytesSent += (bytesSent || 0);
    this.network.requestTimestamps.push(Date.now());
    
    // Discard timestamps older than 10 seconds to keep memory clean
    const tenSecondsAgo = Date.now() - 10000;
    this.network.requestTimestamps = this.network.requestTimestamps.filter(t => t > tenSecondsAgo);
  }

  /**
   * Keep track of currently connected authenticated testers
   */
  updateUserSession(userId, username, role, ip, path) {
    this.activeSessions.set(userId, {
      username,
      role,
      ip,
      lastActivePath: path,
      lastActiveTime: Date.now()
    });
  }

  /**
   * Calculate Requests Per Second (RPS) over a rolling 10-second window
   */
  getRequestsPerSecond() {
    const tenSecondsAgo = Date.now() - 10000;
    this.network.requestTimestamps = this.network.requestTimestamps.filter(t => t > tenSecondsAgo);
    return parseFloat((this.network.requestTimestamps.length / 10).toFixed(2));
  }

  /**
   * Compile list of user sessions sorted by activity
   */
  getActiveSessions() {
    const sessionsList = [];
    const now = Date.now();
    
    for (const [userId, session] of this.activeSessions.entries()) {
      const idleMs = now - session.lastActiveTime;
      sessionsList.push({
        userId,
        username: session.username,
        role: session.role,
        ip: session.ip,
        lastActivePath: session.lastActivePath,
        lastActiveTime: new Date(session.lastActiveTime).toISOString(),
        idleMs,
        isOnline: idleMs < 5 * 60 * 1000 // consider online if active in last 5 minutes
      });
    }
    
    // Sort showing most recently active first
    return sessionsList.sort((a, b) => b.lastActiveTime.localeCompare(a.lastActiveTime));
  }

  /**
   * Gather hardware usage information
   */
  getSystemStats() {
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
    const cpuCores = cpus.length;
    
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = parseFloat(((usedMem / totalMem) * 100).toFixed(1));
    
    return {
      cpu: {
        model: cpuModel,
        cores: cpuCores
      },
      memory: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: usedMem,
        usagePercent: memUsagePercent
      },
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime()
      },
      process: {
        version: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Formats full telemetry output for endpoint response
   */
  getTelemetry() {
    const avgLatency = this.ollama.totalRequests > 0 
      ? Math.round(this.ollama.totalDurationMs / this.ollama.totalRequests)
      : 0;

    return {
      ollama: {
        ...this.ollama,
        averageLatencyMs: avgLatency
      },
      network: {
        totalRequests: this.network.totalRequests,
        totalBytesSent: this.network.totalBytesSent,
        totalBytesReceived: this.network.totalBytesReceived,
        requestsPerSecond: this.getRequestsPerSecond()
      },
      activeSessions: this.getActiveSessions(),
      system: this.getSystemStats()
    };
  }
}

module.exports = new TelemetryService();
