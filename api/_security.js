// api/_security.js
// ============================================================
// GIGACHAIN — Centralized Security Middleware
// Covers: Rate Limiting, CORS, Input Sanitization,
//         XSS Prevention, SQL Injection Guards,
//         Bot Detection, Request Size Limits
// ============================================================

// ─── In-Memory Rate Limiter (per IP per endpoint) ───────────
const rateLimitStore = new Map();

function getRateLimitKey(ip, endpoint) {
  return `${ip}::${endpoint}`;
}

function isRateLimited(ip, endpoint, maxRequests, windowMs) {
  const key = getRateLimitKey(ip, endpoint);
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || now - record.windowStart > windowMs) {
    record = { count: 1, windowStart: now };
    rateLimitStore.set(key, record);
    return false;
  }

  record.count++;
  if (record.count > maxRequests) {
    return true;
  }
  return false;
}

// Auto-cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now - val.windowStart > 10 * 60 * 1000) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ─── Get Real Client IP ──────────────────────────────────────
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || '0.0.0.0';
}

// ─── Allowed Origins (strict CORS) ───────────────────────────
const ALLOWED_ORIGINS = [
  'https://www.chainviora.com',
  'https://chainviora.com',
  'https://chainviora.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000'
];

function getAllowedOrigin(reqOrigin) {
  if (!reqOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  // Allow any vercel preview deployments
  if (reqOrigin.match(/^https:\/\/chainviora-[a-z0-9-]+\.vercel\.app$/)) return reqOrigin;
  return null;
}

// ─── Set Security Headers ────────────────────────────────────
function setSecurityHeaders(res, reqOrigin) {
  const allowedOrigin = getAllowedOrigin(reqOrigin);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
}

// ─── Input Sanitization ───────────────────────────────────────
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe[\s\S]*?>/gi,
  /<img[^>]+onerror/gi,
  /eval\s*\(/gi,
  /document\.cookie/gi,
  /window\.location/gi,
  /<svg[\s\S]*?on\w+/gi,
  /data:text\/html/gi
];

const SQL_PATTERNS = [
  /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|UNION|CAST|CONVERT)\s/gi,
  /--\s/g,
  /;\s*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)/gi,
  /\/\*[\s\S]*?\*\//g,
  /xp_cmdshell/gi,
  /INFORMATION_SCHEMA/gi,
  /sys\.tables/gi
];

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let s = str.trim();

  // Block XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(s)) {
      throw new Error('SECURITY: Malicious input detected (XSS)');
    }
  }

  // Block SQL injection
  for (const pattern of SQL_PATTERNS) {
    if (pattern.test(s)) {
      throw new Error('SECURITY: SQL injection attempt detected');
    }
  }

  // Strip null bytes
  s = s.replace(/\0/g, '');
  return s;
}

function sanitizeObject(obj, depth = 0) {
  if (depth > 5) return obj; // Prevent deep recursion bombs
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => sanitizeObject(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, val] of Object.entries(obj)) {
      const cleanKey = sanitizeString(key);
      cleaned[cleanKey] = sanitizeObject(val, depth + 1);
    }
    return cleaned;
  }
  return obj;
}

// ─── Email Validation ──────────────────────────────────────────
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  if (e.length > 254) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e);
}

// ─── Request Body Size Limit (100KB) ─────────────────────────
const MAX_BODY_SIZE = 100 * 1024;

function checkBodySize(req) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }
}

// ─── Suspicious Bot / Attack Pattern Detection ────────────────
const BOT_UA_PATTERNS = [
  /sqlmap/i, /nikto/i, /nessus/i, /masscan/i, /zgrab/i,
  /dirbuster/i, /havij/i, /acunetix/i, /nmap/i, /wget/i,
  /python-requests\/[01]\./i, /go-http-client\/1\./i
];

function isSuspiciousRequest(req) {
  const ua = req.headers['user-agent'] || '';
  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) return true;
  }
  return false;
}

// ─── Main Middleware Function ─────────────────────────────────
/**
 * applySecurityMiddleware(req, res, options)
 *
 * options:
 *   - rateLimit: { max: number, windowMs: number }  default: { max: 30, windowMs: 60000 }
 *   - endpoint: string (for rate limit key)
 *   - allowGet: boolean  (default: false — only POST)
 *   - skipBodySanitize: boolean  (default: false)
 *
 * Returns false if request should be BLOCKED (response already sent).
 * Returns true if request should proceed.
 */
async function applySecurityMiddleware(req, res, options = {}) {
  const reqOrigin = req.headers['origin'] || req.headers['referer'] || '';
  const clientIp = getClientIp(req);

  setSecurityHeaders(res, reqOrigin);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  // Block known attack bots
  if (isSuspiciousRequest(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }

  // Method check
  const allowedMethods = ['POST'];
  if (options.allowGet) allowedMethods.push('GET');
  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }

  // Rate limiting
  const rlMax = (options.rateLimit && options.rateLimit.max) || 30;
  const rlWindow = (options.rateLimit && options.rateLimit.windowMs) || 60 * 1000;
  const rlEndpoint = options.endpoint || req.url || 'api';

  if (isRateLimited(clientIp, rlEndpoint, rlMax, rlWindow)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({
      error: 'Too many requests. Please wait before trying again.',
      retryAfter: 60
    });
    return false;
  }

  // Body size check
  try {
    checkBodySize(req);
  } catch (e) {
    res.status(413).json({ error: 'Request too large' });
    return false;
  }

  // Input sanitization (POST body)
  if (req.method === 'POST' && req.body && !options.skipBodySanitize) {
    try {
      req.body = sanitizeObject(req.body);
    } catch (e) {
      console.warn(`[SECURITY] Malicious input blocked from IP ${clientIp}:`, e.message);
      res.status(400).json({ error: 'Invalid input detected' });
      return false;
    }
  }

  return true; // All checks passed — proceed
}

module.exports = {
  applySecurityMiddleware,
  isValidEmail,
  sanitizeString,
  sanitizeObject,
  getClientIp,
  isRateLimited,
  setSecurityHeaders
};
