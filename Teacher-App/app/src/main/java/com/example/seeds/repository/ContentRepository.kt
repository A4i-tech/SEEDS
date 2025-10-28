package com.example.seeds.repository

// import android.content.Context
import com.example.seeds.model.Content
// import com.example.seeds.model.SasUrlResponse
// import com.example.seeds.model.Student
// import com.example.seeds.model.StudentListContainer
import com.example.seeds.model.PaginatedResponse
import com.example.seeds.network.SeedsService
// import com.example.seeds.utils.ContactUtils
import kotlinx.coroutines.Dispatchers
// import kotlinx.coroutines.DisposableHandle
import kotlinx.coroutines.withContext
import javax.inject.Inject

const val PAGE_SIZE = 100   

class ContentRepository @Inject constructor(
    private val network: SeedsService
) {
    suspend fun getAllContent(
        limit: Int = PAGE_SIZE,
        cursor: String? = null
    ): List<Content> {
        return withContext(Dispatchers.IO) {
            // Fetch paginated response
            val response: PaginatedResponse<Content> = network.getAllContent(limit, cursor)
            // Unwrap data array
            response.data
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