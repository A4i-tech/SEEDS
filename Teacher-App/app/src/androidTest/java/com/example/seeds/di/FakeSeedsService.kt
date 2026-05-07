package com.example.seeds.di

import com.example.seeds.database.LogEntity
import com.example.seeds.model.AudioStatus
import com.example.seeds.model.CallDetails
import com.example.seeds.model.ConferenceCreateRequest
import com.example.seeds.model.ConferenceCreateResponse
import com.example.seeds.model.Content
import com.example.seeds.model.Pagination
import com.example.seeds.model.PaginatedResponse
import com.example.seeds.model.SasUrlResponse
import com.example.seeds.model.Student
import com.example.seeds.model.StudentListContainer
import com.example.seeds.network.CallStatusDto
import com.example.seeds.network.ClassroomDto
import com.example.seeds.network.ClassroomSaveDto
import com.example.seeds.network.GetStudentsRequest
import com.example.seeds.network.SeedsService
import androidx.test.espresso.idling.CountingIdlingResource
import okhttp3.ResponseBody
import retrofit2.Response

class FakeSeedsService : SeedsService {

    val idlingResource = CountingIdlingResource("FakeSeedsService")

    var classroomsToReturn: List<ClassroomDto> = emptyList()
    var contentToReturn: PaginatedResponse<Content> =
        PaginatedResponse(emptyList(), Pagination(nextCursor = null, hasMore = false, limit = 15))
    var contentsByIdToReturn: List<Content> = emptyList()
    var studentsToReturn: List<Student> = emptyList()

    fun reset() {
        while (!idlingResource.isIdleNow) idlingResource.decrement()
        classroomsToReturn = emptyList()
        contentToReturn = PaginatedResponse(emptyList(), Pagination(null, false, 15))
        contentsByIdToReturn = emptyList()
        studentsToReturn = emptyList()
    }

    override suspend fun getAllClassrooms(): List<ClassroomDto> {
        idlingResource.increment()
        return try { classroomsToReturn } finally { idlingResource.decrement() }
    }

    override suspend fun getClassroomById(classId: String): ClassroomDto =
        classroomsToReturn.firstOrNull { it._id == classId }
            ?: ClassroomDto(_id = classId, name = "Unknown", teacher = "", students = emptyList(), leaders = emptyList())

    override suspend fun getAllContent(limit: Int, cursor: String?): PaginatedResponse<Content> {
        idlingResource.increment()
        return try { contentToReturn } finally { idlingResource.decrement() }
    }

    override suspend fun getContentsById(ids: String): List<Content> = contentsByIdToReturn

    override suspend fun getSchoolStudents(): List<Student> = studentsToReturn

    override suspend fun getTeacherStudents(body: GetStudentsRequest): List<Student> = emptyList()

    override suspend fun getParticipants(): List<Student> = emptyList()

    override suspend fun saveClassroom(classroom: ClassroomSaveDto): ClassroomDto =
        ClassroomDto(_id = classroom._id ?: "new-id", name = classroom.name, teacher = classroom.teacher,
            students = emptyList(), leaders = emptyList())

    override suspend fun deleteClassroom(classId: String) = Unit

    override suspend fun registerTeacher() = Unit

    override suspend fun uploadLogs(logs: List<LogEntity>) = Unit

    override suspend fun logout(token: String): Response<Unit> = Response.success(Unit)

    override suspend fun healthPing(): Response<Unit> = Response.success(Unit)

    override suspend fun getAccessToken(fullUrl: String, body: ConferenceCreateRequest): ConferenceCreateResponse =
        ConferenceCreateResponse(status = "ok", id = "")

    override suspend fun startCall(fullUrl: String, callDetails: CallDetails): Response<Unit> =
        Response.success(Unit)

    override suspend fun endCall(url: String): Response<Unit> = Response.success(Unit)

    @Suppress("UNCHECKED_CAST")
    override suspend fun playAudio(url: String, audioUrl: String): Response<Any> =
        Response.success(Unit) as Response<Any>

    @Suppress("UNCHECKED_CAST")
    override suspend fun audioCommand(url: String): Response<Any> =
        Response.success(Unit) as Response<Any>

    override suspend fun seekAudio(url: String): Response<ResponseBody> = Response.success(null)

    @Suppress("UNCHECKED_CAST")
    override suspend fun muteParticipant(url: String, phoneNumber: String): Response<Any> =
        Response.success(Unit) as Response<Any>

    @Suppress("UNCHECKED_CAST")
    override suspend fun unmuteParticipant(url: String, phoneNumber: String): Response<Any> =
        Response.success(Unit) as Response<Any>

    @Suppress("UNCHECKED_CAST")
    override suspend fun muteAll(url: String): Response<Any> =
        Response.success(Unit) as Response<Any>

    @Suppress("UNCHECKED_CAST")
    override suspend fun unmuteAll(url: String): Response<Any> =
        Response.success(Unit) as Response<Any>

    @Suppress("UNCHECKED_CAST")
    override suspend fun connectParticipant(url: String, phoneNumber: String, name: String?): Response<Any> =
        Response.success(Unit) as Response<Any>

    @Suppress("UNCHECKED_CAST")
    override suspend fun disconnectParticipant(url: String, phoneNumber: String, name: String?): Response<Any> =
        Response.success(Unit) as Response<Any>

    override suspend fun getCallStatus(confId: String): CallStatusDto =
        CallStatusDto(participants = emptyList(), leaderPhoneNumber = "", audio = AudioStatus(id = "", state = "idle"))

    override suspend fun setStudents(students: StudentListContainer): List<String> = emptyList()

    override suspend fun getSasUrl(url: String): SasUrlResponse = SasUrlResponse(url = "")

    @Suppress("UNCHECKED_CAST")
    override suspend fun setPlaybackSpeed(url: String, speed: Double): Response<Any> =
        Response.success(Unit) as Response<Any>
}
