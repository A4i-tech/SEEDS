package com.example.seeds.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class Content(
    val _id: String,
    val type: String,
    val description: String? = null,
    val language: String,
    val title: LocalizedContent?,       // JSON object
    val theme: LocalizedContent?,
    val audioContent: List<AudioContent> = emptyList(),
    val isPullModel: Boolean = false,
    val isTeacherApp: Boolean = false,
    val createdBy: String = "",
    val creation_time: Long = 0L,
    val isDeleted: Boolean = false
) : Parcelable {
    val id: String get() = _id
    val titleText: String get() = title?.english ?: "Unknown Title"   
    val themeText: String get() = theme?.english ?: "Unknown Theme"
}


@Parcelize
data class LocalizedContent(
    val english: String,
    val local: String? = null,
    val audioUrl: String? = null
) : Parcelable

@Parcelize
data class AudioContent(
    val description: String,
    val audioUrl: String
) : Parcelable
