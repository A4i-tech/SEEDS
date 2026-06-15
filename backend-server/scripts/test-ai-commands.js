#!/usr/bin/env node
/**
 * Seeds AI Controller — Text Command E2E Validation Script
 *
 * Tests every user-query intent via POST /meta/text-command against a live server.
 * Calls the real LLM (not mocked) — validates response structure + intent resolution.
 *
 * USAGE
 *   node scripts/test-ai-commands.js
 *
 * REQUIRED ENV VARS
 *   TEACHER_PHONE   teacher login phone number
 *   TEACHER_PASS    teacher login password
 *
 * OPTIONAL ENV VARS
 *   BASE_URL        server base URL        (default: http://localhost:4000)
 *   CLASS_ID        a real class _id from the DB — enables conference + class-context tests
 *   CLASS_NAME      name of the class above (e.g. "Grade 7") — used in natural-language tests
 *   STUDENT_NAME    a real student name in that class — used in leader + participant tests
 *   STUDENT_PHONE   that student's phone number
 *   ACTIVE_CONF_ID  an already-started conference ID — enables mute/end/add-participant tests
 *
 * OUTPUT
 *   Coloured pass/fail lines.
 *   Final summary: X/Y passed. Skipped: Z (missing env). Failed: W.
 *   Exit code 0 = all ran tests passed. Exit code 1 = at least one failure.
 */

"use strict";

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL     = process.env.BASE_URL      || "http://localhost:4000";
const PHONE        = process.env.TEACHER_PHONE;
const PASS         = process.env.TEACHER_PASS;
const CLASS_ID     = process.env.CLASS_ID      || null;
const CLASS_NAME   = process.env.CLASS_NAME    || "Grade 7";
const STUDENT_NAME = process.env.STUDENT_NAME  || null;
const STUDENT_PHONE= process.env.STUDENT_PHONE || null;
const CONF_ID      = process.env.ACTIVE_CONF_ID || null;

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
};
const pass  = (s) => `${C.green}✔ PASS${C.reset} ${s}`;
const fail  = (s) => `${C.red}✖ FAIL${C.reset} ${s}`;
const skip  = (s) => `${C.yellow}○ SKIP${C.reset} ${s}`;
const head  = (s) => `\n${C.bold}${C.cyan}── ${s} ──${C.reset}`;

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, ok: res.ok, data };
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login() {
  // Pre-baked token shortcut (generate via scripts/gen-token.js)
  if (process.env.TOKEN) {
    console.log(`${C.green}✔ Using TOKEN from env${C.reset}`);
    return process.env.TOKEN;
  }
  if (!PHONE || !PASS) {
    console.error(`${C.red}✖ Set TEACHER_PHONE+TEACHER_PASS or TOKEN.${C.reset}`);
    process.exit(1);
  }
  const res = await post("/teacher/login", { phoneNumber: PHONE, password: PASS });
  if (!res.ok || !res.data.token) {
    console.error(`${C.red}✖ Login failed (${res.status}):${C.reset}`, res.data);
    process.exit(1);
  }
  console.log(`${C.green}✔ Logged in as ${PHONE}${C.reset}`);
  return res.data.token;
}

// ── sendCommand ───────────────────────────────────────────────────────────────
async function sendCommand(token, command, context = {}) {
  return post("/meta/text-command", { command, context }, token);
}

// ── Assertions ────────────────────────────────────────────────────────────────
function assertShape(data) {
  if (!data.transcript) return "missing transcript";
  if (!data.reasoning)  return "missing reasoning";
  if (typeof data.reasoning.canAutoResolve !== "boolean") return "reasoning.canAutoResolve not boolean";
  if (!Array.isArray(data.commands)) return "commands not array";
  if (!Array.isArray(data.results))  return "results not array";
  return null;
}

function assertCanAutoResolve(data, expected) {
  if (data.reasoning.canAutoResolve !== expected)
    return `canAutoResolve=${data.reasoning.canAutoResolve}, expected ${expected}`;
  return null;
}

function assertHasCommand(data, methodPattern, pathPattern) {
  const found = data.commands.some(
    (c) =>
      (!methodPattern || c.method === methodPattern) &&
      (!pathPattern   || (typeof pathPattern === "string" ? c.path.includes(pathPattern) : pathPattern.test(c.path)))
  );
  if (!found)
    return `no command matching method=${methodPattern} path=${pathPattern} in [${data.commands.map((c) => `${c.method} ${c.path}`).join(", ")}]`;
  return null;
}

function assertConferenceCreateBody(data, { expectLeaderPhone }) {
  const createCmd = data.commands.find((c) => c.method === "POST" && c.path.includes("/call/conference/create"));
  if (!createCmd) return "no POST /call/conference/create command found";
  if (expectLeaderPhone === true  && !createCmd.body?.leader_phone)
    return `leader_phone missing from conference create body: ${JSON.stringify(createCmd.body)}`;
  if (expectLeaderPhone === false && createCmd.body?.leader_phone)
    return `unexpected leader_phone in conference create body: ${createCmd.body.leader_phone}`;
  return null;
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;

async function run(label, { needs, command, context, validate }) {
  // Check prerequisite env vars
  if (needs) {
    const missing = needs.filter((n) => !({
      CLASS_ID, STUDENT_NAME, STUDENT_PHONE, CONF_ID,
    })[n]);
    if (missing.length) {
      console.log(skip(`${label} ${C.grey}(needs: ${missing.join(", ")})`));
      skipped++;
      return;
    }
  }

  let errs = [];
  try {
    const res = await sendCommand(token, command, context || {});

    if (!res.ok) {
      errs.push(`HTTP ${res.status}: ${res.data?.error || JSON.stringify(res.data)}`);
    } else {
      const shapeErr = assertShape(res.data);
      if (shapeErr) errs.push(shapeErr);
      else errs.push(...validate(res.data).filter(Boolean));
    }
  } catch (e) {
    errs.push(`fetch error: ${e.message}`);
  }

  if (errs.length === 0) {
    console.log(pass(label));
    passed++;
  } else {
    console.log(fail(label));
    errs.forEach((e) => console.log(`  ${C.grey}→ ${e}${C.reset}`));
    failed++;
  }
}

// ── No-auth checks (no token needed) ─────────────────────────────────────────
async function runAuthChecks() {
  console.log(head("Auth"));

  // No token
  {
    const res = await post("/meta/text-command", { command: "hello" });
    const ok = res.status === 401;
    console.log(ok ? pass("Reject request with no auth token (401)") : fail(`Expected 401, got ${res.status}`));
    ok ? passed++ : failed++;
  }

  // Invalid token
  {
    const res = await post("/meta/text-command", { command: "hello" }, "badtoken");
    const ok = res.status === 401 || res.status === 403;
    console.log(ok ? pass("Reject request with invalid token (401/403)") : fail(`Expected 401/403, got ${res.status}`));
    ok ? passed++ : failed++;
  }

  // Missing command field
  {
    const res = await post("/meta/text-command", {}, token);
    const ok = res.status === 400;
    console.log(ok ? pass("Reject request with missing command field (400)") : fail(`Expected 400, got ${res.status}`));
    ok ? passed++ : failed++;
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────
const TESTS = [

  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    group: "Navigation",
    label: "Navigate home — 'take me to my classrooms'",
    command: "take me to my classrooms",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "NAVIGATE", "/classrooms"),
    ],
  },
  {
    group: "Navigation",
    label: "Navigate home — 'go back'",
    command: "go back",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "NAVIGATE", "/classrooms"),
    ],
  },
  {
    group: "Navigation",
    label: "Navigate home — 'main screen'",
    command: "show me the main screen",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "NAVIGATE", "/classrooms"),
    ],
  },
  {
    group: "Navigation",
    label: "Navigate to specific class by name",
    needs: ["CLASS_ID"],
    command: `go to ${CLASS_NAME}`,
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "NAVIGATE", CLASS_ID),
    ],
  },

  // ── Help / Capabilities ────────────────────────────────────────────────────
  {
    group: "Help",
    label: "Help — 'what can you do'",
    command: "what can you do?",
    validate: (d) => [
      assertCanAutoResolve(d, false),
      d.reasoning.unresolvedNote ? null : "unresolvedNote missing for help query",
    ],
  },
  {
    group: "Help",
    label: "Help — 'how do I use you'",
    command: "how do I use you?",
    validate: (d) => [
      assertCanAutoResolve(d, false),
    ],
  },

  // ── Classrooms ─────────────────────────────────────────────────────────────
  {
    group: "Classrooms",
    label: "Show all classrooms",
    command: "show me all my classrooms",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/class/"),
    ],
  },
  {
    group: "Classrooms",
    label: "Create classroom",
    command: "create a new classroom called Test Class",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/class/"),
    ],
  },
  {
    group: "Classrooms",
    label: "Add existing student to class — rejects new student creation",
    command: "add a new student called John Smith to Grade 7",
    validate: (d) => [
      // Should refuse (no student create route) — canAutoResolve=false OR error in commands
      d.reasoning.canAutoResolve === false ||
      (d.commands.length === 0 && d.error)
        ? null
        : "expected refusal for new student creation but got commands",
    ],
  },
  {
    group: "Classrooms",
    label: "Add existing student to class (by name)",
    needs: ["CLASS_ID", "STUDENT_PHONE"],
    command: `add ${STUDENT_NAME} to ${CLASS_NAME}`,
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/class/"),
    ],
  },
  {
    group: "Classrooms",
    label: "Delete a named classroom",
    needs: ["CLASS_ID"],
    command: `delete ${CLASS_NAME}`,
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "DELETE", "/class/"),
    ],
  },

  // ── Conference — start ─────────────────────────────────────────────────────
  {
    group: "Conference",
    label: "Start conference — no class context, no class named → ask for class",
    command: "start a call",
    context: { currentClassId: "none", activeConferenceId: "none" },
    validate: (d) => [
      assertCanAutoResolve(d, false),
      d.reasoning.unresolvedNote ? null : "unresolvedNote missing — should ask which class",
    ],
  },
  {
    group: "Conference",
    label: "Start conference — current class context set",
    needs: ["CLASS_ID"],
    command: "start a call",
    context: { currentClassId: CLASS_ID, activeConferenceId: "none" },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/call/conference/create"),
      assertHasCommand(d, "POST", "/call/conference/start"),
      assertConferenceCreateBody(d, { expectLeaderPhone: false }),
    ],
  },
  {
    group: "Conference",
    label: "Start conference — named class, no leader",
    needs: ["CLASS_ID"],
    command: `start a call for ${CLASS_NAME}`,
    context: { activeConferenceId: "none" },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/call/conference/create"),
      assertHasCommand(d, "POST", "/call/conference/start"),
      assertConferenceCreateBody(d, { expectLeaderPhone: false }),
    ],
  },
  {
    group: "Conference",
    label: "Start conference — named class, with leader",
    needs: ["CLASS_ID", "STUDENT_NAME", "STUDENT_PHONE"],
    command: `start a call for ${CLASS_NAME} with ${STUDENT_NAME} as leader`,
    context: { activeConferenceId: "none" },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/call/conference/create"),
      assertConferenceCreateBody(d, { expectLeaderPhone: true }),
    ],
  },
  {
    group: "Conference",
    label: "Start conference — fuzzy student name in leader position",
    needs: ["CLASS_ID", "STUDENT_NAME"],
    command: STUDENT_NAME ? `start a call for ${CLASS_NAME} and make ${STUDENT_NAME.split("")[0]}${STUDENT_NAME.slice(1).toLowerCase().replace("a","e")} the leader` : "unused",
    context: { activeConferenceId: "none" },
    validate: (d) => [
      // Should fuzzy-match the student name and still produce leader_phone
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/call/conference/create"),
    ],
  },

  // ── Conference — control ───────────────────────────────────────────────────
  {
    group: "Conference",
    label: "End conference — active conference exists",
    needs: ["CONF_ID"],
    command: "end the call",
    context: { activeConferenceId: CONF_ID },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "PUT", "/call/conference/end"),
    ],
  },
  {
    group: "Conference",
    label: "End conference — no active conference → graceful refusal",
    command: "end the call",
    context: { activeConferenceId: "none" },
    validate: (d) => [
      assertCanAutoResolve(d, false),
      d.reasoning.unresolvedNote ? null : "unresolvedNote missing — should explain no active conference",
    ],
  },
  {
    group: "Conference",
    label: "Mute all",
    needs: ["CONF_ID"],
    command: "mute everyone",
    context: { activeConferenceId: CONF_ID },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "PUT", "/call/conference/muteall"),
    ],
  },
  {
    group: "Conference",
    label: "Unmute all",
    needs: ["CONF_ID"],
    command: "unmute everyone",
    context: { activeConferenceId: CONF_ID },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "PUT", "/call/conference/unmuteall"),
    ],
  },
  {
    group: "Conference",
    label: "Start conference then mute — chained commands",
    needs: ["CLASS_ID"],
    command: `start a call for ${CLASS_NAME} and mute everyone`,
    context: { activeConferenceId: "none" },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/call/conference/create"),
      assertHasCommand(d, "POST", "/call/conference/start"),
      assertHasCommand(d, "PUT", "/call/conference/muteall"),
    ],
  },
  {
    group: "Conference",
    label: "Add participant",
    needs: ["CONF_ID", "STUDENT_PHONE", "STUDENT_NAME"],
    command: `add ${STUDENT_NAME} to the call`,
    context: { activeConferenceId: CONF_ID },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "PUT", "/call/conference/addparticipant"),
    ],
  },
  {
    group: "Conference",
    label: "Remove participant",
    needs: ["CONF_ID", "STUDENT_PHONE", "STUDENT_NAME"],
    command: `remove ${STUDENT_NAME} from the call`,
    context: { activeConferenceId: CONF_ID },
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "PUT", "/call/conference/removeparticipant"),
    ],
  },

  // ── Content ────────────────────────────────────────────────────────────────
  {
    group: "Content",
    label: "Play content by name",
    command: "play a keats poem",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/content"),
    ],
  },
  {
    group: "Content",
    label: "Find content by name",
    command: "find stories about animals",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/content"),
    ],
  },
  {
    group: "Content",
    label: "Show content themes",
    command: "what content themes do you have?",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/content/themes"),
    ],
  },
  {
    group: "Content",
    label: "Content command must NOT trigger conference create",
    command: "play the keats poem",
    validate: (d) => [
      d.commands.some((c) => c.path.includes("/call/conference/create"))
        ? "conference create command found for a content query — wrong intent"
        : null,
    ],
  },

  // ── Teacher Profile ────────────────────────────────────────────────────────
  {
    group: "Profile",
    label: "Show teacher profile",
    command: "show me my profile",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/teacher/me"),
    ],
  },

  // ── Tenant ─────────────────────────────────────────────────────────────────
  {
    group: "Tenant",
    label: "List tenant names",
    command: "list all tenants",
    validate: (d) => [
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/tenant/names"),
    ],
  },

  // ── Unknown / unmappable ───────────────────────────────────────────────────
  {
    group: "Edge cases",
    label: "Unknown command — graceful unresolved response",
    command: "make me a coffee and fly to the moon",
    validate: (d) => [
      // Should not crash; should return canAutoResolve=false or an error string
      d.reasoning.canAutoResolve === false || d.error
        ? null
        : "expected unresolved for unmappable command",
    ],
  },
  {
    group: "Edge cases",
    label: "Conversational — history context reference ('it', 'that class')",
    needs: ["CLASS_ID"],
    command: "start a call for it",
    context: { currentClassId: CLASS_ID, activeConferenceId: "none" },
    validate: (d) => [
      // Should resolve to the current class in context
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "POST", "/call/conference/create"),
    ],
  },
  {
    group: "Edge cases",
    label: "Play content must not be confused with conference — 'play the Ramayan'",
    command: "play the Ramayan",
    validate: (d) => [
      d.commands.some((c) => c.path.includes("/call/conference/create"))
        ? "conference create triggered for content play command"
        : null,
      assertCanAutoResolve(d, true),
      assertHasCommand(d, "GET", "/content"),
    ],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
let token;

(async () => {
  console.log(`${C.bold}Seeds AI Text Command — E2E Validation${C.reset}`);
  console.log(`${C.grey}Server: ${BASE_URL}${C.reset}\n`);

  token = await login();

  await runAuthChecks();

  // Group tests by category
  const groups = [...new Set(TESTS.map((t) => t.group))];
  for (const group of groups) {
    console.log(head(group));
    for (const t of TESTS.filter((x) => x.group === group)) {
      await run(t.label, t);
    }
  }

  // Summary
  const total = passed + failed + skipped;
  console.log(`\n${C.bold}────────────────────────────────────${C.reset}`);
  console.log(`${C.bold}Results: ${total} tests — ${C.green}${passed} passed${C.reset}${C.bold}, ${C.red}${failed} failed${C.reset}${C.bold}, ${C.yellow}${skipped} skipped${C.reset}`);
  if (skipped > 0) {
    console.log(`${C.yellow}Set CLASS_ID, STUDENT_NAME, STUDENT_PHONE, ACTIVE_CONF_ID to run skipped tests.${C.reset}`);
  }

  process.exit(failed > 0 ? 1 : 0);
})();
