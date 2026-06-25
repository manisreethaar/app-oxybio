const { createClient } = require('@supabase/supabase-js');

// ── This matches .env.local (the project localhost connects to) ──
const SUPABASE_URL = 'https://ttikqclvbewkollnjvza.supabase.co';
// Anon key — we'll use signUp which doesn't need service role
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0aWtxY2x2YmV3a29sbG5qdnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMDEwMzEsImV4cCI6MjA4OTU3NzAzMX0.Yv0OecoCGYtnvwNKb2aE7zG2igEsmRCx8s_Kjz3-cQI';

const TEST_EMAIL    = 'manisreethaar+dev@gmail.com';
const TEST_PASSWORD = 'OxyDev@2025!';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function run() {
  console.log('🔧 Creating / resetting dev admin in LOCAL Supabase project...\n');
  console.log('   Project:', SUPABASE_URL);

  // Try signUp — if user already exists this will return an error
  const { data, error } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
      console.log('ℹ️  Auth user already exists. Trying password update via OTP flow...');
      // Can't update password without service role — try sign in to verify
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
      if (!signInErr) {
        console.log('✅ Existing credentials still work! No changes needed.');
      } else {
        console.log('⚠️  Cannot sign in with those credentials.');
        console.log('   The password may have been set differently on this project.');
        console.log('   Please try: Use your MAIN login credentials (manisreethaar@gmail.com) on localhost instead.');
      }
    } else {
      console.error('❌ SignUp error:', error.message);
      console.log('\n💡 Alternative: Use your existing main account credentials on localhost.');
      console.log('   The .env.local points to your dev Supabase project (ttikqclvbewkollnjvza).');
      console.log('   Make sure you have an account on THAT project with your main email.');
    }
  } else {
    if (data?.user?.identities?.length === 0) {
      console.log('ℹ️  User already registered on this Supabase project.');
    } else {
      console.log('✅ Auth user created (check email to confirm if email confirmation is ON).');
      console.log('   Note: If email confirmation is required, disable it in Supabase dashboard.');
    }

    // Try to insert employee profile row
    const { error: empErr } = await supabase.from('employees').upsert({
      email: TEST_EMAIL,
      full_name: 'Dev Admin',
      role: 'admin',
      department: 'Administration',
      designation: 'System Administrator',
      is_active: true,
      employee_code: 'DEV001',
      casual_leave_balance: 10,
      medical_leave_balance: 7,
      earned_leave_balance: 15,
    }, { onConflict: 'email', ignoreDuplicates: false });

    if (empErr) {
      console.log('⚠️  Employee profile insert failed:', empErr.message);
      console.log('   (This is OK — RLS may block anon inserts. Your main account\'s profile already exists.)');
    } else {
      console.log('✅ Employee profile upserted.');
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('📋 Summary — Try these login options:');
  console.log('');
  console.log('   Option A (new dev account):');
  console.log(`   Email   : ${TEST_EMAIL}`);
  console.log(`   Password: ${TEST_PASSWORD}`);
  console.log('');
  console.log('   Option B (your main account on this project):');
  console.log('   Email   : manisreethaar@gmail.com');
  console.log('   Password: (your usual password)');
  console.log('══════════════════════════════════════════════\n');
}

run();
