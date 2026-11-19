/* ==============================================================================
   GIGACHAIN - Supabase Client Configuration & Web3 Auth Services
   (With 100% Reliable Direct REST API Fallbacks for Jio / CDN Blocks)
   ============================================================================== */

const SUPABASE_URL = 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY';

// Initialize Supabase Client if library is loaded
let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Gigachain Supabase Client Connected Successfully');
    return supabaseClient;
  }
  return null;
}

getSupabaseClient();

// ------------------------------------------------------------------------------
// Auth Helper Functions (With Direct REST Fallback)
// ------------------------------------------------------------------------------

/**
 * Register a new user in Supabase with permanent username & referral code
 */
async function signUpUser(email, password, fullName, username, referralCode) {
  const client = getSupabaseClient();
  const uname = username || ('GIGA' + Math.floor(100000 + Math.random() * 900000));
  const rcode = referralCode || Math.floor(100000 + Math.random() * 900000).toString();

  if (client) {
    try {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: (fullName || 'Gigachain Member').trim(),
            username: uname,
            referral_code: rcode
          }
        }
      });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('Supabase JS signUp notice, trying REST API:', e.message);
    }
  }

  // Direct REST Fallback (Works on any network / when CDN blocked)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email.trim(),
      password: password,
      data: {
        full_name: (fullName || 'Gigachain Member').trim(),
        username: uname,
        referral_code: rcode
      }
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Registration failed');
  }
  return { user: data.user || data, session: data };
}

/**
 * Sign in existing user with Email & Password
 */
async function signInUser(email, password) {
  const client = getSupabaseClient();

  if (client) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });
      if (!error && data && data.user) return data;
      if (error) {
        // If error is actual invalid credentials, throw it directly
        if (error.message.includes('Invalid login') || error.message.includes('invalid_credentials')) {
          throw error;
        }
      }
    } catch (e) {
      if (e.message && (e.message.includes('Invalid login') || e.message.includes('invalid_credentials'))) {
        throw e;
      }
      console.warn('Supabase JS signIn notice, trying REST API:', e.message);
    }
  }

  // Direct REST Fallback (Works on any network / when CDN blocked)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email.trim(),
      password: password
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Invalid login credentials');
  }

  return { user: data.user, session: data };
}

/**
 * Sign out current user
 */
async function signOutUser() {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (e) { }
  }
  localStorage.removeItem('gigachain_current_user');
}

/**
 * Get current session user
 */
async function getCurrentUser() {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      return session ? session.user : null;
    } catch (e) { }
  }
  const saved = localStorage.getItem('gigachain_current_user');
  return saved ? JSON.parse(saved) : null;
}

/**
 * Fetch profile data from public.profiles
 */
async function fetchUserProfile(userId) {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data) return data;
    } catch (e) { }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const rows = await res.json();
    return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch profile data by user email (cross-device lookup)
 */
async function fetchProfileByEmail(email) {
  if (!email) return null;
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .ilike('email', email.trim().toLowerCase())
        .maybeSingle();
      if (!error && data) return data;
    } catch (e) { }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(email.trim().toLowerCase())}&select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const rows = await res.json();
    return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
  } catch (err) {
    return null;
  }
}

/**
 * Record a Swap transaction to Supabase
 */
async function recordTransactionToSupabase(userId, fromAsset, toAsset, amountIn, amountOut, txHash) {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data } = await client
        .from('transactions')
        .insert([{
          user_id: userId,
          tx_hash: txHash,
          type: 'swap',
          from_token: fromAsset,
          to_token: toAsset,
          amount_in: amountIn,
          amount_out: amountOut,
          status: 'confirmed'
        }])
        .select();
      return data;
    } catch (e) { }
  }
  return null;
}

// Expose globally IMMEDIATELY
window.gigachainAuth = {
  client: supabaseClient,
  signUp: signUpUser,
  signIn: signInUser,
  signOut: signOutUser,
  getUser: getCurrentUser,
  getProfile: fetchUserProfile,
  getProfileByEmail: fetchProfileByEmail,
  recordStake: recordTransactionToSupabase,
  recordTx: recordTransactionToSupabase
};
