package com.example.seeds.repository

import androidx.lifecycle.MutableLiveData
import com.example.seeds.builders.StudentTestBuilder
import com.example.seeds.dao.StudentsDao
import com.example.seeds.model.Student
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.Runs
import kotlinx.coroutines.test.runTest
import org.junit.Test

class StudentRepositoryTest {

    private val mockDao = mockk<StudentsDao>()
    private val repository = StudentRepository(mockDao)

    @Test
    fun `getSelectedStudents delegates to dao`() {
        val liveData = MutableLiveData<List<Student>>(emptyList())
        every { mockDao.getAllSelectedStudents() } returns liveData

        val result = repository.getSelectedStudents()

        assertThat(result).isEqualTo(liveData)
    }

    @Test
    fun `addSelectedStudents passes students to dao`() = runTest {
        val students = listOf(StudentTestBuilder.build())
        coEvery { mockDao.selectedStudents(any()) } just Runs

        repository.addSelectedStudents(students)

        coVerify { mockDao.selectedStudents(students) }
    }

    @Test
    fun `deleteSelectedStudents calls dao delete`() = runTest {
        coEvery { mockDao.deleteAllSelectedStudents() } just Runs

        repository.deleteSelectedStudents()

        coVerify { mockDao.deleteAllSelectedStudents() }
    }

    @Test
    fun `getSelectedStudents reflects dao live data value`() {
        val students = listOf(StudentTestBuilder.build(name = "Alice"), StudentTestBuilder.build(id = "stu-2", name = "Bob"))
        val liveData = MutableLiveData<List<Student>>(students)
        every { mockDao.getAllSelectedStudents() } returns liveData

        val result = repository.getSelectedStudents()

        assertThat(result.value).hasSize(2)
    }
}
