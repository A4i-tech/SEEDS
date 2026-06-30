package com.example.seeds.repository

import com.example.seeds.builders.StudentTestBuilder
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test

class TeacherStudentsDirectoryTest {

    private val mockTeacherRepo = mockk<TeacherRepository>()
    private lateinit var directory: TeacherStudentsDirectory

    @Before
    fun setup() {
        directory = TeacherStudentsDirectory(mockTeacherRepo)
    }

    @Test
    fun `students fetches from teacher repo`() = runTest {
        val students = listOf(StudentTestBuilder.build(phoneNumber = "111"))
        coEvery { mockTeacherRepo.getMyStudents() } returns students

        val result = directory.students()

        assertThat(result).hasSize(1)
    }

    @Test
    fun `students uses cache on second call without forceRefresh`() = runTest {
        val students = listOf(StudentTestBuilder.build())
        coEvery { mockTeacherRepo.getMyStudents() } returns students

        directory.students()
        directory.students()

        coVerify(exactly = 1) { mockTeacherRepo.getMyStudents() }
    }

    @Test
    fun `students bypasses cache when forceRefresh is true`() = runTest {
        val students = listOf(StudentTestBuilder.build())
        coEvery { mockTeacherRepo.getMyStudents() } returns students

        directory.students(forceRefresh = false)
        directory.students(forceRefresh = true)

        coVerify(exactly = 2) { mockTeacherRepo.getMyStudents() }
    }

    @Test
    fun `studentsByPhone returns map keyed by phone number`() = runTest {
        val students = listOf(
            StudentTestBuilder.build(phoneNumber = "111", name = "Alice"),
            StudentTestBuilder.build(id = "stu-2", phoneNumber = "222", name = "Bob")
        )
        coEvery { mockTeacherRepo.getMyStudents() } returns students

        val map = directory.studentsByPhone()

        assertThat(map["111"]?.name).isEqualTo("Alice")
        assertThat(map["222"]?.name).isEqualTo("Bob")
    }

    @Test
    fun `nameFor returns phone number when student not in cache`() {
        assertThat(directory.nameFor("unknown-phone")).isEqualTo("unknown-phone")
    }

    @Test
    fun `nameFor returns student name after cache populated`() = runTest {
        val students = listOf(StudentTestBuilder.build(phoneNumber = "555", name = "Charlie"))
        coEvery { mockTeacherRepo.getMyStudents() } returns students
        directory.students()

        assertThat(directory.nameFor("555")).isEqualTo("Charlie")
    }

    @Test
    fun `studentFor returns null when not in cache`() {
        assertThat(directory.studentFor("notexist")).isNull()
    }
}
