package com.example.seeds.ui.voiceCommand

import android.os.Parcelable
import androidx.navigation.NavDirections

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
    val navArgKey: String = "",
    // Pre-built multi-arg navigation (e.g. call_nav needs BOTH phoneNumbers and classroom —
    // more than the single navArg above can carry). Takes priority over destinationId/navArg
    // when set.
    val directions: NavDirections? = null
)
