// api/confirm-email.js
// Auto-confirms user email in Supabase using admin/service role
// Called right after our OTP verification succeeds during signup
// This prevents "Email not confirmed" error on login

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, username, referral_code } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({
        success: true,
        note: 'Service key not set, skipping confirm',
        username: username || null
      });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Find the user by email using admin API
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.error('listUsers error:', listErr.message);
      return res.status(500).json({ error: listErr.message });
    }

    const targetUser = listData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found', note: 'May not be registered yet' });
    }

    // Determine permanent username (existing metadata wins so it NEVER changes)
    const existingMeta = targetUser.user_metadata || {};
    const finalUsername = existingMeta.username || username || null;
    const finalRefCode = existingMeta.referral_code || referral_code || null;

    const updatePayload = {
      email_confirm: true,
      user_metadata: {
        ...existingMeta,
        ...(finalUsername ? { username: finalUsername } : {}),
        ...(finalRefCode ? { referral_code: finalRefCode } : {})
      }
    };

    // Auto-confirm the email & update metadata
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      updatePayload
    );

    if (updateErr) {
      console.error('Email confirm error:', updateErr.message);
      return res.status(500).json({ error: updateErr.message });
    }

    // Also persist username into public.profiles table
    if (finalUsername) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: targetUser.id,
            email: targetUser.email,
            username: finalUsername,
            ...(finalRefCode ? { referral_code: finalRefCode } : {})
          }, { onConflict: 'id' });
      } catch (profErr) {
        console.warn('Profile upsert note in confirm-email:', profErr.message);
      }
    }

    console.log('Email confirmed & metadata locked for:', email, 'userId:', targetUser.id, 'username:', finalUsername);
    return res.status(200).json({
      success: true,
      message: 'Email confirmed successfully',
      userId: targetUser.id,
      username: finalUsername,
      referral_code: finalRefCode
    });

  } catch (err) {
    console.error('confirm-email fatal:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
