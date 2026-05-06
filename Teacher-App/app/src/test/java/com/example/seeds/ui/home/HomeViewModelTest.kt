package com.example.seeds.ui.home

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.Observer
import com.example.seeds.builders.ContentTestBuilder
import com.example.seeds.model.Content
import com.example.seeds.model.Pagination
import com.example.seeds.model.PaginatedResponse
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.util.MainDispatcherRule
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {

    @get:Rule val instantTaskExecutor = InstantTaskExecutorRule()
    @get:Rule val mainDispatcher = MainDispatcherRule()

    private val mockTeacherRepo = mockk<TeacherRepository>(relaxed = true)
    private val mockContentRepo = mockk<ContentRepository>()
    private val mockClassroomRepo = mockk<ClassroomRepository>()
    private lateinit var viewModel: HomeViewModel

    private fun paginatedOf(vararg titles: String) = PaginatedResponse(
        data = titles.mapIndexed { i, t -> ContentTestBuilder.build(id = "c-$i", title = t) },
        pagination = Pagination(nextCursor = null, hasMore = false, limit = 15)
    )

    private fun seedAllContent(vararg titles: String) {
        val field = HomeViewModel::class.java.getDeclaredField("_allContent").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        (field.get(viewModel) as MutableLiveData<List<Content>>).value = titles.mapIndexed { i, t ->
            ContentTestBuilder.build(id = "c-$i", title = t)
        }
    }

    private fun withFilteredContentObserver(block: () -> Unit) {
        val observer = Observer<List<Content>> { }
        viewModel.filteredContent.observeForever(observer)
        try {
            block()
        } finally {
            viewModel.filteredContent.removeObserver(observer)
        }
    }

    @Before
    fun setup() = runTest {
        coEvery { mockContentRepo.getAllContent(any(), any()) } returns paginatedOf()
        val handle = SavedStateHandle(mapOf("classroom" to null, "selectedStudents" to null, "selectedContent" to null))
        viewModel = HomeViewModel(handle, mockTeacherRepo, mockContentRepo, mockClassroomRepo)
        advanceUntilIdle()
    }

    @Test
    fun `init fetches initial content`() = runTest {
        advanceUntilIdle()
        coVerify { mockContentRepo.getAllContent(any(), null) }
    }

    @Test
    fun `fetchInitialContent populates allContent`() = runTest {
        coEvery { mockContentRepo.getAllContent(any(), null) } returns paginatedOf("Story A", "Story B")

        viewModel.fetchInitialContent()
        advanceUntilIdle()

        assertThat(viewModel.allContent.value).hasSize(2)
    }

    @Test
    fun `fetchInitialContent sets empty list on error`() = runTest {
        coEvery { mockContentRepo.getAllContent(any(), any()) } throws RuntimeException("fail")

        viewModel.fetchInitialContent()
        advanceUntilIdle()

        assertThat(viewModel.allContent.value).isEmpty()
    }

    @Test
    fun `isLoading is false after fetch completes`() = runTest {
        coEvery { mockContentRepo.getAllContent(any(), any()) } returns paginatedOf()

        viewModel.fetchInitialContent()
        advanceUntilIdle()

        assertThat(viewModel.isLoading.value).isFalse()
    }

    @Test
    fun `onSearchQueryChanged filters filteredContent by title`() = runTest {
        withFilteredContentObserver {
            seedAllContent("Math Story", "Science Story", "Math Song")

            viewModel.onSearchQueryChanged("math")
            advanceUntilIdle()

            assertThat(viewModel.filteredContent.value.orEmpty().map { it.titleText })
                .containsExactly("Math Story", "Math Song")
        }
    }

    @Test
    fun `onSearchQueryChanged with blank query shows all content`() = runTest {
        withFilteredContentObserver {
            seedAllContent("A", "B", "C")

            viewModel.onSearchQueryChanged("")
            advanceUntilIdle()

            assertThat(viewModel.filteredContent.value.orEmpty()).hasSize(3)
        }
    }

    @Test
    fun `clearFilters resets filter criteria`() = runTest {
        viewModel.setFiltersChosen(FilterCriteria(languages = setOf("English")))

        viewModel.clearFilters()

        assertThat(viewModel.filtersChosen.value?.languages).isEmpty()
    }

    @Test
    fun `loadMoreContent appends to existing list`() = runTest {
        val firstPage = PaginatedResponse(
            data = listOf(ContentTestBuilder.build(id = "c-1")),
            pagination = Pagination(nextCursor = "cursor1", hasMore = true, limit = 15)
        )
        val secondPage = PaginatedResponse(
            data = listOf(ContentTestBuilder.build(id = "c-2")),
            pagination = Pagination(nextCursor = null, hasMore = false, limit = 15)
        )
        coEvery { mockContentRepo.getAllContent(any(), null) } returns firstPage
        coEvery { mockContentRepo.getAllContent(any(), "cursor1") } returns secondPage

        viewModel.fetchInitialContent()
        advanceUntilIdle()
        viewModel.loadMoreContent()
        advanceUntilIdle()

        assertThat(viewModel.allContent.value).hasSize(2)
    }
}
