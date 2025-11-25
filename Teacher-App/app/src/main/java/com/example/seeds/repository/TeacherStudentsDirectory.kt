package com.example.seeds.repository

import com.example.seeds.model.Student
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TeacherStudentsDirectory @Inject constructor(
    private val teacherRepository: TeacherRepository
) {

    private val mutex = Mutex()
    @Volatile
    private var cachedStudents: Map<String, Student> = emptyMap()

    suspend fun refresh(force: Boolean = false): List<Student> {
        return withContext(Dispatchers.IO) {
            val map = loadStudents(force)
            map.values.toList()
        }
    }

    suspend fun students(forceRefresh: Boolean = false): List<Student> {
        return loadStudents(forceRefresh).values.toList()
    }

    suspend fun studentsByPhone(forceRefresh: Boolean = false): Map<String, Student> {
        return loadStudents(forceRefresh)
    }

    fun nameFor(phoneNumber: String): String {
        return cachedStudents[phoneNumber]?.name ?: phoneNumber
    }

    fun studentFor(phoneNumber: String): Student? = cachedStudents[phoneNumber]

    private suspend fun loadStudents(forceRefresh: Boolean): Map<String, Student> {
        if (!forceRefresh && cachedStudents.isNotEmpty()) {
            return cachedStudents
        }
        return mutex.withLock {
            if (!forceRefresh && cachedStudents.isNotEmpty()) {
                return@withLock cachedStudents
            }
            val students = teacherRepository.getMyStudents()
            cachedStudents = students.associateBy { it.phoneNumber }
            cachedStudents
        }
    }
}

