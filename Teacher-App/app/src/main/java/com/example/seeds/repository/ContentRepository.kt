package com.example.seeds.repository

import android.content.Context
import com.example.seeds.model.Content
import com.example.seeds.model.SasUrlResponse
import com.example.seeds.model.Student
import com.example.seeds.model.StudentListContainer
import com.example.seeds.model.PaginatedResponse
import com.example.seeds.network.SeedsService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.DisposableHandle
import kotlinx.coroutines.withContext
import javax.inject.Inject

class ContentRepository @Inject constructor(
    private val network: SeedsService
) {

    companion object{
        const val CONTENT_LIMIT = 15
    }

    suspend fun getAllContent(
        limit: Int = CONTENT_LIMIT,
        cursor: String? = null
    ): PaginatedResponse<Content> {
        return withContext(Dispatchers.IO) {
            // Fetch and return the entire response object
            network.getAllContent(limit, cursor)
        }
    }

    suspend fun getContentsById(contentIds: List<String>): List<Content> {
        return withContext(Dispatchers.IO) {
            network.getContentsById(contentIds)
        }
    }

    suspend fun getContentSas(contentUrl: String): String {
        return withContext(Dispatchers.IO) {
            network.getSasUrl(contentUrl).url
        }
    }
}