package com.example.seeds.repository

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.model.asDto
import com.example.seeds.network.SeedsService
import com.example.seeds.network.asDomainModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import javax.inject.Inject

class ClassroomRepository @Inject constructor(
    private val network: SeedsService,
    private val context: Context // Context for SharedPreferences
) {

    suspend fun getAllClassrooms(): List<Classroom> {
        return withContext(Dispatchers.IO) {
            network.getAllClassrooms().asDomainModel(context).sortedByDescending {
                it._id
            }
        }
    }

    suspend fun getClassroomById(classId: String): Classroom {
        return withContext(Dispatchers.IO) {
            val classroomDeferred = async { network.getClassroomById(classId) }
            val studentsDeferred = async { network.getSchoolStudents() }
            val studentMap = studentsDeferred.await().associateBy { it._id ?: "" }
            classroomDeferred.await().asDomainModel(context, studentMap)
        }
    }

    suspend fun saveClassroom(classroom: Classroom): Classroom {
        return withContext(Dispatchers.IO) {
            network.saveClassroom(classroom.asDto()).asDomainModel(context)
        }
    }

    suspend fun deleteClassroom(classroom: Classroom) {
        withContext(Dispatchers.IO) {
            network.deleteClassroom(classroom._id!!)
        }
    }
    suspend fun updateClassroom(classroom: Classroom): Classroom {
        return saveClassroom(classroom)
    }
}
