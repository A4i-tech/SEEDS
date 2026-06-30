package com.example.seeds.repository

import android.content.SharedPreferences
import com.example.seeds.builders.StudentTestBuilder
import com.example.seeds.model.Student
import com.example.seeds.network.SeedsService
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class TeacherRepositoryTest {

    private val mockService = mockk<SeedsService>()
    private val mockPrefs = mockk<SharedPreferences>()
    private val repository = TeacherRepository(mockService, mockPrefs)

    @Test
    fun `getTeacherPhoneNumber reads from shared prefs`() {
        every { mockPrefs.getString("teacher_phone", "") } returns "9876543210"

        assertThat(repository.getTeacherPhoneNumber()).isEqualTo("9876543210")
    }

    @Test
    fun `getTeacherPhoneNumber returns empty string when not set`() {
        every { mockPrefs.getString("teacher_phone", "") } returns null

        assertThat(repository.getTeacherPhoneNumber()).isEmpty()
    }

    @Test
    fun `getMyStudents returns list on success`() = runTest {
        val students = listOf(StudentTestBuilder.build(), StudentTestBuilder.build(id = "stu-2", phoneNumber = "8888888888"))
        coEvery { mockService.getSchoolStudents() } returns students

        val result = repository.getMyStudents()

        assertThat(result).hasSize(2)
    }

    @Test
    fun `getMyStudents returns empty list on 404`() = runTest {
        val httpError = HttpException(Response.error<List<Student>>(404, "Not Found".toResponseBody()))
        coEvery { mockService.getSchoolStudents() } throws httpError

        val result = repository.getMyStudents()

        assertThat(result).isEmpty()
    }

    @Test
    fun `getMyStudents rethrows 403`() = runTest {
        val httpError = HttpException(Response.error<List<Student>>(403, "Forbidden".toResponseBody()))
        coEvery { mockService.getSchoolStudents() } throws httpError

        var threw = false
        try { repository.getMyStudents() } catch (e: HttpException) { threw = true }
        assertThat(threw).isTrue()
    }

    @Test
    fun `getMyStudents rethrows non-HTTP errors`() = runTest {
        coEvery { mockService.getSchoolStudents() } throws RuntimeException("unexpected")

        var threw = false
        try { repository.getMyStudents() } catch (e: RuntimeException) { threw = true }
        assertThat(threw).isTrue()
    }
}
