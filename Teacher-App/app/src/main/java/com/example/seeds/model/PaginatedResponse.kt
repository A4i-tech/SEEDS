package com.example.seeds.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

data class PaginatedResponse<T>(
    val data: List<T>,
    val pagination: Pagination
)

@JsonClass(generateAdapter = true)
data class Pagination(
    @Json(name = "next_cursor") val nextCursor: String?,
    @Json(name = "has_more") val hasMore: Boolean,
    val limit: Int
)
