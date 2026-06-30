package com.example.seeds.ui.call

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.example.seeds.builders.StudentTestBuilder
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
class ContactsViewModelTest {

    @get:Rule val instantTaskExecutor = InstantTaskExecutorRule()
    @get:Rule val mainDispatcher = MainDispatcherRule()

    private val mockDirectory = mockk<TeacherStudentsDirectory>()
    private lateinit var viewModel: ContactsViewModel

    @Before
    fun setup() {
        coEvery { mockDirectory.students(any()) } returns emptyList()
        viewModel = ContactsViewModel(mockDirectory)
    }

    @Test
    fun `init triggers student load`() = runTest {
        advanceUntilIdle()
        coVerify { mockDirectory.students(any()) }
    }

    @Test
    fun `initial students state is empty`() {
        assertThat(viewModel.students.value).isEmpty()
    }

    @Test
    fun `refreshStudents updates students list`() = runTest {
        val students = listOf(
            StudentTestBuilder.build(name = "Alice"),
            StudentTestBuilder.build(id = "stu-2", phoneNumber = "8888888888", name = "Bob")
        )
        coEvery { mockDirectory.students(any()) } returns students

        viewModel.refreshStudents()
        advanceUntilIdle()

        assertThat(viewModel.students.value).hasSize(2)
    }

    @Test
    fun `refreshStudents sets empty list when directory is empty`() = runTest {
        coEvery { mockDirectory.students(any()) } returns emptyList()

        viewModel.refreshStudents()
        advanceUntilIdle()

        assertThat(viewModel.students.value).isEmpty()
    }
}
