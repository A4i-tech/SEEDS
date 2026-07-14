package com.example.seeds.ui.voiceCommand

import com.example.seeds.R
import com.example.seeds.network.CommandResult
import com.example.seeds.network.VoiceCommand

// Android port of teacher-webapp/src/utils/commandResultFormatter.js — kept 1:1 with web
// semantics (same path matches, same priority order) so both clients show the same thing.
// Pure functions: the parser logic lives here and is unit-tested (per plan Phase 5).

data class FormattedResult(
    val title: String,
    val summary: String,
    val items: List<String>,
    val isSuccess: Boolean
)

data class NavigationTarget(
    val label: String,
    // R.id.* nav destination. null = target needs a typed nav-arg (content/conference) that
    // Phase 8 wires; the button still renders from [label] so Phase 6 can show it.
    val destinationId: Int? = null,
    val autoNavigate: Boolean = false
)

private fun CommandResult?.isOk(): Boolean = this != null && error == null && status in 0 until 300

@Suppress("UNCHECKED_CAST")
private fun Any?.asList(): List<Map<*, *>> = when (this) {
    is List<*> -> this.filterIsInstance<Map<*, *>>()
    is Map<*, *> -> (this["data"] as? List<*>)?.filterIsInstance<Map<*, *>>() ?: emptyList()
    else -> emptyList()
}

private fun Map<*, *>.str(key: String): String? = this[key]?.toString()

fun formatResult(command: VoiceCommand?, result: CommandResult?): FormattedResult {
    val isSuccess = result.isOk()
    if (command == null || result == null) {
        return FormattedResult("Command", "No details available", emptyList(), false)
    }
    if (result.error != null) {
        return FormattedResult(command.description ?: "Command", result.error, emptyList(), false)
    }

    val path = command.path
    val data = result.data

    // Classroom list
    if (Regex("""/class/?$""").containsMatchIn(path) && command.method == "GET") {
        val names = data.asList().mapNotNull { it.str("name") }
        return FormattedResult("Classrooms", "Found ${names.size} classroom${if (names.size != 1) "s" else ""}", names, isSuccess)
    }

    // Students list
    if (path.contains("/teacher/students")) {
        val names = data.asList().mapNotNull { it.str("name") ?: it.str("phoneNumber") }
        return FormattedResult("Students", "Found ${names.size} student${if (names.size != 1) "s" else ""}", names, isSuccess)
    }

    // Teacher profile
    if (path.contains("/teacher/me")) {
        val map = data as? Map<*, *>
        val phone = map?.str("phoneNumber") ?: map?.str("phone")
        return FormattedResult(
            "Your Profile",
            if (!phone.isNullOrEmpty()) "Phone: $phone" else "Profile loaded",
            map?.str("name")?.let { listOf(it) } ?: emptyList(),
            isSuccess
        )
    }

    // Content list
    if (path.contains("/content") && command.method == "GET") {
        val titles = data.asList().map { item ->
            val title = item["title"] as? Map<*, *>
            title?.str("english") ?: title?.str("local") ?: item.str("expName") ?: item.str("name") ?: "Untitled"
        }
        return FormattedResult("Content", "Found ${titles.size} item${if (titles.size != 1) "s" else ""}", titles, isSuccess)
    }

    // Fallback
    return FormattedResult(
        command.description ?: "Command",
        if (result.status < 300) "Completed successfully" else "Status ${result.status}",
        emptyList(),
        isSuccess
    )
}

/**
 * Which screen to offer navigation to, from the executed commands. Mirrors the web
 * priority order: NAVIGATE > conference-start > content > new-classroom > generic class/student.
 * destinationId is set only for targets reachable without a typed nav-arg; the rest carry a
 * label (button renders) and are wired to arg-passing navigation in Phase 8.
 */
fun getNavigationTarget(commands: List<VoiceCommand>, results: List<CommandResult>): NavigationTarget? {
    if (commands.isEmpty()) return null

    var classId: String? = null
    var confId: String? = null
    var sawClassCommand = false
    var sawStudentsCommand = false

    for (i in commands.indices) {
        val cmd = commands[i]
        val res = results.getOrNull(i)
        val path = cmd.path

        // Frontend navigation pseudo-command
        if (cmd.method == "NAVIGATE" && res.isOk()) {
            return NavigationTarget("Go", autoNavigate = true)
        }

        if (Regex("""^/class/([^/]+)$""").containsMatchIn(path) && cmd.method == "GET" && res.isOk()) {
            classId = (res?.data as? Map<*, *>)?.str("_id")
        }

        if (path.contains("/call/conference/create") && res.isOk()) {
            confId = (res?.data as? Map<*, *>)?.str("id")
        }

        // Conference started -> go to the call
        if (path.contains("/call/conference/start") && res.isOk() && classId != null) {
            return NavigationTarget("Go to Conference Call", autoNavigate = true)
        }

        // Content command -> play directly (arg-carrying nav wired in Phase 8)
        if (path.contains("/content") && cmd.method == "GET" && res.isOk()) {
            val single = (res?.data as? Map<*, *>)?.takeIf { it["_id"] != null }
            if (single != null) {
                val title = (single["title"] as? Map<*, *>)?.str("english") ?: single.str("expName") ?: "Content"
                return NavigationTarget("Play: $title", autoNavigate = true)
            }
            val items = res?.data.asList()
            if (items.isNotEmpty() && items[0]["_id"] != null) {
                if (path.contains("expName=") || path.contains("ids=")) {
                    val title = (items[0]["title"] as? Map<*, *>)?.str("english") ?: items[0].str("expName") ?: "Content"
                    return NavigationTarget("Play: $title", autoNavigate = true)
                }
                return NavigationTarget("Open Content Library")
            }
            return null
        }

        // New classroom created -> offer to open it
        if (Regex("""/class/?$""").containsMatchIn(path) && cmd.method == "POST" && res.isOk()) {
            val newId = (res?.data as? Map<*, *>)?.str("_id")
            if (newId != null) {
                val name = (res?.data as? Map<*, *>)?.str("name") ?: "new classroom"
                return NavigationTarget("Go to $name", destinationId = R.id.classroomFragment)
            }
        }

        if (path.contains("/class")) sawClassCommand = true
        if (path.contains("/teacher/students")) sawStudentsCommand = true
    }

    if (sawClassCommand || sawStudentsCommand) {
        return NavigationTarget("Go to Classrooms", destinationId = R.id.classroomFragment)
    }
    return null
}
