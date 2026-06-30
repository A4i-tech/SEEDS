package com.example.seeds.model

data class PaginatedResponse<T>(
    val data: List<T>,
    val pagination: Pagination
)

data class Pagination(
    val nextCursor: String?,
    val hasMore: Boolean,
    val limit: Int
)
