package com.example.seeds.ui.createclassroom

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.lifecycle.SavedStateHandle
import com.example.seeds.builders.ClassroomTestBuilder
import com.example.seeds.builders.StudentTestBuilder
import com.example.seeds.repository.ClassroomRepository
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
class CreateClassroomViewModelTest {

    @get:Rule val instantTaskExecutor = InstantTaskExecutorRule()
    @get:Rule val mainDispatcher = MainDispatcherRule()

    private val mockClassroomRepo = mockk<ClassroomRepository>()
    private lateinit var viewModel: CreateClassroomViewModel

    @Before
    fun setup() {
        val classroom = ClassroomTestBuilder.build()
        val handle = SavedStateHandle(mapOf("classroom" to classroom))
        viewModel = CreateClassroomViewModel(handle, mockClassroomRepo)
    }

    @Test
    fun `initial navigateBack is false`() {
        assertThat(viewModel.navigateBack.value).isFalse()
    }

    @Test
    fun `updateClassroomStudents updates classroomStudents live data`() {
        val students = listOf(StudentTestBuilder.build(), StudentTestBuilder.build(id = "stu-2", phoneNumber = "8888888888"))

        viewModel.updateClassroomStudents(students)

        assertThat(viewModel.classroomStudents.value).hasSize(2)
    }

    @Test
    fun `updateClassroomLeaders updates classroomLeaders live data`() {
        val leaders = listOf(StudentTestBuilder.build(isLeader = true))

        viewModel.updateClassroomLeaders(leaders)

        assertThat(viewModel.classroomLeaders.value).hasSize(1)
    }

    @Test
    fun `saveClassroom calls repo and sets navigateBack`() = runTest {
        val classroom = ClassroomTestBuilder.build()
        val returnedClassroom = ClassroomTestBuilder.build()
        coEvery { mockClassroomRepo.saveClassroom(any()) } returns returnedClassroom

        viewModel.saveClassroom(classroom)
        advanceUntilIdle()

        coVerify { mockClassroomRepo.saveClassroom(any()) }
        assertThat(viewModel.navigateBack.value).isTrue()
    }

    @Test
    fun `doneNavigating resets navigateBack to false`() = runTest {
        val classroom = ClassroomTestBuilder.build()
        coEvery { mockClassroomRepo.saveClassroom(any()) } returns classroom
        viewModel.saveClassroom(classroom)
        advanceUntilIdle()

        viewModel.doneNavigating()

        assertThat(viewModel.navigateBack.value).isFalse()
    }
}
