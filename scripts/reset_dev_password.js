const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function resetPassword() {
  const email = 'manisreethaar@gmail.com';
  const newPassword = 'password123!';
  
  console.log(`Looking up user ${email}...`);
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error("Error listing users:", listError);
    return;
  }

  const user = users.find(u => u.email === email);
  
  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
    if (error) {
      console.error("Error resetting password:", error);
    } else {
      console.log(`SUCCESS: Password for ${email} has been reset to: ${newPassword}`);
    }
  } else {
    console.log("User not found, creating new one...");
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: newPassword,
      email_confirm: true
    });
    if (error) {
      console.error("Error creating user:", error);
    } else {
      console.log(`SUCCESS: Created user ${email} with password: ${newPassword}`);
    }
  }
}

resetPassword();
