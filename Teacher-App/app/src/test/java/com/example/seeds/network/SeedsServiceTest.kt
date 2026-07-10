package com.example.seeds.network

import com.example.seeds.ApplicationJsonAdapterFactory
import com.google.common.truth.Truth.assertThat
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
class SeedsServiceTest {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var service: SeedsService

    private val moshi = Moshi.Builder()
        .add(ClassroomDto.Companion)
        .add(ApplicationJsonAdapterFactory)
        .add(KotlinJsonAdapterFactory())
        .build()

    @Before
    fun setup() {
        mockWebServer = MockWebServer()
        val client = OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(2, TimeUnit.SECONDS)
            .build()
        service = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(SeedsService::class.java)
    }

    @After
    fun teardown() = mockWebServer.shutdown()

    @Test
    fun `healthPing sends GET to health`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(200))
        service.healthPing()
        val request = mockWebServer.takeRequest()
        assertThat(request.path).isEqualTo("/health")
        assertThat(request.method).isEqualTo("GET")
    }

    @Test
    fun `getSchoolStudents parses student list from JSON`() = runTest {
        val json = """[{"phoneNumber":"9999999999","name":"Test Student","isLeader":false}]"""
        mockWebServer.enqueue(MockResponse().setBody(json).setResponseCode(200))
        val result = service.getSchoolStudents()
        assertThat(result).hasSize(1)
        assertThat(result.first().name).isEqualTo("Test Student")
        assertThat(result.first().phoneNumber).isEqualTo("9999999999")
    }

    @Test
    fun `500 response throws HttpException`() {
        mockWebServer.enqueue(MockResponse().setResponseCode(500))
        assertThrows(HttpException::class.java) {
            runBlocking { service.getSchoolStudents() }
        }
    }

    @Test
    fun `getAllClassrooms sends GET to class endpoint`() = runTest {
        mockWebServer.enqueue(MockResponse().setBody("[]").setResponseCode(200))
        service.getAllClassrooms()
        val request = mockWebServer.takeRequest()
        assertThat(request.path).isEqualTo("/class")
        assertThat(request.method).isEqualTo("GET")
    }

    @Test
    fun `deleteClassroom sends DELETE with classId in path`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(200))
        service.deleteClassroom("cls-1")
        val request = mockWebServer.takeRequest()
        assertThat(request.path).isEqualTo("/class/cls-1")
        assertThat(request.method).isEqualTo("DELETE")
    }

    @Test
    fun `getAllContent passes limit and cursor as query params`() = runTest {
        val json = """{"data":[],"pagination":{"nextCursor":null,"hasMore":false,"limit":15}}"""
        mockWebServer.enqueue(MockResponse().setBody(json).setResponseCode(200))
        service.getAllContent(limit = 15, cursor = "cur123")
        val request = mockWebServer.takeRequest()
        assertThat(request.path).contains("limit=15")
        assertThat(request.path).contains("cursor=cur123")
    }

    @Test
    fun `getClassroomById sends GET with classId in path`() = runTest {
        val json = """{"id":"cls-1","name":"Test","teacher":"t1","students":[],"leaders":[]}"""
        mockWebServer.enqueue(MockResponse().setBody(json).setResponseCode(200))
        service.getClassroomById("cls-1")
        val request = mockWebServer.takeRequest()
        assertThat(request.path).isEqualTo("/class/cls-1")
        assertThat(request.method).isEqualTo("GET")
    }
}
