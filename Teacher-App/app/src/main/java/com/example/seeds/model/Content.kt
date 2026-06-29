package com.example.seeds.model

import android.os.Parcelable
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import kotlinx.parcelize.Parcelize

@Parcelize
@JsonClass(generateAdapter = true)
data class Content(
    val id: String,
    val type: String,
    val description: String? = null,
    val language: String,
    val title: LocalizedContent?,       // JSON object
    val theme: LocalizedContent?,
    @Json(name = "audio_content") val audioContent: List<AudioContent> = emptyList(),
    @Json(name = "is_pull_model") val isPullModel: Boolean,
    @Json(name = "is_teacher_app") val isTeacherApp: Boolean,
    @Json(name = "created_by") val createdBy: String,
    val creation_time: Long,
    @Json(name = "is_deleted") val isDeleted: Boolean
) : Parcelable {
    /** Backward-compat alias — call sites that still use `._id` continue to compile. */
    val _id: String get() = id
    val titleText: String get() = title?.english ?: "Unknown Title"
    val themeText: String get() = theme?.english ?: "Unknown Theme"
}


@Parcelize
@JsonClass(generateAdapter = true)
data class LocalizedContent(
    val english: String,
    val local: String? = null,
    @Json(name = "audio_url") val audioUrl: String? = null
) : Parcelable

@Parcelize
@JsonClass(generateAdapter = true)
data class AudioContent(
    val description: String,
    @Json(name = "audio_url") val audioUrl: String
) : Parcelable
