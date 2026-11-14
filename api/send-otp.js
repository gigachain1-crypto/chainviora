const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Auto-load .env for local execution if not in production
if (!process.env.RESEND_API_KEY) {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
      envLines.forEach(l => {
        const idx = l.indexOf('=');
        if (idx > 0) {
          const k = l.slice(0, idx).trim();
          const v = l.slice(idx + 1).trim();
          if (k && !process.env[k]) process.env[k] = v;
        }
      });
    }
  } catch (e) {}
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OTP_SECRET = process.env.OTP_SECRET || 'chainviora-secret-key-otp-2026';

function sendResendRequest(payload) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const req = https.request(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString)
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = {};
          try {
            json = JSON.parse(body);
          } catch (e) {
            json = { raw: body };
          }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );
    req.on('error', err => reject(err));
    req.write(dataString);
    req.end();
  });
}

module.exports = async (req, res) => {
  // CORS Headers
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

    if (!email || !email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 10 minutes expiry timestamp
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Create tamper-proof HMAC signature
    const hash = crypto
      .createHmac('sha256', OTP_SECRET)
      .update(`${email}:${otp}:${expiresAt}`)
      .digest('hex');

    const token = `${hash}.${expiresAt}`;

    // Luxury Branded HTML Email Template
    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chainviora Verification Code</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #FAF6ED;
      margin: 0;
      padding: 30px 15px;
      color: #1E293B;
    }
    .wrapper {
      max-width: 520px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #E2E8F0;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    }
    .header {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      padding: 30px 24px;
      text-align: center;
      border-bottom: 3px solid #D4AF37;
    }
    .brand-title {
      color: #D4AF37;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 3px;
      margin: 0;
      text-transform: uppercase;
    }
    .brand-subtitle {
      color: #94A3B8;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1.5px;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .content {
      padding: 36px 30px;
    }
    .headline {
      font-size: 20px;
      font-weight: 800;
      color: #0F172A;
      margin: 0 0 14px 0;
    }
    .lead-text {
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin: 0 0 24px 0;
    }
    .otp-box {
      background: #FAF6ED;
      border: 2px dashed #D4AF37;
      border-radius: 12px;
      padding: 22px 16px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 800;
      color: #8C6707;
      margin-bottom: 8px;
    }
    .otp-number {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 36px;
      font-weight: 900;
      letter-spacing: 8px;
      color: #0F172A;
      margin: 0;
    }
    .notice {
      font-size: 13px;
      line-height: 1.6;
      color: #64748B;
      margin: 20px 0 0 0;
    }
    .security-alert {
      background: #FEF3C7;
      border-left: 4px solid #D97706;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 12px;
      color: #92400E;
      margin-top: 24px;
    }
    .footer {
      background: #F8FAFC;
      border-top: 1px solid #E2E8F0;
      padding: 22px 24px;
      text-align: center;
      font-size: 11px;
      color: #94A3B8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1 class="brand-title">CHAINVIORA</h1>
      <p class="brand-subtitle">Hyper-Scalable Web3 Ecosystem</p>
    </div>
    <div class="content">
      <h2 class="headline">Email Verification Code</h2>
      <p class="lead-text">
        Hello,<br>
        Thank you for choosing Chainviora. To verify your email address and activate your Web3 account, please enter the one-time verification code below:
      </p>

      <div class="otp-box">
        <div class="otp-label">Your One-Time Password (OTP)</div>
        <div class="otp-number">${otp}</div>
      </div>

      <p class="notice">
        This verification code is strictly valid for the next <strong>10 minutes</strong>.
      </p>

      <div class="security-alert">
        <strong>Security Warning:</strong> Never share your verification code, password, or private recovery keys with anyone. Chainviora staff will never ask for your verification code.
      </div>

      <p class="notice" style="font-size: 12px; margin-top: 20px;">
        If you did not initiate this registration request, please disregard this email. Your email remains completely secure.
      </p>
    </div>
    <div class="footer">
      &copy; 2026 Chainviora Foundation. All rights reserved.<br>
      Automated Security Notification &bull; Do not reply to this email
    </div>
  </div>
</body>
</html>
`;

    // Attempt 1: Try sending from custom branded domain auth@chainviora.com
    let sendResult = await sendResendRequest({
      from: 'Chainviora Security <auth@chainviora.com>',
      to: email,
      subject: `Your Chainviora Verification Code: ${otp}`,
      html: emailHtml
    });

    // If domain chainviora.com is not verified yet, fallback to onboarding@resend.dev
    if (sendResult.status === 403 && sendResult.data?.message?.includes('not verified')) {
      sendResult = await sendResendRequest({
        from: 'Chainviora Security <onboarding@resend.dev>',
        to: email,
        subject: `Your Chainviora Verification Code: ${otp}`,
        html: emailHtml
      });
    }

    if (sendResult.status >= 200 && sendResult.status < 300) {
      return res.status(200).json({
        success: true,
        token: token,
        message: `Verification code sent to ${email}. Please check your inbox!`
      });
    } else {
      console.error('Resend delivery failed:', sendResult.status, sendResult.data);

      const errMessage = sendResult.data?.message || '';

      // Helpful message if testing email constraint in Resend sandbox
      if (errMessage.includes('can only send testing emails to your own email address') || errMessage.includes('testing email address')) {
        return res.status(400).json({
          success: false,
          resendNotice: true,
          message: `Resend Notice: Add 'chainviora.com' in Resend -> Domains to send OTP to any email. Currently in testing mode, it can send to your Resend email (gigachain1@gmail.com).`
        });
      }

      return res.status(400).json({
        success: false,
        message: errMessage || 'Failed to deliver OTP email.'
      });
    }
  } catch (err) {
    console.error('send-otp handler error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
  }
};
