# College-Chalo: Role-Based Campus Ride-Sharing Network

> **Strict Community Separation:** Student ↔ Student | Faculty ↔ Faculty | Staff ↔ Staff

College-Chalo is a campus ride-sharing web application built with a strict role-based access control (RBAC) architecture. During registration, users must select exactly one of three verified college communities:
1. **Student**
2. **Faculty**
3. **Staff**

These three categories operate as **three completely separate ride-sharing communities** within one shared technical platform. Rides, searches, booking requests, notifications, and carpool histories never cross community boundaries.

---

## 🌟 Key Features

### 1. "Join Your College Community" Registration Flow
- **Role Selection Screen:** Clean white background with emerald green accents and rounded cards:
  - **Student Card:** *"Share affordable rides with fellow students."* → `Continue as Student`
  - **Faculty Card:** *"Coordinate your commute with fellow faculty members."* → `Continue as Faculty`
  - **College Staff Card:** *"Share your daily commute with fellow college staff members."* → `Continue as Staff`
- **Separate Registration Forms:** Role-tailored fields:
  - **Student:** Full Name, University Email (`@student.university.edu`), Password, University Name, Student ID / UID, Profile Photo.
  - **Faculty:** Full Name, Official Faculty Email (`@faculty.university.edu`), Password, University Name, Faculty / Employee ID, Profile Photo.
  - **Staff:** Full Name, Official Staff Email (`@admin.university.edu`), Password, University Name, Staff / Employee ID, Profile Photo.
- **Verification Rule:** Verification process backed by authorized college ID check. Direct category changes are prohibited.

### 2. Strict Ride-Sharing Rules (Backend & Database Enforced)
- **Student Community:** Students can search, request, and offer rides to students only. Faculty and staff rides never appear.
- **Faculty Community:** Faculty members can search, request, and offer rides to faculty only. Students and staff rides never appear.
- **Staff Community:** Staff members can search, request, and offer rides to staff only. Students and faculty rides never appear.
- **Cross-Community Booking Rejection:** Any cross-category booking attempt is intercepted at the database and API levels, rejecting with the required error:
  > **`"This ride is available only to members of your own college community."`**

### 3. Dedicated Role-Aware Home Screens
- **Student Home:** "Welcome to Your Student Community", Find a Student Ride, Offer a Student Ride, Upcoming Student Rides, Student Booking Requests, Student Safety Information & 24/7 SOS Guidelines.
- **Faculty Home:** "Welcome to Your Faculty Community", Find a Faculty Ride, Offer a Faculty Ride, Upcoming Faculty Rides, Academic Senate & Lecture Schedule Sync, Reserved Faculty Carpool Parking.
- **Staff Home:** "Welcome to Your Staff Community", Find a Staff Ride, Offer a Staff Ride, Upcoming Staff Rides, Biometric Shift Timings & Campus Facilities Transit.

### 4. Fully Responsive Native-Like Experience
- **Fluid Layouts:** Adapts dynamically to Desktop (1080p/1440p), Tablets (iPad portrait & landscape), and Mobile Smartphones (iPhone, Android).
- **Mobile Bottom Navigation Bar:** High-performance bottom navigation with quick-access tabs (`Home`, `Join`, `Offer`, `Tests`, `Profile`).
- **Touch-Optimized:** 44px+ touch targets, smooth micro-animations, glassmorphism headers, and zero horizontal overflow.

---

## 🔒 Security, Database & Supabase RLS

The community separation is enforced at multiple independent layers:

1. **Supabase PostgreSQL Schema & RLS:** [`supabase/schema_and_rls.sql`](file:///c:/Users/Shreyansh%20gaur/OneDrive/Documents/College%20-%20chalo/supabase/schema_and_rls.sql)
   - `community_role_type` enum (`'student'`, `'faculty'`, `'staff'`).
   - Row Level Security (RLS) on `profiles`, `rides`, `bookings`, `notifications`.
   - `trg_prevent_profile_role_tampering`: Blocks users from changing `community_role`.
   - `trg_enforce_ride_community_role`: Verifies that ride's category matches driver's verified role.
   - `trg_validate_booking_community_rule`: Blocks cross-community bookings with the required error.
2. **SQLite Database Layer & Triggers:** [`backend/database.py`](file:///c:/Users/Shreyansh%20gaur/OneDrive/Documents/College%20-%20chalo/backend/database.py)
   - Mirror database triggers for local runtime execution (`trg_prevent_role_update`, `trg_enforce_ride_role_match`, `trg_prevent_cross_community_booking`).
3. **REST API Middleware:** [`backend/app.py`](file:///c:/Users/Shreyansh%20gaur/OneDrive/Documents/College%20-%20chalo/backend/app.py)
   - Cryptographically signed bearer tokens (`backend/auth.py`).
   - Server-side role validation before querying or mutating state.

---

## 🧪 Mandatory 12-Scenario Test Suite (Section 9)

All 12 required scenarios from Section 9 are automated:

| # | Mandatory Scenario | Enforcement Mechanism | Result |
|---|-------------------|------------------------|--------|
| 1 | Student searches rides | Filtered: sees student rides only | **PASS** |
| 2 | Faculty searches rides | Filtered: sees faculty rides only | **PASS** |
| 3 | Staff searches rides | Filtered: sees staff rides only | **PASS** |
| 4 | Student attempts to book Faculty ride | Trigger aborted with required message | **PASS** |
| 5 | Student attempts to book Staff ride | Trigger aborted with required message | **PASS** |
| 6 | Faculty attempts to book Student ride | Trigger aborted with required message | **PASS** |
| 7 | Faculty attempts to book Staff ride | Trigger aborted with required message | **PASS** |
| 8 | Staff attempts to book Student ride | Trigger aborted with required message | **PASS** |
| 9 | Staff attempts to book Faculty ride | Trigger aborted with required message | **PASS** |
| 10 | Direct role tampering on profile | Blocked by trigger `trg_prevent_role_update` | **PASS** |
| 11 | Direct ride category manipulation | Blocked by trigger `trg_enforce_ride_role_match` | **PASS** |
| 12 | Database security policy isolation | Zero cross-community data leakage | **PASS** |

### Running the Test Suite via CLI:
```bash
python -m backend.test_scenarios
```

### Running the Interactive Test Dashboard in the Web App:
1. Open `http://127.0.0.1:5000`
2. Click the **"12-Scenario Test Suite"** tab
3. Click **"Run All 12 Security Tests"** or click the simulation buttons to test cross-community rejection live in the browser!

---

## 🚀 Getting Started

### 1. Launch the Server
```bash
python run.py
```
Server runs locally at: `http://127.0.0.1:5000`

### 2. Pre-Seeded Test Accounts
Use the top quick-switcher bar or sign in with:
- **Student:** `rohan.sharma@university.edu` / `Password123!`
- **Faculty:** `dr.arun.sharma@university.edu` / `Password123!`
- **Staff:** `rajesh.verma@university.edu` / `Password123!`
