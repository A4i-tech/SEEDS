package com.example.seeds.model

import android.os.Parcelable
import com.squareup.moshi.Json
import kotlinx.parcelize.Parcelize
import se.ansman.kotshi.JsonSerializable

@JsonSerializable
@Parcelize
data class Content(
    @Json(name = "id")
    val _id: String,
    val type: String,
    val description: String? = null,
    val language: String,
    val title: LocalizedContent?,       // JSON object
    val theme: LocalizedContent?,
    @Json(name = "audio_content")
    val audioContent: List<AudioContent> = emptyList(),
    @Json(name = "is_pull_model")
    val isPullModel: Boolean = false,
    @Json(name = "is_teacher_app")
    val isTeacherApp: Boolean = false,
    @Json(name = "created_by")
    val createdBy: String = "",
    val creation_time: Long = 0L,
    @Json(name = "is_deleted")
    val isDeleted: Boolean = false
) : Parcelable {
    val id: String get() = _id
    val titleText: String get() = title?.english ?: "Unknown Title"
    val themeText: String get() = theme?.english ?: "Unknown Theme"
}


@JsonSerializable
@Parcelize
data class LocalizedContent(
    val english: String? = null,
    val local: String? = null,
    @Json(name = "audio_url")
    val audioUrl: String? = null
) : Parcelable

@JsonSerializable
@Parcelize
data class AudioContent(
    val description: String,
    @Json(name = "audio_url")
    val audioUrl: String?
) : Parcelable
