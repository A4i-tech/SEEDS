package com.example.seeds.repository

import android.content.Context
import com.example.seeds.builders.ClassroomTestBuilder
import com.example.seeds.network.ClassroomDto
import com.example.seeds.network.SeedsService
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.just
import io.mockk.mockk
import io.mockk.Runs
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.IOException

class ClassroomRepositoryTest {

    private val mockService = mockk<SeedsService>()
    private val mockContext = mockk<Context>(relaxed = true)
    private val repository = ClassroomRepository(mockService, mockContext)

    @Test
    fun `getAllClassrooms returns list sorted descending by id`() = runTest {
        val dto1 = ClassroomDto(id = "cls-1", name = "Alpha", teacher = "t", students = emptyList(), leaders = emptyList())
        val dto2 = ClassroomDto(id = "cls-2", name = "Beta", teacher = "t", students = emptyList(), leaders = emptyList())
        coEvery { mockService.getAllClassrooms() } returns listOf(dto1, dto2)

        val result = repository.getAllClassrooms()

        assertThat(result[0]._id).isEqualTo("cls-2")
        assertThat(result[1]._id).isEqualTo("cls-1")
    }

    @Test
    fun `getAllClassrooms propagates IOException`() = runTest {
        coEvery { mockService.getAllClassrooms() } throws IOException("Network error")

        var threw = false
        try { repository.getAllClassrooms() } catch (e: IOException) { threw = true }
        assertThat(threw).isTrue()
    }

    @Test
    fun `saveClassroom calls network and returns domain model`() = runTest {
        val classroom = ClassroomTestBuilder.build(id = "cls-1", name = "Test Class")
        val returnedDto = ClassroomDto(id = "cls-1", name = "Test Class", teacher = "", students = emptyList(), leaders = emptyList())
        coEvery { mockService.saveClassroom(any()) } returns returnedDto

        val result = repository.saveClassroom(classroom)

        assertThat(result._id).isEqualTo("cls-1")
        assertThat(result.name).isEqualTo("Test Class")
        coVerify { mockService.saveClassroom(any()) }
    }

    @Test
    fun `deleteClassroom calls network with correct classroom id`() = runTest {
        val classroom = ClassroomTestBuilder.build(id = "cls-42")
        coEvery { mockService.deleteClassroom("cls-42") } just Runs

        repository.deleteClassroom(classroom)

        coVerify { mockService.deleteClassroom("cls-42") }
    }

    @Test
    fun `getClassroomById returns mapped domain model`() = runTest {
        val dto = ClassroomDto(id = "cls-99", name = "Room 99", teacher = "t", students = emptyList(), leaders = emptyList())
        coEvery { mockService.getClassroomById("cls-99") } returns dto


        val result = repository.getClassroomById("cls-99")

        assertThat(result._id).isEqualTo("cls-99")
        assertThat(result.name).isEqualTo("Room 99")
    }
}
