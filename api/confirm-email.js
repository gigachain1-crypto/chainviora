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
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({ success: true, note: 'Service key not set, skipping confirm' });
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

    // Auto-confirm the email using admin updateUserById
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { email_confirm: true }
    );

    if (updateErr) {
      console.error('Email confirm error:', updateErr.message);
      return res.status(500).json({ error: updateErr.message });
    }

    console.log('Email auto-confirmed for:', email, 'userId:', targetUser.id);
    return res.status(200).json({
      success: true,
      message: 'Email confirmed successfully',
      userId: targetUser.id
    });

  } catch (err) {
    console.error('confirm-email fatal:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
