/* ==============================================================================
   GIGACHAIN - Supabase Client Configuration & Web3 Auth Services
   ============================================================================== */

const SUPABASE_URL = 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY';

// Initialize Supabase Client
let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === 'function') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Gigachain Supabase Client Connected Successfully');
} else {
  console.error('❌ Supabase JS library not loaded. Make sure supabase-js script is included.');
}

// ------------------------------------------------------------------------------
// Auth Helper Functions
// ------------------------------------------------------------------------------

/**
 * Register a new user in Supabase
 */
async function signUpUser(email, password, fullName) {
  if (!supabaseClient) throw new Error('Supabase client is not initialized');

  const { data, error } = await supabaseClient.auth.signUp({
    email: email.trim(),
    password: password,
    options: {
      data: {
        full_name: fullName.trim()
      }
    }
  });

  if (error) throw error;
  return data;
}

/**
 * Sign in existing user with Email & Password
 */
async function signInUser(email, password) {
  if (!supabaseClient) throw new Error('Supabase client is not initialized');

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error) throw error;
  return data;
}

/**
 * Sign out current user
 */
async function signOutUser() {
  if (!supabaseClient) throw new Error('Supabase client is not initialized');
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

/**
 * Get current session user
 */
async function getCurrentUser() {
  if (!supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.user : null;
}

/**
 * Fetch profile data from public.profiles
 */
async function fetchUserProfile(userId) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('Profile fetch notice:', error.message);
    return null;
  }
  return data;
}

/**
 * Save a new staking record to Supabase
 */
async function recordStakeToSupabase(userId, amount, apy = 18.5, dailyYield = 0) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('stakes')
    .insert([
      {
        user_id: userId,
        amount_giga: amount,
        apy_rate: apy,
        daily_yield: dailyYield
      }
    ])
    .select();

  if (error) {
    console.error('Error recording stake:', error.message);
  }
  return data;
}

/**
 * Record a Swap transaction to Supabase
 */
async function recordTransactionToSupabase(userId, fromToken, toToken, amountIn, amountOut, txHash) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('transactions')
    .insert([
      {
        user_id: userId,
        tx_hash: txHash,
        type: 'swap',
        from_token: fromToken,
        to_token: toToken,
        amount_in: amountIn,
        amount_out: amountOut,
        status: 'confirmed'
      }
    ])
    .select();

  if (error) {
    console.error('Error recording transaction:', error.message);
  }
  return data;
}

// Expose globally
window.gigachainAuth = {
  client: supabaseClient,
  signUp: signUpUser,
  signIn: signInUser,
  signOut: signOutUser,
  getUser: getCurrentUser,
  getProfile: fetchUserProfile,
  recordStake: recordStakeToSupabase,
  recordTx: recordTransactionToSupabase
};

