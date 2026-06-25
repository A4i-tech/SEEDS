package com.example.seeds.ui.classroom

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.example.seeds.builders.ClassroomTestBuilder
import com.example.seeds.builders.ContentTestBuilder
import com.example.seeds.model.ContentHistoryItem
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.UserPrefs
import com.example.seeds.repository.UserPreferencesRepository
import com.example.seeds.util.MainDispatcherRule
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClassroomViewModelTest {

    @get:Rule val instantTaskExecutor = InstantTaskExecutorRule()
    @get:Rule val mainDispatcher = MainDispatcherRule()

    private val mockClassroomRepo = mockk<ClassroomRepository>()
    private val mockUserPrefsRepo = mockk<UserPreferencesRepository>(relaxed = true)
    private lateinit var viewModel: ClassroomViewModel

    @Before
    fun setup() {
        every { mockUserPrefsRepo.userPrefs } returns flowOf(UserPrefs())
        every { mockUserPrefsRepo.getContentHistory() } returns flowOf(emptyList())
        viewModel = ClassroomViewModel(mockClassroomRepo, mockUserPrefsRepo)
    }

    @Test
    fun `initial classrooms state is empty`() {
        assertThat(viewModel.classrooms.value).isEmpty()
    }

    @Test
    fun `refreshClassrooms updates classrooms on success`() = runTest {
        val classrooms = listOf(ClassroomTestBuilder.build(), ClassroomTestBuilder.build(id = "cls-2"))
        coEvery { mockClassroomRepo.getAllClassrooms() } returns classrooms

        viewModel.refreshClassrooms()
        advanceUntilIdle()

        assertThat(viewModel.classrooms.value).hasSize(2)
    }

    @Test
    fun `refreshClassrooms sets errorMessage on failure`() = runTest {
        coEvery { mockClassroomRepo.getAllClassrooms() } throws RuntimeException("Network failure")

        viewModel.refreshClassrooms()
        advanceUntilIdle()

        assertThat(viewModel.errorMessage.value).isNotNull()
    }

    @Test
    fun `refreshClassrooms clears errorMessage on subsequent success`() = runTest {
        coEvery { mockClassroomRepo.getAllClassrooms() } throws RuntimeException()
        viewModel.refreshClassrooms()
        advanceUntilIdle()

        coEvery { mockClassroomRepo.getAllClassrooms() } returns listOf(ClassroomTestBuilder.build())
        viewModel.refreshClassrooms()
        advanceUntilIdle()

        assertThat(viewModel.classrooms.value).hasSize(1)
    }

    @Test
    fun `isLoading is false after refreshClassrooms completes`() = runTest {
        coEvery { mockClassroomRepo.getAllClassrooms() } returns emptyList()

        viewModel.refreshClassrooms()
        advanceUntilIdle()

        assertThat(viewModel.isLoading.value).isFalse()
    }

    @Test
    fun `onNavigationComplete clears navigateToCallSettings`() = runTest {
        viewModel.onNavigationComplete()
        assertThat(viewModel.navigateToCallSettings.value).isNull()
    }

    @Test
    fun `onNavigationComplete clears navigateToHistoryContent`() = runTest {
        viewModel.onNavigationComplete()
        assertThat(viewModel.navigateToHistoryContent.value).isNull()
    }

    @Test
    fun `onContentHistoryItemClicked sets navigateToHistoryContent`() {
        val content = ContentTestBuilder.build()
        val historyItem = ContentHistoryItem(content = content, timestamp = 1000L)

        viewModel.onContentHistoryItemClicked(historyItem)

        assertThat(viewModel.navigateToHistoryContent.value).isEqualTo(content)
    }
}
