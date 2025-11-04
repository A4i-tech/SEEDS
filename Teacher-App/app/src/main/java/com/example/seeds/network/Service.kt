package com.example.seeds.network

import android.content.Context
import android.util.Log
import com.example.seeds.network.AuthInterceptor
import com.example.seeds.ApplicationJsonAdapterFactory
import com.example.seeds.database.LogEntity
import com.example.seeds.model.*
import com.example.seeds.utils.Constants
import com.squareup.moshi.Moshi
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.*
import java.util.*
import java.util.concurrent.TimeUnit
import com.example.seeds.BuildConfig
import okhttp3.logging.HttpLoggingInterceptor

const val CONTENT_LIMIT = 100

interface SeedsService {

    @POST("tenant/logout") 
    suspend fun logout(@Header("Authorization") token: String): Response<Unit>

    @POST
    suspend fun getAccessToken(
        @Url fullUrl: String ,
        @Body body: ConferenceCreateRequest
    ): ConferenceCreateResponse

    @POST
    suspend fun startCall(
        @Url fullUrl: String,
        @Body callDetails: CallDetails
    ): Response<Unit> 

    @PUT
    suspend fun endCall(
        @Url url: String
        ): Response<Unit>

    @PUT
    suspend fun playAudio(
        @Url url: String,
        @Query("url") audioUrl: String
    ): Response<Any>

    @PUT
    suspend fun audioCommand(
        @Url url: String
        ): Response<Any>

    @PUT
    suspend fun muteParticipant(
        @Url url: String, 
        @Query("phone_number") phoneNumber: String
    ): Response<Any>

    @PUT
    suspend fun unmuteParticipant(
        @Url url: String, 
        @Query("phone_number") phoneNumber: String
    ): Response<Any>

    @PUT
    suspend fun connectParticipant(
        @Url url: String, 
        @Query("phone_number") phoneNumber: String
    ): Response<Any>

    @PUT
    suspend fun disconnectParticipant(
        @Url url: String, 
        @Query("phone_number") phoneNumber: String
    ): Response<Any>

    @GET("call/{confId}/status")
    suspend fun getCallStatus(@Path("confId") confId: String): CallStatusDto

    @GET ("teacher/students")
    suspend fun getStudents(): List<String>

    @GET("participants")
    suspend fun getParticipants(): List<Student>

    @POST ("teacher/students")
    suspend fun setStudents(@Body students: StudentListContainer): List<String>

    @GET ("teacher/register")
    suspend fun registerTeacher()

    @GET("content")
    suspend fun getAllContent(
        @Query("limit") limit: Int = CONTENT_LIMIT,
        @Query("cursor") cursor: String? = null
    ): PaginatedResponse<Content>

    @GET("content")
    suspend fun getContentsById(@Query("ids[]") ids: List<String>): List<Content>

    @GET("content/sasUrl")
    suspend fun getSasUrl(@Query("url") url: String): SasUrlResponse

    @GET("class")
    suspend fun getAllClassrooms(): List<ClassroomDto>

    @GET("class/{classId}")
    suspend fun getClassroomById(@Path("classId") classId: String): ClassroomDto

    @POST("class")
    suspend fun saveClassroom(@Body classroom: ClassroomDto): ClassroomDto

    @DELETE("class/{classId}")
    suspend fun deleteClassroom(@Path("classId") classId: String)

    @POST("log")
    suspend fun uploadLogs(@Body logs: List<LogEntity>)

}

const val TIMEOUT = 60L

fun provideService(@ApplicationContext context: Context): SeedsService {
    //reference: https://proandroiddev.com/headers-in-retrofit-a8d71ede2f3e

    val httpClientBuilder = OkHttpClient.Builder().apply {

        if (BuildConfig.DEBUG) {
            val loggingInterceptor = HttpLoggingInterceptor()
            loggingInterceptor.setLevel(HttpLoggingInterceptor.Level.BODY)
            addInterceptor(loggingInterceptor) // Add the logger
        }
        
        // This interceptor will watch for 403 errors on the response.
        addInterceptor(AuthInterceptor(context))
        // This interceptor adds headers to each request.
        addInterceptor(
            Interceptor { chain ->
                val sharedPreferences = context.getSharedPreferences("sharedPref", Context.MODE_PRIVATE)
                val token = sharedPreferences.getString("auth_token", "postman") // default fallback

                val builder = chain.request().newBuilder()
                builder.header("Authorization", "Bearer $token")
                builder.header("signootReqId", UUID.randomUUID().toString())
                chain.proceed(builder.build())
            }
        )

        readTimeout(TIMEOUT, TimeUnit.SECONDS)
        connectTimeout(TIMEOUT, TimeUnit.SECONDS)
        writeTimeout(TIMEOUT, TimeUnit.SECONDS)
    }

    val moshi = Moshi.Builder()
        .add(ApplicationJsonAdapterFactory)
        .build()

    val retrofit = Retrofit.Builder()
        .baseUrl(Constants.BASE_URL)
        .client(httpClientBuilder.build())
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    return retrofit.create(SeedsService::class.java)
}