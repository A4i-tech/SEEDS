# Student Routes — Access & Creation Policy

> Audience: backend devs, Seeds AI prompt maintainers.
> Policy: **App users (teachers, content creators) must NOT be able to create, edit, or delete students.** Only `school_admin` may mutate the student roster.

## Routes

All student routes mount at `/student` (`src/index.js`) behind `authenticateToken`.

| Method | Path | Purpose | Allowed roles |
|--------|------|---------|---------------|
| POST   | `/student/`            | Create a student (`name`, `phoneNumber`) | `school_admin` |
| PATCH  | `/student/:studentId`  | Update a student                         | `school_admin` |
| DELETE | `/student/:studentId`  | Delete a student                         | `school_admin` |
| GET    | `/student/`            | List students in the school              | `school_admin`, `teacher`, `content_creator` |

Source: `src/routes/studentRouter.js`. Role guard via `authorizeRole(...)`.

## Why phone number is required

`Student` schema (`src/models/Student.js`) makes `phoneNumber` **required + unique** per school —
it is the student's identity and is used for conference-call telephony. A student cannot be
created or resolved without one.

## Policy status: ✅ ENFORCED

Create / update / delete are restricted to `school_admin`. Teachers and content creators
receive `403` and **cannot** add students. Requirement is already met at the route layer.

## ⚠️ FLAG — misleading Seeds AI prompt

The voice/text command planner prompt (`src/services/meta.service.js`) lists two endpoints
that **do not exist** and that imply teachers can add students:

```
- POST /v1/teacher/add-students → body: {phoneNumber, students: [{name, phone_number}]}
- POST /v1/teacher/students     → body: {phoneNumber}
```

Problems:
1. No such routes are defined (teacherRouter has only login/logout/register/me/teachers/patch/delete).
   Any AI-generated call to them returns **404**.
2. Advertising "add students" to teachers contradicts the access policy above.

**Action:** remove these lines from the planning prompt so the AI never offers or attempts
student creation. Adding students to a class should only reference **existing** students
(resolved name → phone → `_id` via `resolveStudentIds` in `src/routes/classRouter.js`).

## Adding a student to a class (allowed flow)

`POST /class/` resolves the `students` array (phone strings) to existing `Student` `_id`s via
`resolveStudentIds`. Unknown phones are silently dropped (no student is created here).
So a class can only contain students an admin has already created.
