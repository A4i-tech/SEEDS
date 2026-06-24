package com.example.seeds.ui.students

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.util.MainDispatcherRule
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import org.junit.Rule
import org.junit.Test

class MyStudentsViewModelTest {

    @get:Rule val instantTaskExecutor = InstantTaskExecutorRule()
    @get:Rule val mainDispatcher = MainDispatcherRule()

    private val mockTeacherRepo = mockk<TeacherRepository>(relaxed = true)
    private val viewModel = MyStudentsViewModel(mockTeacherRepo)

    @Test
    fun `initial students state is null`() {
        assertThat(viewModel.students.value).isNull()
    }

}
