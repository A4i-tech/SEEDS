package com.example.seeds.repository

import com.example.seeds.builders.ContentTestBuilder
import com.example.seeds.model.Content
import com.example.seeds.model.Pagination
import com.example.seeds.model.PaginatedResponse
import com.example.seeds.model.SasUrlResponse
import com.example.seeds.network.SeedsService
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test

class ContentRepositoryTest {

    private val mockService = mockk<SeedsService>()
    private val repository = ContentRepository(mockService)

    private fun paginatedOf(vararg items: Content) = PaginatedResponse(
        data = items.toList(),
        pagination = Pagination(nextCursor = null, hasMore = false, limit = 15)
    )

    @Test
    fun `getAllContent returns paginated response`() = runTest {
        coEvery { mockService.getAllContent(any(), any()) } returns paginatedOf(ContentTestBuilder.build())

        val result = repository.getAllContent()

        assertThat(result.data).hasSize(1)
    }

    @Test
    fun `getAllContent passes cursor to service`() = runTest {
        coEvery { mockService.getAllContent(any(), "abc") } returns paginatedOf()

        repository.getAllContent(cursor = "abc")

        coVerify { mockService.getAllContent(any(), "abc") }
    }

    @Test
    fun `getAllContent with no more pages sets hasMore false`() = runTest {
        coEvery { mockService.getAllContent(any(), any()) } returns paginatedOf()

        val result = repository.getAllContent()

        assertThat(result.pagination.hasMore).isFalse()
    }

    @Test
    fun `getContentsById joins ids with comma`() = runTest {
        val content = ContentTestBuilder.build()
        coEvery { mockService.getContentsById("id1,id2") } returns listOf(content)

        val result = repository.getContentsById(listOf("id1", "id2"))

        assertThat(result).hasSize(1)
        coVerify { mockService.getContentsById("id1,id2") }
    }

    @Test
    fun `getContentSas returns url from service`() = runTest {
        coEvery { mockService.getSasUrl("https://blob.url") } returns SasUrlResponse("https://sas.url")

        val result = repository.getContentSas("https://blob.url")

        assertThat(result).isEqualTo("https://sas.url")
    }

    @Test
    fun `getAllContent propagates exceptions`() = runTest {
        coEvery { mockService.getAllContent(any(), any()) } throws RuntimeException("fail")

        var threw = false
        try { repository.getAllContent() } catch (e: RuntimeException) { threw = true }
        assertThat(threw).isTrue()
    }
}
