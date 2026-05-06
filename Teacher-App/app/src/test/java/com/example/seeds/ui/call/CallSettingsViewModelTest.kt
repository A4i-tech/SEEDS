package com.example.seeds.ui.call

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.lifecycle.SavedStateHandle
import com.example.seeds.builders.ClassroomTestBuilder
import com.example.seeds.builders.StudentTestBuilder
import com.example.seeds.model.Classroom
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.StudentRepository
import com.example.seeds.repository.TeacherStudentsDirectory
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
class CallSettingsViewModelTest {

    @get:Rule val instantTaskExecutor = InstantTaskExecutorRule()
    @get:Rule val mainDispatcher = MainDispatcherRule()

    private val mockStudentRepo = mockk<StudentRepository>(relaxed = true)
    private val mockClassroomRepo = mockk<ClassroomRepository>()
    private val mockContentRepo = mockk<ContentRepository>()
    private val mockDirectory = mockk<TeacherStudentsDirectory>()
    private lateinit var viewModel: CallSettingsViewModel

    private val testClassroom = ClassroomTestBuilder.build(id = "cls-1", name = "Test Class")

    @Before
    fun setup() = runTest {
        coEvery { mockDirectory.studentsByPhone() } returns emptyMap()
        coEvery { mockClassroomRepo.getClassroomById("cls-1") } returns testClassroom
        coEvery { mockContentRepo.getContentsById(any()) } returns emptyList()

        val handle = SavedStateHandle(mapOf(
            "classroom" to testClassroom,
            "selectedStudents" to null
        ))
        viewModel = CallSettingsViewModel(handle, mockStudentRepo, mockClassroomRepo, mockContentRepo, mockDirectory)
        advanceUntilIdle()
    }

    @Test
    fun `classroom initialised from saved state`() {
        assertThat(viewModel.classroom.value?.name).isEqualTo("Test Class")
    }

    @Test
    fun `updateStudentsForCall updates studentsForCall live data`() {
        val students = listOf(StudentTestBuilder.build(), StudentTestBuilder.build(id = "stu-2", phoneNumber = "8888888888"))

        viewModel.updateStudentsForCall(students)

        assertThat(viewModel.studentsForCall.value).hasSize(2)
    }

    @Test
    fun `refreshClassroom fetches classroom and updates live data`() = runTest {
        val updated = ClassroomTestBuilder.build(id = "cls-1", name = "Updated Class")
        coEvery { mockClassroomRepo.getClassroomById("cls-1") } returns updated

        viewModel.refreshClassroom()
        advanceUntilIdle()

        assertThat(viewModel.classroom.value?.name).isEqualTo("Updated Class")
    }

    @Test
    fun `deleteClassroom calls repo and sets goToHome`() = runTest {
        coEvery { mockClassroomRepo.deleteClassroom(any()) } returns Unit

        viewModel.deleteClassroom()
        advanceUntilIdle()

        coVerify { mockClassroomRepo.deleteClassroom(any()) }
        assertThat(viewModel.goToHome.value).isTrue()
    }

    @Test
    fun `updateClassroomContent saves classroom then refreshes`() = runTest {
        val classroom = ClassroomTestBuilder.build(id = "cls-1")
        coEvery { mockClassroomRepo.saveClassroom(any()) } returns classroom
        coEvery { mockClassroomRepo.getClassroomById("cls-1") } returns classroom

        viewModel.updateClassroomContent(classroom)
        advanceUntilIdle()

        coVerify { mockClassroomRepo.saveClassroom(any()) }
    }
}
