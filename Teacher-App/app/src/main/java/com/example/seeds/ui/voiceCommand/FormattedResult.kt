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
    val destinationId: Int? = null,
    val autoNavigate: Boolean = false,
    val navArg: Parcelable? = null,
    val navArgKey: String = "",
    val directions: NavDirections? = null
)
