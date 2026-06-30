package com.example.seeds.builders

import com.example.seeds.model.Content
import com.example.seeds.model.LocalizedContent

object ContentTestBuilder {
    fun build(
        id: String = "content-1",
        type: String = "audio",
        language: String = "en",
        title: String = "Test Content",
        theme: String = "Test Theme",
        isPullModel: Boolean = false,
        isTeacherApp: Boolean = true,
        createdBy: String = "admin",
        creationTime: Long = 1_700_000_000_000L,
        isDeleted: Boolean = false
    ) = Content(
        _id = id,
        type = type,
        language = language,
        title = LocalizedContent(english = title),
        theme = LocalizedContent(english = theme),
        isPullModel = isPullModel,
        isTeacherApp = isTeacherApp,
        createdBy = createdBy,
        creation_time = creationTime,
        isDeleted = isDeleted
    )
}
