# OxyBio App — User Manual

> **Oxygen Bioinnovations Internal Operations Platform**
> Version 1.0 · May 2026

---

## What Is This Manual?

A user manual explains **what the app does, how to use each feature, and what to do when something goes wrong** — in plain language, without assuming technical knowledge.

This manual helps you:
- Get started on the platform in minutes
- Understand every module and what it is for
- Know what actions are available to you based on your role
- Troubleshoot common issues yourself
- Know who to contact when you need extra help

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Batch Management](#3-batch-management)
4. [Bioprocess](#4-bioprocess)
5. [Inventory](#5-inventory)
6. [Lab Notebook](#6-lab-notebook)
7. [Lab Bench](#7-lab-bench)
8. [Growth Studies](#8-growth-studies)
9. [Formulations](#9-formulations)
10. [Shelf Life](#10-shelf-life)
11. [Research](#11-research)
12. [Equipment](#12-equipment)
13. [SOPs](#13-sops-standard-operating-procedures)
14. [Documents](#14-documents)
15. [Compliance](#15-compliance)
16. [CAPA](#16-capa)
17. [Tasks](#17-tasks)
18. [Calendar](#18-calendar)
19. [Messages](#19-messages)
20. [Attendance](#20-attendance)
21. [Leave](#21-leave)
22. [Mispunch](#22-mispunch)
23. [Payslips](#23-payslips)
24. [Notifications](#24-notifications)
25. [Activity Feed](#25-activity-feed)
26. [Employee Directory](#26-employee-directory)
27. [Profile](#27-profile)
28. [Admin Panel](#28-admin-panel)
29. [Global Search & AI Assistant](#29-global-search--ai-assistant)
30. [Roles & Permissions](#30-roles--permissions)
31. [Troubleshooting](#31-troubleshooting)

---

## 1. Getting Started

### Logging In

1. Open the OxyBio app in your browser.
2. Enter your company email address and password.
3. Click **Sign In**.
4. If it is your first time logging in, check your email for a verification link and click it before signing in.

### Forgot Password

1. On the login page, click **Forgot password?**
2. Enter your email address and submit.
3. Check your inbox for a reset link (check your spam folder if it does not arrive).
4. Click the link, set a new password, and sign in.

### Navigation

The left-side navigation bar gives you access to all modules. On mobile, the navigation collapses into a bottom bar. Your available menu items depend on your role — staff members see a smaller set than admins.

### Role-Based Access

| Role | Access Level |
|------|-------------|
| Admin / CEO / CTO | Full access to all modules including the Admin Panel |
| Manager | Operational modules + team views |
| Staff / Scientist | Own records + shared lab modules |

---

## 2. Dashboard

The Dashboard is the first screen you see after logging in. It gives you a live snapshot of what is happening at Oxygen Bioinnovations today.

### Staff Dashboard shows:
- Your pending tasks
- Upcoming calendar events
- Recent batch updates relevant to your role
- Quick links to frequently used modules

### Admin Dashboard shows:
- Company-wide batch status summary
- Open tasks across all teams
- Attendance overview
- Pending leave requests
- Recent activity feed

**The greeting at the top changes by time of day** (Good Morning / Afternoon / Evening) and uses your first name from your profile.

---

## 3. Batch Management

**Path:** Batches (in the left menu)

Batches tracks every production run from raw material preparation through to quality release or rejection.

### Batch Lifecycle

Every batch moves through these stages in order:

```
Media Prep → Sterilisation → Inoculation → Fermentation
→ Straining → Extract Addition → QC Hold → Released / Rejected
```

### Viewing Batches

- The batch list shows all active batches with their current stage, SKU, and time in stage.
- Use the **Search** bar to find a batch by ID or product name.
- Click a batch card to open its detail page, which shows the full stage history and all logged data.

### Creating a New Batch

1. Click **+ New Batch** (top right).
2. Fill in: Batch ID, SKU / product, start date, volume, assigned team.
3. Click **Create**.
4. The batch starts in **Media Prep** automatically.

### Advancing a Stage

1. Open the batch.
2. Confirm the current stage is complete (all required data is logged).
3. Click **Advance Stage**.
4. Confirm in the dialog. The timestamp is recorded automatically.

### Releasing or Rejecting a Batch

Only users with QC or Admin permissions can move a batch from **QC Hold** to **Released** or **Rejected**.
- **Released** — batch passes quality checks and enters inventory.
- **Rejected** — batch fails. A reason must be entered and a CAPA may be triggered.

### SKU Color Codes

Each product SKU has a color badge for quick visual identification on the batch list (e.g., CLARITY = blue).

---

## 4. Bioprocess

**Path:** Bioprocess

Bioprocess lets you log and review detailed parameters for each fermentation or bioprocessing run — pH, temperature, dissolved oxygen, agitation speed, and more.

- Select a batch to attach readings to.
- Enter readings at defined time points.
- View charts of parameter trends over the run duration.
- Flag any out-of-specification readings for review.

---

## 5. Inventory

**Path:** Inventory

Inventory tracks raw materials, consumables, packaging, and finished goods.

### Key Actions

| Action | How |
|--------|-----|
| View stock levels | Open Inventory → see item list with current quantities |
| Add stock / receive goods | Click **+ Add Stock**, enter supplier, quantity, lot number, expiry |
| Adjust stock | Select item → **Adjust** → enter reason and new quantity |
| Search | Use the search bar to filter by item name, lot, or category |

### Low Stock Alerts

Items below their minimum threshold are highlighted in red. Admins receive a notification automatically.

---

## 6. Lab Notebook

**Path:** Lab Notebook

The Lab Notebook is your digital record of experiments, observations, and results. Each entry is timestamped and tied to your user account.

### Creating an Entry

1. Click **+ New Entry**.
2. Choose an entry type (Experiment, Observation, Protocol Run, etc.).
3. Fill in the title, date, and body. You can attach files or images.
4. Click **Save**.

### Linking to a Batch or Study

In the entry form, use the **Link To** field to attach the entry to a specific batch, growth study, or research project. This keeps all related records connected.

### Editing & Version History

Entries cannot be deleted to preserve scientific integrity. You can **edit** an entry — the previous version is saved in history and accessible via **View History** on the entry page.

---

## 7. Lab Bench

**Path:** Lab Bench

Lab Bench shows which bench spaces, instruments, and shared equipment are booked or available. Use it to reserve a bench or instrument for a specific time slot before starting work.

1. Select a date on the calendar.
2. Click an available slot on the bench you need.
3. Enter a purpose and expected duration.
4. Click **Reserve**.

Other team members will see your booking and know the bench is occupied.

---

## 8. Growth Studies

**Path:** Growth Studies

Growth Studies tracks microbial or cell growth experiments with time-series data.

- Create a new study with a name, organism, media, conditions, and start date.
- Log OD (optical density) readings or colony counts at each time point.
- View auto-generated growth curves.
- Mark a study as **Complete** when finished.

---

## 9. Formulations

**Path:** Formulations

Formulations stores the recipes and ingredient ratios for each product SKU.

- View all approved formulations.
- See ingredient quantities, units, and source materials.
- Admins can create, version, and approve new formulations.
- Archived formulations remain in history but cannot be used for new batches.

---

## 10. Shelf Life

**Path:** Shelf Life

Shelf Life manages stability testing and tracks expiry timelines for finished products.

- Create a shelf life study for a released batch.
- Define test intervals (e.g., 1 month, 3 months, 6 months, 12 months).
- Log test results at each interval.
- The app calculates and displays predicted shelf life based on logged data.

---

## 11. Research

**Path:** Research

Research is a higher-level workspace for R&D projects that span multiple experiments or batches.

- Create a research project with a title, objective, lead researcher, and timeline.
- Attach lab notebook entries, growth studies, and batches to the project.
- Track progress via the project status (Planning → Active → Under Review → Complete).
- Upload reports and reference documents.

---

## 12. Equipment

**Path:** Equipment

Equipment is the asset register for all lab instruments and machinery.

| Action | How |
|--------|-----|
| View all equipment | Open Equipment — see list with status (Operational / Under Maintenance / Out of Service) |
| Log a maintenance record | Click an item → **Add Maintenance Log** |
| Report a fault | Click **Report Issue** on the item card |
| Schedule calibration | Click **Schedule Calibration** and set the next due date |

Equipment due for calibration is highlighted automatically.

---

## 13. SOPs (Standard Operating Procedures)

**Path:** SOPs

SOPs are the official step-by-step procedures used in the lab and production floor.

- Browse SOPs by category (Lab, Production, QC, Safety, etc.).
- Click an SOP to read the full procedure.
- SOPs have version numbers — always use the **Latest Approved** version.
- You can **acknowledge** an SOP to confirm you have read it (required for compliance).
- Only admins and document owners can create or update SOPs.

---

## 14. Documents

**Path:** Documents

Documents is the general file library for reports, certificates, supplier documents, regulatory files, and other reference material.

- Browse by folder or search by file name.
- Click a file to preview or download it.
- Use **Upload** to add a new document (PDF, Excel, Word, images supported).
- Assign a document to a category and set an expiry date if relevant.

---

## 15. Compliance

**Path:** Compliance

Compliance tracks regulatory and certification requirements — what must be done, when it is due, and whether it is complete.

- View all compliance items with due dates and status (Pending / In Progress / Complete / Overdue).
- Click an item to see required actions and upload evidence.
- Overdue items are flagged in red and escalated to the Admin Dashboard.

---

## 16. CAPA

**Path:** CAPA

CAPA stands for Corrective and Preventive Action. It is used when something goes wrong (a rejected batch, a non-conformance, a customer complaint) to record what happened, why, and what is being done to fix and prevent it.

### Raising a CAPA

1. Click **+ New CAPA**.
2. Describe the non-conformance or issue.
3. Identify root cause (use the dropdowns for category guidance).
4. Assign corrective actions to team members with due dates.
5. Set preventive actions to stop recurrence.
6. Click **Submit**.

### CAPA Status

| Status | Meaning |
|--------|---------|
| Open | Raised, actions in progress |
| Under Review | Actions complete, awaiting verification |
| Closed | Verified effective, CAPA closed |

---

## 17. Tasks

**Path:** Tasks

Tasks is the shared to-do list for the team. Tasks can be personal or assigned to others.

### Creating a Task

1. Click **+ New Task**.
2. Enter title, description, priority (Low / Medium / High / Urgent), due date, and assignee.
3. Optionally link it to a batch, CAPA, or research project.
4. Click **Create**.

### Managing Tasks

- Click a task to open it and update the status: **To Do → In Progress → Done**.
- Add comments or attachments to a task for context.
- The dashboard shows your overdue and due-today tasks at a glance.

---

## 18. Calendar

**Path:** Calendar

The Calendar shows upcoming tasks, batch milestones, calibration due dates, compliance deadlines, and team events in one place.

- Switch between Month, Week, and Day views.
- Click any event to see its details.
- Click an empty slot to create a new calendar event.
- Events sync automatically when tasks or batches are updated elsewhere in the app.

---

## 19. Messages

**Path:** Messages

Messages is the internal chat system for the team.

- Start a **Direct Message** to any colleague by clicking their name.
- Start a **Group Chat** for a project or department by clicking **+ New Conversation** and adding members.
- Messages are real-time — you will see new messages appear without refreshing.
- You receive a **notification** (bell icon in the top bar) when someone sends you a message.

---

## 20. Attendance

**Path:** Attendance

Attendance records when you clock in and clock out each day.

### For Staff

- Your attendance is logged automatically when you arrive (via the punch system).
- View your own attendance history, including hours worked and any absences.

### For Admins

- View attendance for all staff.
- Filter by date range, department, or individual.
- Export attendance reports as CSV.
- Missing punches appear highlighted — use the Mispunch module to correct them.

---

## 21. Leave

**Path:** Leave

Leave lets you apply for time off and tracks your leave balance.

### Applying for Leave

1. Click **+ Apply for Leave**.
2. Select leave type (Annual, Sick, Casual, Maternity/Paternity, etc.).
3. Choose start and end dates.
4. Add a reason (required for some leave types).
5. Click **Submit**.

Your manager or admin receives a notification and approves or rejects the request. You receive a notification when a decision is made.

### Viewing Your Balance

Your remaining leave days by type are shown at the top of the Leave page.

---

## 22. Mispunch

**Path:** Mispunch

Use Mispunch when your attendance record is wrong — for example, you forgot to punch in or the system missed a punch.

1. Click **+ New Mispunch Request**.
2. Select the date.
3. Enter the correct punch-in and/or punch-out time.
4. Add a reason.
5. Submit. An admin reviews and approves the correction.

---

## 23. Payslips

**Path:** Payslips

Payslips shows your monthly salary statements.

- Click a month to view or download your payslip as a PDF.
- Payslips are uploaded by the admin each pay cycle.
- Only you can see your own payslips — they are private.

---

## 24. Notifications

**Path:** Notifications (bell icon, top bar)

Notifications alert you to important events: task assignments, leave decisions, batch stage changes, messages, and compliance reminders.

- Click the bell icon to open the notification panel.
- Click a notification to go directly to the relevant item.
- Click **Mark All Read** to clear the unread count.
- You can enable **Push Notifications** in your browser to receive alerts even when the app is not in focus — you will be prompted to allow this on first login.

---

## 25. Activity Feed

**Path:** Activity

The Activity feed is a chronological log of everything that has happened on the platform — batch updates, new tasks, completed SOPs, CAPA submissions, and more.

- Use it to see what your team has been working on.
- Filter by module (Batches, Tasks, etc.) or by date.
- Admins can see activity across the whole company; staff see activity relevant to their role.

---

## 26. Employee Directory

**Path:** Directory

The Directory lists all current employees with their role, department, and contact information.

- Search by name or department.
- Click a name to see their profile card with email and internal extension.
- You can click **Message** to start a direct message with them.

---

## 27. Profile

**Path:** Profile (your avatar, bottom of the sidebar)

Your profile stores your personal and job information.

### What You Can Update

- Profile photo
- Phone number
- Emergency contact
- Notification preferences

### What Only Admins Can Change

- Name, email, role, department, employee ID

To update restricted fields, contact your system administrator.

---

## 28. Admin Panel

**Path:** Admin (visible only to Admin / CEO / CTO roles)

The Admin Panel is the control centre for system configuration and user management.

### Key Admin Functions

| Function | Description |
|----------|-------------|
| **User Management** | Create, edit, activate, or deactivate employee accounts |
| **Role Assignment** | Change an employee's role and permissions |
| **Department Setup** | Create and manage departments |
| **Leave Approvals** | Approve or reject pending leave requests |
| **Mispunch Approvals** | Review and approve punch corrections |
| **Payslip Upload** | Upload monthly payslips for all staff |
| **Compliance Oversight** | View all open compliance items across the company |
| **CAPA Oversight** | Monitor all open CAPAs and their progress |
| **Attendance Reports** | Export full attendance data |

---

## 29. Global Search & AI Assistant

### Global Search

The **Search** icon in the top bar (magnifying glass) lets you search across the entire platform simultaneously — batches, tasks, SOPs, documents, employees, and more.

- Type at least 2 characters to see results.
- Results are grouped by module.
- Click any result to jump directly to that record.

### AI Assistant

The **AI Chatbot** (chat bubble icon) is an in-app assistant that can:

- Answer questions about SOPs and procedures.
- Help you find the right module for a task.
- Summarise batch or research data.
- Draft text for CAPA descriptions or lab notebook entries.

Click the chat icon, type your question in plain English, and the assistant responds. Conversations are private to you.

---

## 30. Roles & Permissions

The table below summarises which modules are accessible by role. Admins can view and edit everything. Staff can view and create records relevant to their work but cannot approve, delete, or manage other users.

| Module | Staff | Manager | Admin / CEO / CTO |
|--------|-------|---------|-------------------|
| Dashboard | Own view | Team view | Company view |
| Batches | View + log data | View + advance stages | Full control |
| Inventory | View + log | View + adjust | Full control |
| Lab Notebook | Own entries | Team entries | All entries |
| SOPs / Documents | View + acknowledge | View + acknowledge | Create + approve |
| Compliance / CAPA | View + contribute | View + assign | Full control |
| Tasks | Own tasks | Team tasks | All tasks |
| Attendance | Own records | Team records | All records + export |
| Leave | Own requests | Approve team | Approve all |
| Payslips | Own payslips | Own payslips | Upload all |
| Directory | View | View | View + edit |
| Admin Panel | — | — | Full access |

---

## 31. Troubleshooting

### I cannot log in

- Check you are using your company email (not a personal email).
- Make sure Caps Lock is off.
- Use **Forgot password?** to reset if needed.
- If your account is deactivated, contact your admin.

### The page is loading but nothing appears

- Wait a few seconds — the app shows a loading skeleton while data is fetching.
- Hard-refresh the page (Ctrl+Shift+R on Windows / Cmd+Shift+R on Mac).
- Check your internet connection.
- If the problem continues, try a different browser.

### I cannot see a module I expect to have access to

- Your role may not include that module. Check the Roles & Permissions table above.
- Contact your admin to confirm your role is set correctly.

### My attendance record is wrong

- Use the **Mispunch** module to submit a correction request.
- Your admin will review and approve it.

### I accidentally submitted incorrect data

- For most modules you can edit a record after submission.
- For records that cannot be edited (e.g., lab notebook entries), add a follow-up entry noting the correction.
- Contact your admin if you need a record permanently corrected.

### I am not receiving notifications

- Click the bell icon and check the **Notifications** page directly.
- Check your browser notification permissions: the browser address bar will show a notification icon — click it to allow notifications.
- If using a mobile browser, check the app's notification settings in your phone's Settings app.

### I see an error message on screen

- Note the error message and the page you were on.
- Try refreshing the page.
- If the error persists, report it to your admin with a screenshot and the steps you took.

---

## Need Help?

If this manual does not answer your question:

- **IT / Admin team** — For account issues, permission changes, and technical errors.
- **Your manager** — For process questions and task clarifications.
- **AI Assistant** — For quick answers about using the app (see Section 29).

---

*Oxygen Bioinnovations · Internal Use Only*
