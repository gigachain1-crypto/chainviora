// api/record-referral.js
// Saves a new referral relationship when a user signs up with a referral code

const { applySecurityMiddleware, isValidEmail } = require('./_security');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  // 🔒 Rate limit: 5 referral records per minute per IP
  const proceed = await applySecurityMiddleware(req, res, {
    endpoint: 'record-referral',
    rateLimit: { max: 5, windowMs: 60 * 1000 }
  });
  if (!proceed) return;

  try {
    const { referrer_code, referred_email, referred_username } = req.body;

    if (!referrer_code || !referred_email) {
      return res.status(400).json({ error: 'referrer_code and referred_email are required' });
    }

    if (!isValidEmail(referred_email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const cleanRef = referrer_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const cleanEmail = referred_email.trim().toLowerCase();
    const cleanUsername = referred_username ? referred_username.trim().slice(0, 50) : null;

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY'
    );

    // 1. Update referred_by in profiles for the referred user if they exist
    try {
      await supabase
        .from('profiles')
        .update({ referred_by: cleanRef })
        .eq('email', cleanEmail);
    } catch (e) { }

    // 2. Insert into referrals table
    try {
      await supabase
        .from('referrals')
        .upsert({
          referrer_code: cleanRef,
          referred_email: cleanEmail,
          referred_username: cleanUsername,
          created_at: new Date().toISOString()
        }, { onConflict: 'referred_email' });
    } catch (refErr) {
      console.warn('referrals table note:', refErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Referral recorded successfully',
      referrer_code: cleanRef,
      referred_email: cleanEmail,
      referred_username: cleanUsername
    });

  } catch (err) {
    console.error('record-referral error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
