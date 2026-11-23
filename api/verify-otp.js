const crypto = require('crypto');
const { applySecurityMiddleware, isValidEmail } = require('./_security');

const OTP_SECRET = process.env.OTP_SECRET || 'chainviora-secret-key-otp-2026';

module.exports = async (req, res) => {
  // 🔒 Rate limit: 10 verify attempts per minute per IP (brute force prevention)
  const proceed = await applySecurityMiddleware(req, res, {
    endpoint: 'verify-otp',
    rateLimit: { max: 10, windowMs: 60 * 1000 }
  });
  if (!proceed) return;

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const email = body?.email ? body.email.trim().toLowerCase() : '';
    const otp = body?.otp ? body.otp.toString().trim() : '';
    const token = body?.token ? body.token.trim() : '';

    if (!email || !otp || !token) {
      return res.status(400).json({
        success: false,
        message: 'Missing email, OTP code, or verification token.'
      });
    }

    // OTP must be exactly 6 digits
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'OTP must be exactly 6 digits.' });
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return res.status(400).json({ success: false, message: 'Invalid token format.' });
    }

    const [expectedHash, expiresAtStr] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please click Get OTP again.'
      });
    }

    // Recompute HMAC to verify authenticity (constant-time comparison prevents timing attacks)
    const computedHash = crypto
      .createHmac('sha256', OTP_SECRET)
      .update(`${email}:${otp}:${expiresAt}`)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(expectedHash.length === computedHash.length ? expectedHash : computedHash, 'hex')
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect 6-digit OTP code. Please enter the valid code from your email.'
      });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Email address verified successfully!'
    });
  } catch (err) {
    console.error('verify-otp handler error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

