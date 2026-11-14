const crypto = require('crypto');

const OTP_SECRET = process.env.OTP_SECRET || 'chainviora-secret-key-otp-2026';

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
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

    // Recompute HMAC to verify authenticity
    const computedHash = crypto
      .createHmac('sha256', OTP_SECRET)
      .update(`${email}:${otp}:${expiresAt}`)
      .digest('hex');

    if (computedHash !== expectedHash) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect 6-digit OTP code. Please enter the valid code from your email.'
      });
    }

    // OTP is authentic and valid!
    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Email address verified successfully!'
    });
  } catch (err) {
    console.error('verify-otp handler error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
  }
};

