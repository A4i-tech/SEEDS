package com.example.seeds.ui.voiceCommand

import android.os.Parcelable
import androidx.navigation.NavDirections
import com.example.seeds.R
import com.example.seeds.model.AudioContent
import com.example.seeds.model.Classroom
import com.example.seeds.model.Content
import com.example.seeds.model.LocalizedContent
import com.example.seeds.model.Student
import com.example.seeds.network.CommandResult
import com.example.seeds.network.VoiceCommand
import com.example.seeds.ui.call.CallSettingsFragmentDirections

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
    // R.id.* nav destination. null = no reachable destination; button renders label-only.
    val destinationId: Int? = null,
    val autoNavigate: Boolean = false,
    // Parcelable nav-arg for destinations that require one (Content for the player, Classroom
    // for call settings), plus its safe-args bundle key. Built from the backend result map by
    // buildContent/buildClassroom below. null = argless destination.
    val navArg: Parcelable? = null,
    val navArgKey: String? = null,
    // Pre-built multi-arg navigation (e.g. call_nav needs BOTH phoneNumbers and classroom —
    // more than the single navArg above can carry). Takes priority over destinationId/navArg
    // when set.
    val directions: NavDirections? = null
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
    var singleClassData: Map<*, *>? = null
    var confId: String? = null
    var confCreateBody: Map<*, *>? = null
    var sawClassCommand = false
    var sawStudentsCommand = false

    for (i in commands.indices) {
        val cmd = commands[i]
        val res = results.getOrNull(i)
        val path = cmd.path

        // Frontend navigation pseudo-command. Only "go home"/"go to classrooms" resolves to a
        // real Android destination today — other NAVIGATE intents (content-load-more/stop) have
        // no Android UI surface yet, so they fall through to the label-only no-op below.
        if (cmd.method == "NAVIGATE" && res.isOk()) {
            val target = (res?.data as? Map<*, *>)?.str("navigate") ?: path
            if (target.contains("/classrooms") && !target.contains("/detail/")) {
                return NavigationTarget("Go to Classrooms", destinationId = R.id.classroomFragment, autoNavigate = true)
            }
            return NavigationTarget("Go", autoNavigate = true)
        }

        if (Regex("""^/class/([^/]+)$""").containsMatchIn(path) && cmd.method == "GET" && res.isOk()) {
            val map = res?.data as? Map<*, *>
            classId = map?.str("_id")
            singleClassData = map
        }

        if (path.contains("/conference/create") && res.isOk()) {
            confId = (res?.data as? Map<*, *>)?.str("id")
            confCreateBody = cmd.body as? Map<*, *>
        }

        // Conference started -> go straight into the call (mirrors CallSettingsFragment's own
        // "Start Conference" construction: phoneNumbers from the create request, classroom from
        // the earlier GET /class/:id fetch in this same command batch).
        if (path.contains("/conference/start") && res.isOk() && classId != null) {
            val classroom = singleClassData?.let { buildClassroom(it) }
            val phones = (confCreateBody?.get("student_phones") as? List<*>)?.mapNotNull { it?.toString() }
            if (classroom != null && !phones.isNullOrEmpty()) {
                val leader = confCreateBody?.str("leader_phone")
                val directions = CallSettingsFragmentDirections
                    .actionCallSettingsFragmentToCallNav(phones.toTypedArray(), classroom)
                    .setLeader(leader)
                return NavigationTarget("Go to Conference Call", autoNavigate = true, directions = directions)
            }
            // Missing phones/classroom data — fall back to the classroom rather than a dead nav.
            return NavigationTarget("Go to Classrooms", destinationId = R.id.classroomFragment, autoNavigate = true)
        }

        // Content command -> deep-link to the player (ContentDetailsFragment autoplays from the arg)
        if (path.contains("/content") && cmd.method == "GET" && res.isOk()) {
            val single = (res?.data as? Map<*, *>)?.takeIf { it["_id"] != null }
            if (single != null) return contentTarget(single)
            val items = res?.data.asList()
            if (items.isNotEmpty() && items[0]["_id"] != null) {
                if (path.contains("expName=") || path.contains("ids=")) return contentTarget(items[0])
                // No filter = "browse the library" -> the Content tab (argless-navigable).
                return NavigationTarget("Open Content Library", destinationId = R.id.homeFragment)
            }
            return null
        }

        // New classroom created -> open its call-settings screen (Android's per-class screen)
        if (Regex("""/class/?$""").containsMatchIn(path) && cmd.method == "POST" && res.isOk()) {
            val map = res?.data as? Map<*, *>
            if (map?.str("_id") != null) {
                return classTarget("Go to ${map.str("name") ?: "new classroom"}", map)
            }
        }

        if (path.contains("/class")) sawClassCommand = true
        if (path.contains("/teacher/students")) sawStudentsCommand = true
    }

    // A standalone "open class X" (GET /class/:id, no conference-start after it) goes
    // straight to that class rather than the generic classrooms list.
    singleClassData?.let { map ->
        if (map.str("_id") != null) {
            val target = classTarget("Go to ${map.str("name") ?: "classroom"}", map)
            // Only auto-jump when a real per-class target was built, not the safe list fallback.
            return if (target.destinationId == R.id.callSettingsFragment) target.copy(autoNavigate = true) else target
        }
    }

    if (sawClassCommand || sawStudentsCommand) {
        return NavigationTarget("Go to Classrooms", destinationId = R.id.classroomFragment)
    }
    return null
}

// --- nav-arg construction: raw backend result map -> typed Parcelable model ---------------
// Built by hand (not Moshi): the app's Moshi is Kotshi-codegen-only and Content has no adapter,
// and this only needs the handful of fields the player/call-settings screens actually read.

private fun mapOfLocalized(value: Any?): LocalizedContent? {
    val m = value as? Map<*, *> ?: return null
    val english = m.str("english") ?: return null
    return LocalizedContent(english = english, local = m.str("local"), audioUrl = m.str("audioUrl"))
}

fun buildContent(map: Map<*, *>): Content? {
    val id = map.str("_id") ?: return null
    val audio = (map["audioContent"] as? List<*>).orEmpty().mapNotNull { entry ->
        val am = entry as? Map<*, *> ?: return@mapNotNull null
        val url = am.str("audioUrl") ?: return@mapNotNull null
        AudioContent(description = am.str("description") ?: "", audioUrl = url)
    }
    return Content(
        _id = id,
        type = map.str("type") ?: "",
        description = map.str("description"),
        language = map.str("language") ?: "en",
        title = mapOfLocalized(map["title"]) ?: LocalizedContent(),
        theme = mapOfLocalized(map["theme"]) ?: LocalizedContent(),
        audioContent = audio
    )
}

fun buildClassroom(map: Map<*, *>): Classroom? {
    val name = map.str("name") ?: return null
    fun students(key: String): List<Student> =
        (map[key] as? List<*>).orEmpty().mapNotNull { entry ->
            val sm = entry as? Map<*, *> ?: return@mapNotNull null
            val phone = sm.str("phoneNumber") ?: sm.str("phone") ?: return@mapNotNull null
            Student(
                phoneNumber = phone,
                name = sm.str("name") ?: "",
                isLeader = sm["isLeader"] as? Boolean ?: false,
                _id = sm.str("_id")
            )
        }
    return Classroom(
        _id = map.str("_id"),
        name = name,
        teacher = map.str("teacher") ?: "",
        students = students("students"),
        leaders = students("leaders"),
        contentIds = (map["contentIds"] as? List<*>).orEmpty().mapNotNull { it?.toString() }
    )
}

private fun contentTarget(map: Map<*, *>): NavigationTarget {
    val content = buildContent(map)
    val title = content?.title?.english ?: map.str("expName") ?: "Content"
    // Auto-navigate into the player so "play X" actually starts playing (web parity).
    return if (content != null) {
        NavigationTarget(
            "Play: $title", R.id.contentDetailsFragment,
            autoNavigate = true, navArg = content, navArgKey = "content"
        )
    } else {
        NavigationTarget("Play: $title")
    }
}

private fun classTarget(label: String, map: Map<*, *>): NavigationTarget {
    val classroom = buildClassroom(map)
    // No usable class model -> fall back to the safe classroom list rather than a dead/crashing nav.
    return if (classroom != null) {
        NavigationTarget(label, R.id.callSettingsFragment, navArg = classroom, navArgKey = "classroom")
    } else {
        NavigationTarget("Go to Classrooms", destinationId = R.id.classroomFragment)
    }
}
