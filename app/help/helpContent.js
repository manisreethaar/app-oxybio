// ─────────────────────────────────────────────────────────────────────────────
// OxyOS Help Centre — Content Data
// ─────────────────────────────────────────────────────────────────────────────
//
// Structure:
//   HELP_CONTENT[roleGroup] = { quickActions, sections }
//   roleGroup: 'admin' | 'fellow' | 'intern'
//
// Role mapping (from AuthContext):
//   admin  → ceo, cto, admin
//   fellow → research_fellow, scientist
//   intern → research_intern, intern
//
// To add content for a new module:
//   1. Find the relevant section in each roleGroup
//   2. Add a new article object: { id, title, content, tags }
//   3. Deploy — no DB changes needed.
// ─────────────────────────────────────────────────────────────────────────────

export const HELP_CONTENT = {

  // ── ADMIN / LEADERSHIP (CEO, CTO, Admin) ──────────────────────────────────
  admin: {
    quickActions: [
      { label: 'Manage Users', href: '/admin/users', icon: 'users' },
      { label: 'Approve Leave', href: '/admin/approvals', icon: 'calendar-check' },
      { label: 'View All Batches', href: '/batches', icon: 'flask' },
      { label: 'Compliance Dashboard', href: '/compliance', icon: 'shield-check' },
      { label: 'Attendance Reports', href: '/attendance', icon: 'clock' },
      { label: 'CAPA Overview', href: '/capa', icon: 'alert-triangle' },
    ],
    sections: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        articles: [
          {
            id: 'admin-login',
            title: 'Logging In & First Steps',
            tags: ['login', 'password', 'account', 'start'],
            content: `**Step 1 — Open the app** in your browser and enter your company email and password, then click Sign In.

**Step 2 — First-time login:** Check your email for a verification link and click it before signing in.

**Forgot your password?** Click "Forgot password?" on the login screen, enter your email, and follow the link sent to your inbox (check spam if it doesn't arrive within 2 minutes).

**As an Admin/CEO/CTO** you have full access to every module including the Admin Panel. Your dashboard shows company-wide metrics: batch status, attendance overview, open tasks, pending leave requests, and recent activity.`,
          },
          {
            id: 'admin-dashboard',
            title: 'Your Dashboard',
            tags: ['dashboard', 'overview', 'metrics', 'home'],
            content: `The **Admin Dashboard** is your command centre. It shows:

- **Batch Status Summary** — active batches by stage across all products
- **Open Tasks** — all unresolved tasks across every team member
- **Attendance Overview** — who is in today, any missing punches
- **Pending Leave Requests** — requests waiting for your approval
- **Recent Activity Feed** — a live log of everything that happened today

The greeting at the top changes by time of day (Good Morning / Afternoon / Evening) and uses your name from your profile.

**Navigation:** The left sidebar gives you access to all modules. On mobile, it collapses into a bottom bar.`,
          },
          {
            id: 'admin-navigation',
            title: 'Navigation & Module Access',
            tags: ['navigation', 'sidebar', 'menu', 'modules', 'access'],
            content: `As Admin/CEO/CTO, you see every item in the sidebar. The modules are grouped:

**Lab & Production:** Batches, Bioprocess, SCADA, Environmental Monitoring, Inventory, Lab Notebook, Lab Bench, Growth Studies, Formulations, Shelf Life, Research

**Quality & Compliance:** SOPs, Documents, Compliance, CAPA, Equipment

**Operations:** Tasks, Calendar, Messages, Shift Handover, Quick Log

**People & HR:** Attendance, Leave, Mispunch, Payslips, Directory, Profile

**Admin:** Admin Panel (user management, approvals, system settings)

Click any item to go directly to that module. Use **Global Search** (magnifying glass icon, top bar) to find anything across the entire platform instantly.`,
          },
        ],
      },
      {
        id: 'whats-new',
        title: "What's New",
        articles: [
          {
            id: 'admin-esignature',
            title: 'Electronic Signatures (21 CFR Part 11)',
            tags: ['e-signature', 'esignature', 'pin', 'sign', 'capa close', 'batch release', 'part 11'],
            content: `Key actions now require an **Electronic Signature PIN** instead of a plain confirmation click — this makes the action a legally binding, 21 CFR Part 11 compliant signature.

**Setting up your PIN:**
1. Go to **Profile** → click **Set E-Signature PIN**
2. Enter a 4–6 digit PIN and confirm it
3. Click **Set PIN** — you only need to do this once

**Where it's used:**
- **CAPA / NCR:** Closing a CAPA (Close CAPA)
- **Batches:** Releasing or Rejecting a batch from QC Hold
- **Lab Notebook:** Countersigning an entry

**Signing an action:** When you click Close, Release, Reject, or Countersign, a PIN prompt appears. Enter your PIN and click **Sign & Authorize** — the action only completes once the PIN is verified.

**Forgot your PIN?** Click "Forgot PIN? Send reset link" in the signature prompt — a reset link is emailed to you, the same as a password reset.`,
          },
          {
            id: 'admin-view-toggle',
            title: 'New View Modes — List, Grid, Kanban & Table',
            tags: ['view', 'toggle', 'kanban', 'grid', 'table', 'list', 'layout'],
            content: `**Tasks, Equipment, Inventory, Compliance, and Formulations** now have a view switcher (icon buttons, top of the page) so you can browse data the way that suits you:

- **List / Grouped** — the original layout, grouped by status or category
- **Grid** — card-based layout, good for scanning many items visually
- **Kanban** — drag-and-drop columns by status (e.g., To Do / In Progress / Done for Tasks)
- **Table** — dense spreadsheet-style rows, good for exporting or scanning many fields at once

Your chosen view is remembered per module the next time you visit.

**Research → Incubation Hub** also gained the same switcher, including a **Kanban board** for dragging cell-bank prep records between stages.`,
          },
          {
            id: 'admin-session-lock',
            title: 'Auto Session Lock (Security)',
            tags: ['session', 'timeout', 'auto logout', 'security', 'inactivity', 'lock'],
            content: `For security, you are now **automatically signed out after 30 minutes of inactivity** (no mouse movement, clicks, scrolling, or typing).

**What happens:** You'll see a toast warning that your session was locked, and you'll be returned to the login screen. Simply sign in again to continue.

**To avoid losing work:** Save forms as you go — the timer resets the moment you interact with the page, so normal active use is never interrupted.`,
          },
          {
            id: 'admin-attendance-reminders',
            title: 'Automatic Attendance Reminders',
            tags: ['attendance', 'reminder', 'checkout', 'checkin', 'notification', 'push'],
            content: `The system now sends automatic reminders so nobody forgets to punch in or out:

- **Checkout Reminder:** Everyone with an open shift (clocked in but not yet clocked out) receives a push/in-app notification at **4:00 PM** reminding them to check out.
- **Check-in reminder:** The morning check-in reminder time has also been updated — check the Notifications module for the current schedule.

Tapping either reminder takes you straight to the Attendance page. These are sent automatically — no setup required.`,
          },
          {
            id: 'admin-reason-for-change',
            title: 'Reason for Change on Signed/Locked Records',
            tags: ['reason', 'audit', 'justification', 'qc', 'locked', 'correction'],
            content: `When you edit a record that has already been signed off or locked (for example, a QC test result at QC Hold), you'll now be prompted for a **written justification** before the change is allowed.

**How it works:**
1. Make your correction as normal
2. A "Reason for Change Required" popup appears
3. Enter a justification (minimum 5 characters, e.g., "Correcting a transcription error")
4. Click **Confirm Change**

This reason is written permanently into the system audit log alongside the change — it cannot be edited or removed afterward, ensuring a full GMP-compliant audit trail.`,
          },
        ],
      },
      {
        id: 'people-hr',
        title: 'People & HR',
        articles: [
          {
            id: 'admin-user-management',
            title: 'Managing Users & Roles',
            tags: ['users', 'roles', 'admin', 'accounts', 'invite', 'deactivate'],
            content: `**Path:** Admin → Users

**Creating a new account:**
1. Click **+ Invite User**
2. Enter their full name, company email, role, and department
3. Click Send Invite — they receive a setup email automatically

**Changing a role:** Click the user's name → Edit → change the Role dropdown → Save. Role changes take effect on their next login.

**Deactivating an account:** Click the user → Toggle "Active" off. The user immediately loses access but their records are preserved.

**Role hierarchy (highest to lowest):**
CEO → CTO → Admin → Research Fellow → Scientist → Research Intern → Intern

Only CEO and Admin accounts can change roles. You cannot change the role of another CEO or CTO account.`,
          },
          {
            id: 'admin-leave',
            title: 'Approving & Managing Leave',
            tags: ['leave', 'approve', 'reject', 'annual', 'sick', 'casual'],
            content: `**Path:** Admin → Approvals → Leave  *or*  Leave (main menu)

**When someone applies for leave**, you receive a notification (bell icon). 

**To approve or reject:**
1. Go to Admin → Approvals, or open the Leave module and filter by "Pending"
2. Click the request
3. Review the dates, leave type, and remaining balance shown on screen
4. Click **Approve** or **Reject** (rejection requires a reason)
5. The employee is notified automatically

**Leave types available:** Annual, Sick, Casual, Maternity/Paternity, Compensatory Off

**Leave balances** are shown on each employee's profile and update automatically when leave is approved.`,
          },
          {
            id: 'admin-mispunch',
            title: 'Approving Mispunch Corrections',
            tags: ['mispunch', 'attendance', 'punch', 'correction', 'approve'],
            content: `**Path:** Admin → Approvals → Mispunch  *or*  Mispunch (main menu)

When a staff member submits a mispunch request (missing or incorrect punch time), you receive a notification.

**To review:**
1. Open Admin → Approvals → Mispunch
2. Click the request — you'll see the date, the submitted correct time, and the employee's reason
3. Click **Approve** to apply the correction or **Reject** with a reason

Approved corrections update the attendance record immediately and are flagged in the audit trail.`,
          },
          {
            id: 'admin-payslips',
            title: 'Uploading Monthly Payslips',
            tags: ['payslip', 'salary', 'upload', 'pdf', 'pay'],
            content: `**Path:** Payslips → Admin Upload

Each pay cycle, upload individual payslip PDFs for each employee.

1. Go to the Payslips module
2. Click **Upload Payslips**
3. Select the month/year
4. Upload one PDF per employee (named by employee code or matched by email)
5. Click **Confirm Upload**

Each employee can then only see their own payslip — they cannot see anyone else's. Payslips are permanently stored and employees can download them any time.`,
          },
          {
            id: 'admin-attendance-reports',
            title: 'Attendance Reports & Exports',
            tags: ['attendance', 'export', 'csv', 'report', 'hours', 'team'],
            content: `**Path:** Attendance

As Admin/CEO/CTO, you see attendance for the entire company, not just your own.

**Filters available:** Date range, Department, Individual employee

**Viewing a day:** Click any date to see who was in, their clock-in/out times, and total hours.

**Missing punches** are highlighted in amber — these need a Mispunch correction before they show correct hours.

**Exporting:** Click the **Export CSV** button to download a full attendance report for the selected date range and filter. The export includes: employee name, date, clock-in, clock-out, total hours, and status (Present / Absent / Half Day).`,
          },
        ],
      },
      {
        id: 'production',
        title: 'Production & Batches',
        articles: [
          {
            id: 'admin-batches',
            title: 'Batch Management & Oversight',
            tags: ['batch', 'production', 'release', 'reject', 'qc', 'sku'],
            content: `**Path:** Batches

As Admin/CEO, you have **full control** over all batches including the ability to Release or Reject batches from QC Hold (only CEO and Admin can do this — GMP hard rule).

**Batch lifecycle:**
Media Prep → Sterilisation → Inoculation → Fermentation → Straining → Extract Addition → QC Hold → Released / Rejected

**Releasing a batch:**
1. Open the batch at QC Hold stage
2. Review all stage data and QC results
3. Click **Release** → confirm. The batch moves to inventory.

**Rejecting a batch:**
1. Click **Reject** → enter the reason (required)
2. A CAPA is automatically triggered for the rejection
3. The batch is archived with the rejection reason on record

**Exporting a BMR (Batch Manufacturing Record):** Open any batch → click **Export BMR** to download the full stage-by-stage record as PDF.`,
          },
          {
            id: 'admin-formulations',
            title: 'Managing Formulations',
            tags: ['formulation', 'recipe', 'sku', 'approve', 'version'],
            content: `**Path:** Formulations

Formulations stores the approved recipes for each product SKU.

**Creating a new formulation:**
1. Click **+ New Formulation**
2. Enter product name, SKU, ingredient list with quantities and units
3. Click **Save as Draft**
4. Have a Research Fellow or Senior Scientist review it
5. Click **Approve** to activate — only approved formulations can be used for new batches

**Versioning:** When you update a formulation, the previous version is archived. Batches always reference the formulation version that was active when they were created (audit trail).

**Archiving:** Archived formulations cannot be used for new batches but remain fully searchable in history.`,
          },
          {
            id: 'admin-scada',
            title: 'SCADA — Live Sensor Monitoring',
            tags: ['scada', 'sensor', 'monitoring', 'temperature', 'ph', 'live'],
            content: `**Path:** SCADA

SCADA (Supervisory Control and Data Acquisition) provides live readings from connected lab instruments and bioreactors.

**What you see:**
- Live parameter readings: temperature, pH, dissolved oxygen, agitation
- Historical trend charts per parameter per vessel
- Alarm log — any out-of-specification readings that triggered alerts

**As Admin/CEO/CTO,** you can view SCADA data for all active vessels. Individual readings are logged automatically — no manual entry required.

**If a reading is out of specification,** the system flags it in red and may trigger a notification to the assigned scientist. Check the alarm log regularly.

**SCADA does not replace manual entry in Bioprocess** — it supplements it with real-time data for monitoring, while Bioprocess stores the official signed-off readings.`,
          },
          {
            id: 'admin-env-monitoring',
            title: 'Environmental Monitoring',
            tags: ['environment', 'monitoring', 'temperature', 'humidity', 'cleanroom'],
            content: `**Path:** Environmental Monitoring

Environmental Monitoring tracks cleanroom and lab environment conditions: temperature, humidity, particulate counts, and pressure differentials.

**Viewing readings:** The dashboard shows current values for each monitored zone with colour-coded status (green = in spec, amber = warning, red = out of spec).

**Historical data:** Select a zone and date range to view trend charts.

**Out-of-spec events** are automatically logged and flagged for review. As Admin, you may need to initiate a Compliance record or CAPA if the deviation is significant.

**Scheduled checks:** Some readings require manual logging at defined intervals (e.g., daily settle plates). These show as pending tasks for the assigned staff member.`,
          },
        ],
      },
      {
        id: 'quality-compliance',
        title: 'Quality & Compliance',
        articles: [
          {
            id: 'admin-compliance',
            title: 'Compliance Overview & Oversight',
            tags: ['compliance', 'regulatory', 'certification', 'overdue', 'evidence'],
            content: `**Path:** Compliance

Compliance tracks all regulatory and certification requirements — what needs to be done, when it's due, and whether it's complete.

**As Admin/CEO/CTO, you see all compliance items** across the company (staff only see items relevant to their role).

**Status colours:**
- 🟢 **Complete** — done and documented
- 🔵 **In Progress** — work underway
- 🟡 **Pending** — not yet started but not overdue
- 🔴 **Overdue** — past due date, immediately escalated to your dashboard

**Overdue items** appear on your Admin Dashboard as a priority alert.

**Creating a compliance item:**
1. Click **+ New Compliance Item**
2. Enter requirement name, regulatory reference, due date, responsible team
3. Click Save — assigned staff are notified

**Closing an item:** After evidence is uploaded and verified, click **Mark Complete**.`,
          },
          {
            id: 'admin-capa',
            title: 'CAPA Management',
            tags: ['capa', 'corrective', 'preventive', 'ncr', 'non-conformance', 'close'],
            content: `**Path:** CAPA

CAPA (Corrective and Preventive Action) records what went wrong, why, and what's being done to fix and prevent recurrence.

**CAPAs are triggered automatically** when a batch is rejected. They can also be raised manually.

**CAPA statuses:**
- **Open** — raised, actions assigned and in progress
- **Under Review** — all actions complete, awaiting your verification
- **Closed** — you have verified effectiveness and closed the CAPA

**As Admin/CEO/CTO, only you can close a CAPA.** This is a deliberate control — you must verify that the corrective actions actually worked before closing.

**To close a CAPA:**
1. Open the CAPA record
2. Review all assigned actions and their completion evidence
3. Click **Close CAPA** and enter your verification statement
4. The CAPA is archived with a full audit trail

**Monitoring:** Your dashboard shows all open CAPAs by age. Any CAPA open for more than 30 days without progress is highlighted in amber.`,
          },
          {
            id: 'admin-equipment',
            title: 'Equipment & Calibration',
            tags: ['equipment', 'calibration', 'maintenance', 'fault', 'asset'],
            content: `**Path:** Equipment

Equipment is the asset register for all lab instruments and machinery.

**As Admin/CEO/CTO:** You can view all equipment, add new assets, schedule calibrations, and permanently delete equipment records.

**Calibration oversight:** Equipment due for calibration is highlighted on the Equipment list and appears in your calendar. The assigned scientist is notified 7 days before due date.

**If a fault is reported:** It appears as a notification and is flagged on the equipment card. You can escalate it, assign a repair, or mark it as Out of Service until fixed.

**Adding new equipment:**
1. Click **+ Add Equipment**
2. Fill in: name, type, model, serial number, location, purchase date, calibration interval
3. Click Save — the first calibration due date is calculated automatically`,
          },
        ],
      },
      {
        id: 'operations',
        title: 'Operations & Communication',
        articles: [
          {
            id: 'admin-tasks',
            title: 'Tasks — Assigning & Monitoring',
            tags: ['tasks', 'assign', 'priority', 'due date', 'progress'],
            content: `**Path:** Tasks

As Admin/CEO/CTO, you can see and manage **all tasks** across the platform, not just your own.

**Creating and assigning a task:**
1. Click **+ New Task**
2. Enter title, description, priority (Low / Medium / High / Urgent)
3. Set a due date
4. Assign it to any team member (you can assign to anyone regardless of role)
5. Optionally link it to a batch, CAPA, or research project
6. Click **Create**

**Monitoring:** The Tasks page shows all tasks filtered by status (To Do / In Progress / Done), assignee, priority, or linked module. Your dashboard highlights overdue and due-today tasks across the whole team.

**Deleting a task:** Only Senior roles (Research Fellow+) can delete tasks. Click the task → **Delete** → confirm.`,
          },
          {
            id: 'admin-messages',
            title: 'Messages & Internal Chat',
            tags: ['messages', 'chat', 'direct', 'group', 'real-time'],
            content: `**Path:** Messages

Messages is the internal real-time chat system.

**Direct Message:** Click **+ New Conversation** → search for a colleague's name → Start Chat.

**Group Chat:** Click **+ New Conversation** → add multiple members → give the group a name → Create.

Messages are real-time — new messages appear without refreshing. You receive a notification badge on the bell icon when someone messages you.

**As Admin/CEO/CTO:** You can message anyone in the organisation. There are no restricted channels.`,
          },
          {
            id: 'admin-shift-handover',
            title: 'Shift Handover',
            tags: ['shift', 'handover', 'handoff', 'notes', 'transfer'],
            content: `**Path:** Shift Handover

Shift Handover is used to formally transfer responsibility between shifts, ensuring the incoming team is briefed on active batches, pending actions, and any issues from the outgoing shift.

**Creating a handover:**
1. Click **+ New Handover**
2. Select: outgoing shift, incoming shift, date and time
3. Fill in: active batch statuses, any deviations or incidents, pending actions, equipment status
4. Click **Submit & Notify** — the incoming shift lead is notified

**Viewing handover history:** All past handovers are searchable and permanently stored for audit purposes.

**As Admin/CEO/CTO,** you can view all handovers. Missing handovers (gap between shifts) are flagged on the compliance dashboard.`,
          },
          {
            id: 'admin-calendar',
            title: 'Calendar',
            tags: ['calendar', 'events', 'milestones', 'schedule', 'month', 'week'],
            content: `**Path:** Calendar

The Calendar aggregates all events from across the platform in one view: tasks, batch milestones, calibration due dates, compliance deadlines, and team events.

**Views:** Switch between Month, Week, and Day views using the buttons at the top right.

**Creating an event:** Click any empty slot → fill in the title, date/time, type, and optional link to a module record → Save.

**Events update automatically** when the underlying record changes (e.g., if a task due date shifts, the calendar reflects it immediately).

**As Admin/CEO/CTO,** you see everyone's events and all system-generated milestones.`,
          },
          {
            id: 'admin-notifications',
            title: 'Notifications',
            tags: ['notifications', 'alerts', 'push', 'bell', 'unread'],
            content: `**Path:** Bell icon, top bar → Notifications page

Notifications alert you to: leave requests, mispunch requests, batch stage changes, CAPA updates, compliance overdue items, task assignments, and direct messages.

**Opening:** Click the bell icon in the top bar. The badge shows unread count.

**Clicking a notification** takes you directly to the relevant record.

**Mark All Read:** Clears the unread badge.

**Push Notifications:** Allow browser notifications when prompted on first login. This lets you receive alerts even when the app is not the active tab. To re-enable if you dismissed it: click the lock icon in your browser's address bar → Notifications → Allow.

**As Admin/CEO/CTO,** you receive notifications for all approval-needed events (leave, mispunch) and system alerts (compliance overdue, CAPA escalations).`,
          },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        articles: [
          {
            id: 'admin-ts-login',
            title: "Can't Log In",
            tags: ['login', 'password', 'locked', 'error', 'access'],
            content: `**Check first:**
- Are you using your company email (not a personal email)?
- Is Caps Lock off?
- Has the account been deactivated? (Another admin can check in Admin → Users)

**Reset your password:** Click "Forgot password?" on the login page.

**Still stuck?** Contact the Master Admin (manisreethaar@gmail.com) for account-level issues.`,
          },
          {
            id: 'admin-ts-loading',
            title: 'Page Not Loading or Blank Screen',
            tags: ['loading', 'blank', 'error', 'slow', 'refresh'],
            content: `**Try these in order:**
1. Wait 5–10 seconds — the app shows a skeleton loader while fetching data. Cold starts on the server can take 3–5 seconds.
2. Hard refresh: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac)
3. Check your internet connection
4. Try a different browser (Chrome recommended)
5. Clear browser cache: Ctrl+Shift+Delete → Clear cached images and files

**If a specific page is broken:** Note the URL and any error message on screen, then report it to the development team with a screenshot.`,
          },
          {
            id: 'admin-ts-data',
            title: 'Incorrect Data or Records',
            tags: ['data', 'wrong', 'edit', 'correct', 'mistake', 'error'],
            content: `**Most records can be edited** by the user who created them or by an Admin.

**Attendance:** Use the Mispunch module to submit a correction (or approve one if an employee submitted it).

**Lab Notebook entries:** Cannot be deleted (scientific integrity). Add a follow-up entry noting the correction.

**Batch records:** Contact the system admin if a batch record needs correction — changes are logged in the audit trail.

**Payslips:** Re-upload the corrected PDF in Payslips → Admin Upload → select the same month → upload the corrected file (it replaces the previous one).

**If data is systematically wrong** (e.g., a DB migration issue), contact the development team with specifics.`,
          },
        ],
      },
    ],
  },

  // ── RESEARCH FELLOW / SCIENTIST ────────────────────────────────────────────
  fellow: {
    quickActions: [
      { label: 'View Batches', href: '/batches', icon: 'flask' },
      { label: 'Lab Notebook', href: '/lab-notebook', icon: 'book-open' },
      { label: 'Research Projects', href: '/research', icon: 'microscope' },
      { label: 'Growth Studies', href: '/growth-studies', icon: 'trending-up' },
      { label: 'Equipment', href: '/equipment', icon: 'settings' },
      { label: 'SOPs', href: '/sops', icon: 'file-text' },
    ],
    sections: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        articles: [
          {
            id: 'fellow-login',
            title: 'Logging In & Your Dashboard',
            tags: ['login', 'start', 'dashboard', 'home'],
            content: `**Logging in:** Open the OxyBio app, enter your company email and password, click Sign In. First-time users should check email for a verification link first.

**Your Dashboard** shows:
- Your pending and overdue tasks
- Upcoming calendar events (batch milestones, calibrations)
- Recent batch updates relevant to your role
- Quick links to your most-used modules

**Forgot password?** Click "Forgot password?" on the login screen and follow the emailed link.

**Navigation:** Use the left sidebar to access all modules available to your role. On mobile, the sidebar collapses into a bottom bar.`,
          },
          {
            id: 'fellow-role',
            title: 'Your Role & What You Can Do',
            tags: ['role', 'permissions', 'access', 'research fellow', 'scientist'],
            content: `As a **Research Fellow or Scientist**, you have broad access to all lab and production modules.

**You can:**
- View and log data in all batch stages (supervised entry required for interns you supervise)
- Create, edit, and countersign Lab Notebook entries
- Create and manage Growth Studies and Research Projects
- Upload and manage SOPs and Documents (Research Fellows+)
- Register and manage Equipment maintenance logs
- View and manage Inventory (Scientist+ can register new items)
- Assign tasks to yourself and to interns/research interns below you

**You cannot:**
- Release or Reject batches from QC Hold (CEO/Admin only — GMP rule)
- Approve Leave or Mispunch requests
- Access the Admin Panel
- Delete users or change roles

If you believe your access is incorrect, contact your admin.`,
          },
        ],
      },
      {
        id: 'whats-new',
        title: "What's New",
        articles: [
          {
            id: 'fellow-esignature',
            title: 'Electronic Signatures (21 CFR Part 11)',
            tags: ['e-signature', 'esignature', 'pin', 'sign', 'countersign', 'part 11'],
            content: `Countersigning a Lab Notebook entry, and other sign-off actions, now use an **Electronic Signature PIN** instead of a plain confirmation click — making the action a legally binding, 21 CFR Part 11 compliant signature.

**Setting up your PIN:**
1. Go to **Profile** → click **Set E-Signature PIN**
2. Enter a 4–6 digit PIN and confirm it
3. Click **Set PIN** — a one-time setup

**Where it's used:**
- **Lab Notebook:** Countersigning an intern's/team member's entry
- **CAPA:** Contributing actions where a signature is required

**Signing an action:** When you click Countersign (or another signature-required action), a PIN prompt appears. Enter your PIN and click **Sign & Authorize**.

**Forgot your PIN?** Click "Forgot PIN? Send reset link" in the prompt — a reset link is emailed to you.`,
          },
          {
            id: 'fellow-view-toggle',
            title: 'New View Modes — List, Grid, Kanban & Table',
            tags: ['view', 'toggle', 'kanban', 'grid', 'table', 'list', 'layout'],
            content: `**Tasks, Equipment, Inventory, Compliance, and Formulations** now have a view switcher (icon buttons, top of the page):

- **List / Grouped** — the original layout, grouped by status or category
- **Grid** — card-based layout for visually scanning many items
- **Kanban** — drag-and-drop columns by status (e.g., To Do / In Progress / Done for Tasks)
- **Table** — dense spreadsheet-style rows

Your chosen view is remembered per module.

**Research → Incubation Hub** also gained the same switcher, including a **Kanban board** for dragging cell-bank prep records between stages.`,
          },
          {
            id: 'fellow-session-lock',
            title: 'Auto Session Lock (Security)',
            tags: ['session', 'timeout', 'auto logout', 'security', 'inactivity', 'lock'],
            content: `For security, you are now **automatically signed out after 30 minutes of inactivity** (no mouse movement, clicks, scrolling, or typing).

**What happens:** A toast warning appears and you're returned to the login screen. Sign in again to continue.

**To avoid losing work:** Save entries as you go — normal active use (typing, clicking, scrolling) resets the timer and is never interrupted.`,
          },
          {
            id: 'fellow-attendance-reminders',
            title: 'Automatic Attendance Reminders',
            tags: ['attendance', 'reminder', 'checkout', 'checkin', 'notification', 'push'],
            content: `The system now sends automatic reminders:

- **Checkout Reminder:** Anyone with an open shift (clocked in, not yet out) gets a push/in-app notification at **4:00 PM** reminding them to check out.
- **Check-in reminder:** The morning check-in reminder time has also been updated.

Tapping either reminder takes you straight to the Attendance page — no setup required.`,
          },
          {
            id: 'fellow-reason-for-change',
            title: 'Reason for Change on Signed/Locked Records',
            tags: ['reason', 'audit', 'justification', 'qc', 'locked', 'correction'],
            content: `Editing a record that's already been signed off or locked (e.g., a QC test result at QC Hold) now requires a **written justification** before the change is allowed.

**How it works:**
1. Make your correction
2. A "Reason for Change Required" popup appears
3. Enter a reason (minimum 5 characters)
4. Click **Confirm Change**

The reason is written permanently into the audit log alongside the change and cannot be edited or removed afterward.`,
          },
        ],
      },
      {
        id: 'lab-science',
        title: 'Lab & Science Modules',
        articles: [
          {
            id: 'fellow-batches',
            title: 'Batch Management',
            tags: ['batch', 'stage', 'log', 'fermentation', 'media prep', 'qc'],
            content: `**Path:** Batches

Batches tracks every production run from media preparation through quality release.

**Batch lifecycle:**
Media Prep → Sterilisation → Inoculation → Fermentation → Straining → Extract Addition → QC Hold → Released / Rejected

**Logging data for a stage:**
1. Open the batch
2. Click on the current active stage
3. Fill in the required parameters (varies by stage)
4. Click **Save Entry**

**Advancing a stage** (Research Fellow+):
1. Confirm all required data is entered for the current stage
2. Click **Advance Stage**
3. Confirm in the dialog — the timestamp is recorded automatically

**Supervised entry:** When an intern logs data, they must select you (or another Senior) as the supervising scientist. Your name appears in the stage record.

**Export BMR:** Open any batch → Export BMR to download the full Batch Manufacturing Record as PDF.`,
          },
          {
            id: 'fellow-bioprocess',
            title: 'Bioprocess',
            tags: ['bioprocess', 'fermentation', 'ph', 'temperature', 'do', 'agitation', 'readings'],
            content: `**Path:** Bioprocess

Bioprocess is where you log detailed parameter readings for fermentation and bioprocessing runs.

**Logging readings:**
1. Select the batch
2. Choose the time point
3. Enter values: pH, temperature, dissolved oxygen (DO), agitation speed, air flow, and any other logged parameters
4. Click **Save**

**Charts:** After 2+ readings, trend charts appear automatically for each parameter across the run duration.

**Out-of-specification readings:** Flag any OOS reading using the ⚠️ icon. This creates a record for review and may trigger a CAPA.

**SCADA integration:** If SCADA sensors are connected to the vessel, live readings appear alongside your manual entries. Manual entries in Bioprocess are the official signed-off record.`,
          },
          {
            id: 'fellow-lab-notebook',
            title: 'Lab Notebook',
            tags: ['lab notebook', 'experiment', 'entry', 'countersign', 'version', 'history'],
            content: `**Path:** Lab Notebook

The Lab Notebook is the digital record of all experiments, observations, and results. Entries are timestamped and tied to your user account.

**Creating an entry:**
1. Click **+ New Entry**
2. Choose entry type: Experiment, Observation, Protocol Run, etc.
3. Fill in: title, date, body (rich text), optional file/image attachments
4. Click **Save**

**Linking to a batch or study:** Use the **Link To** field to attach the entry to a batch, growth study, or research project — this keeps related records connected.

**Editing:** You can edit your own entries. The previous version is saved in history. Click **View History** on any entry to see all versions.

**Entries cannot be deleted** — this preserves scientific integrity. If you made an error, add a follow-up entry noting the correction.

**Countersigning (Research Fellow+):** You can countersign entries by intern/research intern team members. Open their entry → **Countersign** → add your verification comment. This is required before finalising GMP records.`,
          },
          {
            id: 'fellow-growth-studies',
            title: 'Growth Studies',
            tags: ['growth', 'OD', 'colony', 'organism', 'media', 'curve'],
            content: `**Path:** Growth Studies

Growth Studies tracks microbial or cell growth experiments with time-series data.

**Creating a study:**
1. Click **+ New Study**
2. Enter: name, organism, media, growth conditions (temperature, agitation), start date
3. Click Create

**Logging time points:**
- Click into the study
- Click **+ Log Reading**
- Enter the time point, OD (optical density) reading or colony count, and any notes
- Click Save

**Growth curves** are auto-generated after you log 3+ readings. They update every time you add a new data point.

**Completing a study:** When finished, click **Mark Complete**. The study is archived but remains fully searchable.`,
          },
          {
            id: 'fellow-research',
            title: 'Research Projects',
            tags: ['research', 'project', 'r&d', 'objective', 'timeline', 'report'],
            content: `**Path:** Research

Research is the workspace for R&D projects spanning multiple experiments or batches.

**Creating a project:**
1. Click **+ New Project**
2. Enter: title, objective, lead researcher (you), timeline (start and target end date)
3. Click Create

**Adding records to a project:**
- Inside the project, use **+ Link Record** to attach lab notebook entries, growth studies, batches, or documents
- All linked records appear in the project's timeline view

**Project statuses:** Planning → Active → Under Review → Complete

**Uploading reports:** Click **+ Upload Report** inside the project to attach final reports, presentations, or reference documents.

**Sharing:** Research Fellows and above can see all projects. Interns see only projects they are linked to.`,
          },
          {
            id: 'fellow-shelf-life',
            title: 'Shelf Life Studies',
            tags: ['shelf life', 'stability', 'expiry', 'intervals', 'testing'],
            content: `**Path:** Shelf Life

Shelf Life manages stability testing for released batches.

**Creating a study:**
1. Go to Shelf Life → click **+ New Study**
2. Select the released batch
3. Define test intervals: e.g., T=1 month, T=3 months, T=6 months, T=12 months
4. Click Create — the app schedules reminders for each test interval

**Logging results at each interval:**
1. Open the study
2. Click the due interval
3. Enter test results (parameters defined when the study was created)
4. Click **Save**

**Predicted shelf life** is calculated and displayed based on logged degradation data. The chart updates after each interval is logged.`,
          },
          {
            id: 'fellow-formulations',
            title: 'Formulations',
            tags: ['formulation', 'recipe', 'ingredient', 'sku', 'version'],
            content: `**Path:** Formulations

Formulations stores approved recipes for each product SKU.

**Viewing:** All approved formulations are visible. Click one to see ingredients, quantities, units, and source materials.

**Creating a new formulation (Research Fellow+):**
1. Click **+ New Formulation**
2. Fill in: product name, SKU, ingredient list with quantities and units
3. Click **Save as Draft**
4. Submit to Admin/CEO for approval

**Approved formulations** are the only ones that can be used when creating new batches.

**Archived formulations** remain in history but cannot be used for new batches.`,
          },
          {
            id: 'fellow-lab-bench',
            title: 'Lab Bench Bookings',
            tags: ['lab bench', 'booking', 'reserve', 'instrument', 'slot'],
            content: `**Path:** Lab Bench

Lab Bench shows which bench spaces and instruments are booked or available.

**Reserving a bench or instrument:**
1. Select the date on the calendar
2. Click an available slot on the bench or instrument you need (green = available, red = booked)
3. Enter your purpose and expected duration
4. Click **Reserve**

Other team members see your booking immediately. You receive a reminder notification before your reserved time.

**Cancelling a booking:** Click your booking → **Cancel Reservation** → confirm.`,
          },
        ],
      },
      {
        id: 'quality-ops',
        title: 'Quality, Equipment & Operations',
        articles: [
          {
            id: 'fellow-sops',
            title: 'SOPs — Reading & Acknowledging',
            tags: ['sop', 'procedure', 'acknowledge', 'version', 'approved'],
            content: `**Path:** SOPs

SOPs are the official step-by-step procedures used in the lab and production floor.

**Finding an SOP:**
- Browse by category: Lab, Production, QC, Safety, etc.
- Or use the search bar to find by title or keyword

**Always use the Latest Approved version** — the version badge is shown on each SOP card. Older versions are archived.

**Acknowledging an SOP:** After reading, click **Acknowledge** to confirm you've read it. This is recorded for compliance purposes and may be required before performing certain tasks.

**Creating/editing an SOP (Research Fellow+):**
1. Click **+ New SOP**
2. Fill in: title, category, procedure steps (numbered), references
3. Save as Draft → submit to Admin for approval

Once approved, the SOP version number increments and it becomes the active version.`,
          },
          {
            id: 'fellow-equipment',
            title: 'Equipment & Maintenance Logs',
            tags: ['equipment', 'maintenance', 'calibration', 'fault', 'log'],
            content: `**Path:** Equipment

**Viewing equipment:** The list shows all assets with their status: Operational / Under Maintenance / Out of Service.

**Logging a maintenance record:**
1. Click the equipment item
2. Click **+ Add Maintenance Log**
3. Fill in: date, work performed, performed by, outcome
4. Click Save

**Reporting a fault:**
1. Click the equipment → **Report Issue**
2. Describe the fault
3. Click Submit — Admin/CEO is notified

**Calibration:** Calibration due dates are shown on each equipment card. If you perform a calibration, log it via Add Maintenance Log and set the "Calibration" type — the next due date auto-updates.

**Adding new equipment (Scientist+):**
1. Click **+ Add Equipment**
2. Fill in all details including calibration interval
3. Click Save`,
          },
          {
            id: 'fellow-inventory',
            title: 'Inventory',
            tags: ['inventory', 'stock', 'materials', 'consumables', 'lot', 'expiry'],
            content: `**Path:** Inventory

Inventory tracks raw materials, consumables, packaging, and finished goods.

**Viewing stock:** The list shows all items with current quantities. Items below their minimum threshold are highlighted in red.

**Adding stock / receiving goods:**
1. Click **+ Add Stock**
2. Enter: item, supplier, quantity, lot number, expiry date
3. Click Save

**Adjusting stock:**
1. Select the item → **Adjust**
2. Enter the reason and the corrected quantity
3. Click Save

**Registering a new item (Scientist+):**
1. Click **+ New Item**
2. Fill in: name, category, unit of measure, minimum stock threshold, supplier info
3. Click Create

**Requesting stock:** Click **Request Stock** to raise a purchase request. Admin is notified to approve and order.`,
          },
          {
            id: 'fellow-compliance',
            title: 'Compliance',
            tags: ['compliance', 'regulatory', 'evidence', 'upload', 'status'],
            content: `**Path:** Compliance

Compliance tracks all regulatory and certification requirements.

**As Research Fellow/Scientist,** you see compliance items relevant to your role and department.

**Updating an item:**
1. Click the compliance item
2. Review the required actions listed
3. Upload evidence (PDF, photo, report) using **+ Add Evidence**
4. Click **Mark In Progress** when work has started

**When all actions are complete:** Click **Submit for Review** — Admin/CEO will verify and close it.

**Overdue items** are shown in red on the compliance list. These need immediate attention — if you're unable to complete by the due date, notify your admin.`,
          },
          {
            id: 'fellow-capa',
            title: 'CAPA — Raising & Contributing',
            tags: ['capa', 'corrective', 'non-conformance', 'actions', 'root cause'],
            content: `**Path:** CAPA

CAPA records what went wrong, why, and what is being done to fix and prevent recurrence.

**Raising a CAPA manually:**
1. Click **+ New CAPA**
2. Describe the issue (non-conformance, deviation, complaint)
3. Identify root cause (use the category dropdowns for guidance)
4. Assign corrective actions to team members with due dates
5. Set preventive actions to stop recurrence
6. Click **Submit** — Admin is notified

**When assigned a corrective action:**
- You receive a task notification
- Complete the action
- Return to the CAPA record → click your action → **Mark Complete** and add evidence/notes

**Closing a CAPA is done by Admin/CEO only** after they verify all actions are effective.`,
          },
          {
            id: 'fellow-shift-handover',
            title: 'Shift Handover',
            tags: ['shift', 'handover', 'handoff', 'notes'],
            content: `**Path:** Shift Handover

Use Shift Handover to formally transfer responsibility between shifts.

**Creating a handover:**
1. Click **+ New Handover**
2. Select your outgoing shift and the incoming shift details
3. Fill in:
   - Active batch statuses and key parameters
   - Any deviations or incidents that occurred
   - Pending actions the incoming team must complete
   - Equipment status (operational / issues)
4. Click **Submit & Notify** — the incoming shift lead receives a notification

**Viewing previous handovers:** All past handovers are listed chronologically and fully searchable.`,
          },
        ],
      },
      {
        id: 'personal',
        title: 'Personal & HR',
        articles: [
          {
            id: 'fellow-tasks',
            title: 'Tasks',
            tags: ['tasks', 'todo', 'assign', 'priority', 'due date'],
            content: `**Path:** Tasks

**Creating a task:**
1. Click **+ New Task**
2. Enter title, description, priority (Low / Medium / High / Urgent), due date
3. Assign to yourself or to an intern/research intern (you can assign to anyone at or below your level)
4. Optionally link to a batch, CAPA, or research project
5. Click **Create**

**Updating status:** Open a task → change status: To Do → In Progress → Done

**Adding comments:** Open a task → type in the comments box → Send. Useful for progress updates or questions.

Your dashboard shows your overdue and due-today tasks at the top for quick access.`,
          },
          {
            id: 'fellow-attendance-leave',
            title: 'Attendance & Leave',
            tags: ['attendance', 'leave', 'apply', 'balance', 'mispunch'],
            content: `**Attendance (Path: Attendance)**
Your attendance is logged automatically when you clock in and out. View your own history, hours worked, and any missing punches.

**If a punch is missing:** Use the **Mispunch module** to submit a correction request — go to Mispunch → **+ New Mispunch Request** → select the date → enter the correct time → add a reason → Submit. Admin reviews and approves.

**Leave (Path: Leave)**
Your remaining leave days by type are shown at the top of the Leave page.

**Applying for leave:**
1. Click **+ Apply for Leave**
2. Select leave type (Annual, Sick, Casual, etc.)
3. Choose start and end dates
4. Add a reason (required for Sick and some other types)
5. Click **Submit**

Your manager or admin is notified and will approve or reject the request. You receive a notification when a decision is made.`,
          },
          {
            id: 'fellow-profile',
            title: 'Your Profile',
            tags: ['profile', 'photo', 'phone', 'emergency contact', 'notifications'],
            content: `**Path:** Profile (your avatar at the bottom of the sidebar)

**What you can update yourself:**
- Profile photo
- Phone number
- Emergency contact name and number
- Notification preferences (which events trigger notifications)

**What only Admins can change:**
- Name, email, role, department, employee ID

If any of the admin-only fields are wrong, contact your administrator.

**Payslips (Path: Payslips):** View and download your monthly payslips. Only you can see your own payslips.`,
          },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        articles: [
          {
            id: 'fellow-ts-access',
            title: "Can't See a Module or Feature",
            tags: ['access', 'missing', 'module', 'permissions', 'role'],
            content: `**If a module you expect to see is missing from the sidebar:**
- Your role may not include that module. Research Fellows and Scientists have broad access but not Admin Panel or approval functions.
- Contact your admin to confirm your role is set correctly.

**If you can see a module but a specific action (button) is missing:**
- Some actions are role-restricted (e.g., Releasing a batch is CEO/Admin only).
- Check the relevant article in this Help section to see who can perform that action.
- If you believe you should have access, contact your admin.`,
          },
          {
            id: 'fellow-ts-data',
            title: 'Incorrect Data or Entries',
            tags: ['data', 'wrong', 'edit', 'correct', 'mistake'],
            content: `**Most records can be edited** by the person who created them or by an Admin.

**Lab Notebook:** Cannot be deleted. Add a follow-up entry with a note: "Correction to entry [date]: [explanation]."

**Batch stage data:** Can be edited while the stage is active. Once a batch advances to the next stage, entries are locked. Contact Admin if a locked record needs correction.

**Inventory adjustments:** Use the Adjust function to correct a stock level. The reason field is required and is audited.

**Attendance:** Submit a Mispunch request for any incorrect punch records.`,
          },
          {
            id: 'fellow-ts-loading',
            title: 'Page Not Loading',
            tags: ['loading', 'slow', 'error', 'blank', 'refresh'],
            content: `**Try these in order:**
1. Wait 5–10 seconds (server cold starts can take this long)
2. Hard refresh: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac)
3. Check your internet connection
4. Try a different browser (Chrome recommended)

**If a specific action fails** (e.g., saving an entry gives an error):
- Note the exact error message
- Try again — it may be a temporary network issue
- If it persists, report it to your admin with a screenshot and what you were doing`,
          },
        ],
      },
    ],
  },

  // ── INTERN / RESEARCH INTERN ────────────────────────────────────────────────
  intern: {
    quickActions: [
      { label: 'My Tasks', href: '/tasks', icon: 'check-square' },
      { label: 'Lab Notebook', href: '/lab-notebook', icon: 'book-open' },
      { label: 'View Batches', href: '/batches', icon: 'flask' },
      { label: 'SOPs', href: '/sops', icon: 'file-text' },
      { label: 'My Attendance', href: '/attendance', icon: 'clock' },
      { label: 'Leave Request', href: '/leave', icon: 'calendar' },
    ],
    sections: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        articles: [
          {
            id: 'intern-login',
            title: 'Logging In for the First Time',
            tags: ['login', 'start', 'first time', 'password', 'email'],
            content: `**Step 1:** Open the OxyBio app in your browser (ask your admin for the URL if you don't have it).

**Step 2:** Enter your company email address (provided by your admin) and the temporary password.

**Step 3:** Check your email inbox for a verification link — click it before you can sign in.

**Step 4:** You will be prompted to set a new password on first login.

**Forgot your password after setup?** Click "Forgot password?" on the login screen and follow the emailed link.

**Problems logging in?** Contact your supervising Research Fellow or Admin — they can check your account status.`,
          },
          {
            id: 'intern-dashboard',
            title: 'Understanding Your Dashboard',
            tags: ['dashboard', 'home', 'tasks', 'overview'],
            content: `After logging in, you land on your **Dashboard**. It shows:

- **Your pending tasks** — things assigned to you that need action
- **Upcoming events** — calendar events relevant to you
- **Recent batch updates** — batches your team is working on
- **Quick links** — your most-used modules

The greeting at the top changes by time of day (Good Morning / Afternoon / Evening) and uses your name from your profile.

**Navigation:** The left sidebar gives you access to all your available modules. On mobile, it collapses into a bottom bar at the bottom of the screen.`,
          },
          {
            id: 'intern-role',
            title: 'What You Can Do',
            tags: ['role', 'permissions', 'access', 'intern', 'supervised'],
            content: `As an **Intern or Research Intern**, you can:

✅ View batches and log stage data (with a supervising scientist selected — required)
✅ Create your own Lab Notebook entries
✅ View and run Growth Studies (logging readings)
✅ View SOPs and Documents, and acknowledge SOPs
✅ View Inventory and log stock movements
✅ Create and update your own tasks
✅ View Equipment and log maintenance notes
✅ Apply for leave, check your attendance, submit mispunch requests
✅ Message colleagues, view notifications, use Global Search

❌ You cannot: release or reject batches, approve leave/mispunch, access the Admin Panel, upload or approve SOPs, create new inventory items, or countersign lab notebook entries.

**Supervised entry:** When you log data in a batch stage, you must select a supervising Research Fellow or Scientist from the dropdown. This person's name is recorded alongside your entry.

If you need access to something you don't have, ask your supervising scientist or admin.`,
          },
        ],
      },
      {
        id: 'whats-new',
        title: "What's New",
        articles: [
          {
            id: 'intern-esignature',
            title: 'Electronic Signatures — What the PIN Prompt Means',
            tags: ['e-signature', 'esignature', 'pin', 'sign', 'countersign', 'part 11'],
            content: `You may notice your supervising Research Fellow or Scientist is asked to enter a **PIN** when they countersign your Lab Notebook entries or approve certain records. This is a new **Electronic Signature** feature — it makes their sign-off a legally binding, 21 CFR Part 11 compliant signature.

**This does not usually apply to you** unless a future task requires you to sign something — in that case, set your own PIN in **Profile → Set E-Signature PIN** first.`,
          },
          {
            id: 'intern-view-toggle',
            title: 'New View Modes for Tasks',
            tags: ['view', 'toggle', 'kanban', 'grid', 'table', 'list', 'layout'],
            content: `**Tasks** now has a view switcher (icon buttons at the top of the page) so you can browse your to-do list the way you prefer:

- **Grouped** — the original layout, grouped by status
- **Grid** — card-based layout
- **Kanban** — drag your tasks between To Do / In Progress / Done columns
- **Table** — compact spreadsheet-style rows

Your chosen view is remembered the next time you open Tasks.`,
          },
          {
            id: 'intern-session-lock',
            title: 'Auto Session Lock (Security)',
            tags: ['session', 'timeout', 'auto logout', 'security', 'inactivity', 'lock'],
            content: `For security, you'll now be **automatically signed out after 30 minutes of inactivity** (no mouse movement, clicks, scrolling, or typing).

**What happens:** A warning message appears and you're returned to the login screen — just sign in again to continue.

**Tip:** Save your Lab Notebook entries and other work as you go. Normal active use resets the timer, so it won't interrupt you while you're working.`,
          },
          {
            id: 'intern-attendance-reminders',
            title: 'Automatic Attendance Reminders',
            tags: ['attendance', 'reminder', 'checkout', 'checkin', 'notification', 'push'],
            content: `You'll now automatically receive:

- A **Checkout Reminder** notification at **4:00 PM** if you're still clocked in and haven't checked out yet
- A morning check-in reminder (the time has recently been updated)

Tap the notification to go straight to the Attendance page. No setup is needed — these are sent automatically.`,
          },
        ],
      },
      {
        id: 'daily-work',
        title: 'Your Daily Work',
        articles: [
          {
            id: 'intern-tasks',
            title: 'Tasks — Your To-Do List',
            tags: ['tasks', 'todo', 'assigned', 'due', 'complete'],
            content: `**Path:** Tasks

Your tasks are the main way your supervisor communicates what needs to be done.

**Seeing your tasks:** Go to Tasks → your assigned tasks are listed there. Your dashboard also shows overdue and due-today tasks.

**Updating a task status:**
1. Click the task to open it
2. Change the status: **To Do → In Progress → Done**
3. Add a comment if helpful (your supervisor can see it)

**Creating a task for yourself:** Click **+ New Task** → fill in title, description, priority, due date → assign to yourself → Create.

**Priority levels:** Low → Medium → High → Urgent. High and Urgent tasks appear highlighted — don't let them sit.`,
          },
          {
            id: 'intern-lab-notebook',
            title: 'Lab Notebook — Recording Your Work',
            tags: ['lab notebook', 'experiment', 'observation', 'entry', 'record'],
            content: `**Path:** Lab Notebook

Every experiment, observation, or protocol run you do should be recorded in the Lab Notebook. This is your scientific record.

**Creating an entry:**
1. Click **+ New Entry**
2. Choose the type: Experiment, Observation, Protocol Run, or other
3. Fill in:
   - **Title:** Short, descriptive (e.g., "OD600 readings for Growth Study B3")
   - **Date:** When the work was done (not necessarily today)
   - **Body:** Full details — procedure followed, observations, results, any anomalies
4. Attach photos or files if relevant (click the attachment icon)
5. Click **Save**

**Linking your entry:** Use the **Link To** field to connect your entry to a specific batch, growth study, or research project. Always do this — it keeps related records connected.

**Important:** Entries **cannot be deleted**. If you make a mistake, add a new follow-up entry starting with "Correction to entry [date]:" and explain the correction.

After you save, your supervising Research Fellow may countersign your entry for GMP records.`,
          },
          {
            id: 'intern-batches',
            title: 'Logging Batch Data',
            tags: ['batch', 'stage', 'log', 'supervised', 'fermentation'],
            content: `**Path:** Batches

You can view all batches and log data in the active stages — but you **must select a supervising scientist** every time you log data.

**To log data for a stage:**
1. Go to Batches → click the batch you're working on
2. Click the current active stage (e.g., Fermentation)
3. Fill in the required parameters
4. In the **Supervised by** dropdown, select your supervising Research Fellow or Scientist
5. Click **Save Entry**

**You cannot:**
- Create new batches
- Advance a batch to the next stage
- Release or reject a batch from QC Hold (these require CEO/Admin)

**Reading batch data:** Click any stage to view all previously logged entries for that stage.`,
          },
          {
            id: 'intern-bioprocess',
            title: 'Bioprocess Readings',
            tags: ['bioprocess', 'readings', 'ph', 'temperature', 'fermentation'],
            content: `**Path:** Bioprocess

Bioprocess is where you log detailed readings during fermentation and bioprocessing runs.

**Logging a reading:**
1. Go to Bioprocess
2. Select the batch you're monitoring
3. Click **+ Log Reading**
4. Enter the time point and values: pH, temperature, dissolved oxygen, agitation speed, air flow, and any other parameters shown
5. Click **Save**

**If a reading is out of the expected range:**
- Flag it using the ⚠️ icon
- Notify your supervising scientist immediately — don't wait until the next check-in

**Charts** showing your logged values update automatically. You can see trends over the run duration.`,
          },
          {
            id: 'intern-growth-studies',
            title: 'Growth Studies',
            tags: ['growth', 'OD', 'optical density', 'readings', 'colony count'],
            content: `**Path:** Growth Studies

**Logging readings into an existing study:**
1. Go to Growth Studies → open the study your supervisor assigned you to
2. Click **+ Log Reading**
3. Enter the time point, OD reading (or colony count), and any observations
4. Click **Save**

Growth curves update automatically after each reading.

**Important:** Only Research Fellows and above can create new studies or mark them complete. Your role is to log the readings at the right time points as instructed.

If you're unsure of the schedule (when to log readings), check the study details or ask your supervisor.`,
          },
          {
            id: 'intern-inventory',
            title: 'Inventory — Logging Stock Movements',
            tags: ['inventory', 'stock', 'materials', 'log', 'usage'],
            content: `**Path:** Inventory

You can view all inventory items and log stock movements (receiving goods or using materials).

**Adding received stock:**
1. Click **+ Add Stock**
2. Select the item from the list
3. Enter: supplier (if applicable), quantity received, lot number, expiry date
4. Click **Save**

**Logging usage (stock deducted):**
1. Select the item → click **Adjust**
2. Enter the new quantity (lower than current) and the reason (e.g., "Used in Batch OXB-045, Fermentation stage")
3. Click **Save**

**Important:** Always log the reason accurately — this creates an audit trail.

**You cannot** register new inventory items (creating new items requires Scientist+ access). If you need an item that's not in the system, tell your supervisor.`,
          },
        ],
      },
      {
        id: 'lab-resources',
        title: 'Lab Resources',
        articles: [
          {
            id: 'intern-sops',
            title: 'Reading & Acknowledging SOPs',
            tags: ['sop', 'procedure', 'read', 'acknowledge', 'safety'],
            content: `**Path:** SOPs

SOPs (Standard Operating Procedures) are the official step-by-step procedures for all lab activities. **Always read the relevant SOP before performing any lab procedure.**

**Finding an SOP:**
- Browse by category: Lab, Production, QC, Safety, etc.
- Or search by title or keyword using the search bar

**Always use the Latest Approved version** — this is shown on the SOP card. Never use a printed copy unless it is the current version.

**Acknowledging an SOP:**
After reading, click the **Acknowledge** button. This records that you've read and understood the procedure. Some tasks require SOP acknowledgement before you can proceed.

**You cannot create or edit SOPs** — that requires Research Fellow+ access. If you spot an error in an SOP, report it to your supervisor.`,
          },
          {
            id: 'intern-equipment',
            title: 'Equipment',
            tags: ['equipment', 'instruments', 'status', 'maintenance', 'fault'],
            content: `**Path:** Equipment

**Checking equipment status before use:**
- Go to Equipment → find the instrument you need
- Status shows: Operational (green) / Under Maintenance (amber) / Out of Service (red)
- Do not use equipment that is Under Maintenance or Out of Service — notify your supervisor

**Logging a maintenance note:**
1. Click the equipment item → **+ Add Maintenance Log**
2. Describe what you observed or did (e.g., "Cleaned after use", "Noticed calibration drift in pH meter")
3. Click Save

**Reporting a fault:**
1. Click the equipment → **Report Issue**
2. Describe the fault clearly
3. Click Submit — your supervisor and admin are notified automatically

**You cannot** add new equipment or schedule calibrations — those require Scientist+ access.`,
          },
          {
            id: 'intern-documents',
            title: 'Documents',
            tags: ['documents', 'files', 'reports', 'download', 'reference'],
            content: `**Path:** Documents

Documents is the general file library — reference materials, certificates, supplier documents, reports.

**Browsing:** Navigate by folder or use the search bar to find files by name.

**Downloading:** Click any file to preview it. Click **Download** to save it to your device.

**You cannot upload documents** — that requires Research Fellow+ access. If you need a document added, ask your supervisor to upload it.`,
          },
          {
            id: 'intern-lab-bench',
            title: 'Lab Bench Bookings',
            tags: ['lab bench', 'booking', 'reserve', 'slot', 'available'],
            content: `**Path:** Lab Bench

Before using a bench or instrument, check whether it's already booked.

**Checking availability:**
- Select the date on the calendar
- Green slots = available, Red slots = booked by someone else

**Reserving a slot:**
1. Click an available slot on the bench or instrument you need
2. Enter your purpose (e.g., "Colony counts for Growth Study B3") and expected duration
3. Click **Reserve**

Other team members will see your booking and know not to use that bench during your time.

**Cancelling:** Click your own booking → **Cancel Reservation** → confirm.`,
          },
        ],
      },
      {
        id: 'personal',
        title: 'Personal & HR',
        articles: [
          {
            id: 'intern-attendance',
            title: 'Your Attendance',
            tags: ['attendance', 'punch', 'clock in', 'hours', 'history'],
            content: `**Path:** Attendance

Your attendance is recorded automatically each day when you clock in and out.

**Viewing your record:** Go to Attendance to see your daily clock-in/out times, hours worked, and any missing punches.

**If a punch is missing or wrong:** Submit a Mispunch request:
1. Go to Mispunch → click **+ New Mispunch Request**
2. Select the date
3. Enter the correct clock-in and/or clock-out time
4. Add a reason (required)
5. Click Submit

Your admin reviews and approves the correction. You'll receive a notification when it's decided.`,
          },
          {
            id: 'intern-leave',
            title: 'Applying for Leave',
            tags: ['leave', 'apply', 'balance', 'annual', 'sick', 'casual'],
            content: `**Path:** Leave

**Checking your balance:** Your remaining leave days by type are shown at the top of the Leave page.

**Applying for leave:**
1. Click **+ Apply for Leave**
2. Select leave type: Annual, Sick, Casual, Maternity/Paternity, etc.
3. Choose start and end dates (the system shows your available balance)
4. Add a reason (required for Sick leave and some other types)
5. Click **Submit**

Your admin receives a notification and will approve or reject the request. You receive a notification when the decision is made.

**Do not assume leave is approved** until you receive an approval notification.`,
          },
          {
            id: 'intern-profile',
            title: 'Your Profile',
            tags: ['profile', 'photo', 'phone', 'emergency contact'],
            content: `**Path:** Profile (your avatar at the bottom of the sidebar)

Keep your profile up to date — especially your phone number and emergency contact, which may be needed in an emergency.

**What you can update:**
- Profile photo
- Phone number
- Emergency contact name and number
- Notification preferences

**What only Admins can change:**
- Your name, email, role, department, and employee ID

If any of these are wrong, contact your admin.`,
          },
          {
            id: 'intern-messages',
            title: 'Messages',
            tags: ['messages', 'chat', 'direct', 'colleague'],
            content: `**Path:** Messages

**Starting a conversation:**
1. Click **+ New Conversation**
2. Search for a colleague by name
3. Click their name → Start Chat

Messages are real-time. You'll see new messages appear without refreshing the page.

**Notifications:** When someone messages you, a badge appears on the bell icon in the top bar. Click the bell to see recent notifications, or go directly to Messages.

Use Messages for quick questions to your supervisor or team. For formal work records (experiment notes, task updates), use the Lab Notebook or task comments.`,
          },
          {
            id: 'intern-payslips',
            title: 'Payslips',
            tags: ['payslip', 'salary', 'pdf', 'download'],
            content: `**Path:** Payslips

Your monthly payslips are uploaded by the admin each pay cycle.

**Viewing a payslip:** Go to Payslips → click the month → the payslip opens for preview or download (PDF).

Only you can see your own payslips — they are completely private.

If a payslip is missing for a completed month, contact your admin — they may not have uploaded it yet.`,
          },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        articles: [
          {
            id: 'intern-ts-login',
            title: "Can't Log In",
            tags: ['login', 'password', 'account', 'access', 'locked'],
            content: `**Check first:**
- Are you using your company email (ending in your company domain, not Gmail/Yahoo)?
- Is Caps Lock off?
- Did you click the verification link in the welcome email?

**Reset your password:** Click "Forgot password?" on the login page.

**Still can't get in?** Contact your supervising Research Fellow or Admin — they can check whether your account is active and set up correctly.`,
          },
          {
            id: 'intern-ts-supervised',
            title: "Can't Find My Supervisor in the Dropdown",
            tags: ['supervised', 'supervisor', 'dropdown', 'batch', 'log'],
            content: `When logging batch stage data, you must select a supervising scientist.

**If your supervisor doesn't appear in the dropdown:**
- They may not be logged in yet (the dropdown only shows users with Research Fellow or Scientist role)
- Their account may not have the correct role set
- Ask your supervisor to check their account with the admin

**Temporary workaround:** If your supervisor is physically present, ask them to log in and submit the entry themselves, or have them change the entry after — do not skip the supervised entry step.`,
          },
          {
            id: 'intern-ts-missing',
            title: "A Module I Need Is Missing",
            tags: ['module', 'missing', 'access', 'menu', 'sidebar'],
            content: `**If you can't see a module in the sidebar:**

Some modules are not available to Interns/Research Interns — this is by design for security and GMP compliance reasons.

Modules you do NOT have access to:
- Admin Panel
- Leave Approvals
- Mispunch Approvals
- CAPA creation (you can contribute to actions but not create CAPAs)
- Formulations management
- SOP creation/editing

**If you think a module you need is missing in error:** Ask your supervising Research Fellow — they can confirm whether you should have access, and request it from Admin if appropriate.`,
          },
          {
            id: 'intern-ts-loading',
            title: 'App Is Slow or Not Loading',
            tags: ['slow', 'loading', 'error', 'blank', 'refresh'],
            content: `**Try these steps:**
1. Wait 5–10 seconds and see if it loads (the app sometimes takes a moment on first open)
2. Hard refresh: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac)
3. Check you have a working internet connection
4. Try closing and reopening the tab

**If a specific page keeps showing an error:**
- Take a screenshot of the error message
- Note what you were trying to do
- Report it to your supervising Research Fellow or admin`,
          },
        ],
      },
    ],
  },
};

// ── Helper: get roleGroup from Auth role string ────────────────────────────
export function getRoleGroup(role) {
  if (!role) return 'intern';
  const r = role.toLowerCase();
  if (['ceo', 'cto', 'admin'].includes(r)) return 'admin';
  if (['research_fellow', 'scientist'].includes(r)) return 'fellow';
  return 'intern'; // intern, research_intern, unknown
}

// ── Helper: get display name for role group ────────────────────────────────
export function getRoleGroupLabel(roleGroup) {
  return {
    admin: 'Admin / Leadership',
    fellow: 'Research Fellow / Scientist',
    intern: 'Intern / Research Intern',
  }[roleGroup] || 'Team Member';
}
