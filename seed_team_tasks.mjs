import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = 'https://eofhppcmdhhfrptbxmxd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {

  // Step 2: Get admin user
  const { data: admin, error: adminErr } = await supabase
    .from('employees')
    .select('id, full_name')
    .in('role', ['admin', 'ceo', 'cto'])
    .eq('is_active', true)
    .limit(1)
    .single();

  if (adminErr || !admin) { console.error('No admin found:', adminErr?.message); process.exit(1); }
  console.log(`Using admin: ${admin.full_name}`);

  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const tasks = [
    {
      title: 'pH Calibration & KCL Checking',
      description: 'Perform daily pH meter calibration using standard buffer solutions. Check KCl electrolyte levels. Record all readings per SOP (GDP/ALCOA++).',
      due_date: fmt(today), priority: 'high', routine_interval: 'daily',
      checklist: [
        { text: 'Inspect pH meter for physical damage', done: false },
        { text: 'Rinse electrode with DI water', done: false },
        { text: 'Calibrate with pH 4.0 buffer solution', done: false },
        { text: 'Calibrate with pH 7.0 buffer solution', done: false },
        { text: 'Calibrate with pH 10.0 buffer (if required)', done: false },
        { text: 'Check and top-up KCl electrolyte in electrode', done: false },
        { text: 'Record all calibration values in log', done: false },
      ],
    },
    {
      title: 'LAF Cleaning & Disinfection',
      description: 'Clean and disinfect the Laminar Air Flow (LAF) cabinet. Check HEPA filter and UV lamp status. Wipe down with 70% IPA per SOP.',
      due_date: fmt(today), priority: 'high', routine_interval: 'daily',
      checklist: [
        { text: 'Switch on LAF and allow to stabilize for 15 min', done: false },
        { text: 'Wipe work surface with 70% IPA (front to back)', done: false },
        { text: 'Wipe sidewalls with 70% IPA', done: false },
        { text: 'Check UV lamp indicator and status', done: false },
        { text: 'Check HEPA filter differential pressure gauge reading', done: false },
        { text: 'Record cleaning in LAF log with signature', done: false },
      ],
    },
    {
      title: 'Weekly 70% Ethanol Preparation',
      description: 'Prepare fresh 70% ethanol (v/v) solution using absolute ethanol and DI water. Label with date, expiry (7 days), concentration, and preparer name.',
      due_date: fmt(addDays(today, 7)), priority: 'medium', routine_interval: 'weekly',
      checklist: [
        { text: 'Verify stock of absolute ethanol (>99%)', done: false },
        { text: 'Measure 70 mL absolute ethanol per 100 mL batch', done: false },
        { text: 'Add DI water to make up to 100 mL final volume', done: false },
        { text: 'Mix well and transfer to labeled spray bottle', done: false },
        { text: 'Label: date, expiry (7 days), 70% EtOH, preparer name', done: false },
        { text: 'Dispose of expired old stock', done: false },
      ],
    },
    {
      title: 'IPA Solution Preparation (70%)',
      description: 'Prepare 70% Isopropyl Alcohol (IPA) solution for surface disinfection. Label with date, concentration, expiry (7 days), and preparer name per GDP.',
      due_date: fmt(addDays(today, 7)), priority: 'medium', routine_interval: 'weekly',
      checklist: [
        { text: 'Check stock of 99% IPA', done: false },
        { text: 'Measure 70 mL IPA per 100 mL batch', done: false },
        { text: 'Add DI water to 100 mL final volume', done: false },
        { text: 'Transfer to labeled container/spray bottle', done: false },
        { text: 'Label: date, expiry (7 days), 70% IPA, preparer name', done: false },
        { text: 'Discard expired IPA stock', done: false },
      ],
    },
    {
      title: 'Weighing Balance Calibration',
      description: 'Calibrate analytical/top-loading balances using certified reference weights. Verify all readings are within tolerance and sign the equipment calibration log.',
      due_date: fmt(today), priority: 'high', routine_interval: 'daily',
      checklist: [
        { text: 'Ensure balance is on a level, vibration-free surface', done: false },
        { text: 'Allow balance to warm up for 15 min', done: false },
        { text: 'Run internal auto-calibration (if applicable)', done: false },
        { text: 'Check with 1g reference weight — record result', done: false },
        { text: 'Check with 10g reference weight — record result', done: false },
        { text: 'Check with 100g reference weight — record result', done: false },
        { text: 'Verify all readings within ±0.01g tolerance', done: false },
        { text: 'Sign and date the balance calibration log', done: false },
      ],
    },
  ];

  const insertPayload = tasks.map(t => ({
    title: t.title,
    description: t.description,
    assigned_to: null,
    assigned_by: admin.id,
    due_date: t.due_date,
    priority: t.priority,
    status: 'open',
    approval_status: 'not_required',
    is_routine: true,
    routine_interval: t.routine_interval,
    is_personal_reminder: false,
    checklist: t.checklist,
    logged_minutes: 0,
  }));

  const { data, error } = await supabase.from('tasks').insert(insertPayload).select('id, title');
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }

  console.log('\n✅ Team Tasks created successfully:');
  data.forEach(t => console.log(`  ✓ ${t.title}`));
}

run().catch(e => { console.error(e); process.exit(1); });
