# ContentWebApp — Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Routing | React Router v6 |
| HTTP | Native `fetch` (custom `apiFetch` wrapper) |
| UI | Bootstrap 5 + React-Bootstrap |
| Charts | Recharts |
| IVR Visual | ReactFlow |
| Auth storage | `localStorage` (JWT) |
| State | Local React state + custom hooks (no Redux/Zustand) |
| Build | Create React App (react-scripts 5) |
| Deployment | Docker + Nginx |

---

## Folder Structure

```
src/
├── App.js                     # Root — BrowserRouter + all routes
├── Constants.js               # SEEDS_URL, AUDIO_BASE_URL env vars
├── index.js                   # React entry point
│
├── components/
│   ├── ProtectedRoute.jsx     # Redirects to / if no token in localStorage
│   ├── PublicRoute.jsx        # Redirects to /content if already logged in
│   ├── Login.js               # POST /tenant/login
│   ├── Register.js            # POST /tenant/register
│   ├── Profile.js             # GET /tenant/me
│   ├── LogoutButton.js        # Clears localStorage token
│   ├── AddContent.js          # POST /content
│   ├── ContentDetails.js      # GET /content/:id
│   ├── ContentEdit.js         # PATCH /content/:id
│   ├── IVR.js                 # IVR builder (ReactFlow)
│   ├── ViewIVR.js             # View FSM
│   ├── BulkCallInitiator.js   # Bulk call trigger
│   ├── AddQuiz.js             # Quiz content creation
│   ├── AddRiddle.js           # Riddle content creation
│   ├── AddStory.js            # Story content creation
│   │
│   └── AllContent/            # Main dashboard (/content)
│       ├── AllContent.js      # Tab container
│       ├── Header/
│       │   ├── AppHeader.js   # Top nav bar
│       │   └── UserDropdown.js
│       ├── ContentTab/
│       │   ├── ContentTab.js
│       │   ├── ContentTable.js
│       │   └── ContentFilters.js
│       ├── AnalyticsTab/
│       │   ├── AnalyticsTab.js
│       │   ├── AnalyticsStats.js
│       │   ├── CallsByDateChart.js  # Recharts bar chart
│       │   ├── StepDepthChart.js    # Recharts distribution chart
│       │   └── DateRangeSelector.js
│       ├── IVRTab/
│       │   ├── IVRTab.js
│       │   └── IVRCard.js
│       └── RegistrationTab/
│           ├── RegistrationTab.js
│           ├── TeacherRegistrationForm.js
│           ├── TeachersList.js
│           ├── TeacherDetails.js
│           ├── AddStudentsForm.js
│           └── StudentsTable.js
│
├── hooks/
│   ├── useAuth.js             # logout, getCurrentUser, getAuthHeaders
│   ├── useContent.js          # paginated content fetch, delete, filters
│   ├── useContentFilters.js   # client-side filter logic
│   ├── useAnalytics.js        # fetchAnalytics, stats computation
│   └── useTeachers.js         # teacher list + student management
│
├── services/
│   ├── api.js                 # apiFetch wrapper + buildQueryString
│   ├── analyticsService.js    # POST /tenant/analytics
│   ├── contentService.js      # GET /content, DELETE /content/:id
│   ├── ivrService.js          # POST {ivrURL}/updateivr
│   └── teacherService.js      # teacher + student CRUD
│
└── utils/
    ├── authHelpers.js         # getAuthHeaders, isAuthenticated, clearAuth
    ├── exportHelpers.js       # CSV/Excel export utilities
    └── filterHelpers.js       # Content filter logic
```

---

## Routes

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/` | `Login` | Public | Tenant login |
| `/register` | `Register` | Public | Tenant registration |
| `/content` | `AllContent` | Protected | Main dashboard (4 tabs) |
| `/content/create` | `AddContent` | Protected | Create new content |
| `/content/detail/:type/:id` | `ContentDetails` | Protected | View content |
| `/content/edit/:type/:id` | `ContentEdit` | Protected | Edit content |
| `/ivr` | `IVR` | Protected | IVR FSM builder |
| `/viewivr` | `ViewIVR` | Protected | View IVR FSM |
| `/bulkcall` | `BulkCallInitiator` | Protected | Bulk call trigger |
| `/profile` | `Profile` | Protected | Tenant profile |

---

## Auth Flow

```
Login form
   └── POST /tenant/login
         └── { token } → localStorage.setItem("authToken", token)
               └── navigate("/content")

Every API request
   └── authHelpers.getAuthHeaders()
         └── { Authorization: "Bearer <token>", Content-Type: "application/json" }

Logout
   └── localStorage.removeItem("authToken")
         └── navigate("/")

ProtectedRoute
   └── isAuthenticated() → checks localStorage for token
         ├── true  → render component
         └── false → <Navigate to="/" />
```

---

## Data Flow

```
Component
  └── Custom Hook  (useContent / useAnalytics / useTeachers)
        └── Service  (contentService / analyticsService / teacherService)
              └── apiFetch  (services/api.js)
                    └── fetch(url, { headers, body, signal })
                          └── Backend API (SEEDS_URL = REACT_APP_API_BASE_URL)
```

---

## API Calls (current)

| Service | Method | Endpoint | Hook |
|---------|--------|----------|------|
| `analyticsService` | `POST` | `/tenant/analytics` | `useAnalytics` |
| `contentService` | `GET` | `/content?limit=50&cursor=` | `useContent` |
| `contentService` | `DELETE` | `/content/:id` | `useContent` |
| `teacherService` | `GET` | `/v1/teacher/teachers` | `useTeachers` |
| `teacherService` | `POST` | `/teacher/register` | `useTeachers` |
| `teacherService` | `POST` | `/v1/teacher/add-students` | `useTeachers` |
| `teacherService` | `DELETE` | `/v1/teacher/students` | `useTeachers` |
| `ivrService` | `POST` | `{ivrURL}/updateivr` | inline |
| `useAuth` | `GET` | `/tenant/me` | `useAuth` |

> **Note:** `teacherService` still uses old `/v1/teacher/` endpoints — these need updating to match the new API (see `backend-server/API_CHANGES.md`).

---

## AllContent Dashboard Tabs

```
/content (AllContent)
  ├── ContentTab
  │     ├── ContentFilters   (language, type, search — client-side)
  │     └── ContentTable     (paginated, lazy load on scroll)
  ├── AnalyticsTab
  │     ├── DateRangeSelector
  │     ├── AnalyticsStats   (total calls, unique users, avg duration)
  │     ├── CallsByDateChart (Recharts BarChart)
  │     └── StepDepthChart   (Recharts BarChart — key-press depth)
  ├── IVRTab
  │     └── IVRCard          (per-IVR update trigger)
  └── RegistrationTab
        ├── TeacherRegistrationForm
        ├── TeachersList + TeacherDetails
        ├── AddStudentsForm
        └── StudentsTable
```

---

## External Dependencies

| Service | Purpose |
|---------|---------|
| Azure Blob Storage | Audio file hosting (`AUDIO_BASE_URL`) |
| IVR Service (`ivrURL`) | IVR config update — separate service, not backend-server |
| Backend API (`SEEDS_URL`) | All content/auth/analytics data |

---

## State Management

No global store. Each hook owns its state slice:

| Hook | State |
|------|-------|
| `useContent` | `content[]`, `allContent[]`, `paginationInfo`, `isLoading`, `isFiltered` |
| `useAnalytics` | `analyticsData[]`, `dateRange`, `stats`, `isLoading`, `error` |
| `useTeachers` | teacher list, selected teacher, students |
| `useAuth` | `cachedTenantName` (module-level cache, not React state) |
| `useContentFilters` | active filters, filtered result |

---

## Environment Variables

```env
REACT_APP_API_BASE_URL=http://localhost:4000   # Backend server base URL
STORAGE_ACCOUNT_NAME=your_storage_account     # Azure storage account name
```
