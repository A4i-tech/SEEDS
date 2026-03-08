package com.example.seeds.repository

import android.content.SharedPreferences
import com.example.seeds.model.Student
import com.example.seeds.network.SeedsService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import javax.inject.Inject

class TeacherRepository @Inject constructor(
    private val network: SeedsService,
    private val sharedPreferences: SharedPreferences
) {
    fun getTeacherPhoneNumber(): String {
        return sharedPreferences.getString("teacher_phone", "") ?: ""
    }

    suspend fun getMyStudents(): List<Student> {
        return withContext(Dispatchers.IO) {
            try {
                network.getSchoolStudents()
            } catch (e: HttpException) {
                if (e.code() == 404) {
                    emptyList()
                } else {
                    throw e
                }
            }
        }
    }

    suspend fun register() {
        // withContext(Dispatchers.IO) {
        //     network.registerTeacher()
        // }
    }
}

