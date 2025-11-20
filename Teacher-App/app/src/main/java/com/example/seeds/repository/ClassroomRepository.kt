package com.example.seeds.repository

import android.content.Context
import com.example.seeds.model.Classroom
import com.example.seeds.model.asDto
import com.example.seeds.network.SeedsService
import com.example.seeds.network.asDomainModel
import com.example.seeds.utils.ContactUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject

class ClassroomRepository @Inject constructor(
    private val network: SeedsService,
    private val context: Context, // Context for SharedPreferences
) {
    

    private val contactUtils = ContactUtils(context)

    suspend fun getAllClassrooms(): List<Classroom> {
        return withContext(Dispatchers.IO) {
            // Pass BOTH context and contactUtils to asDomainModel
            network.getAllClassrooms().asDomainModel(context, contactUtils).sortedByDescending {
                it._id
            }
        }
    }

    suspend fun getClassroomById(classId: String): Classroom {
        return withContext(Dispatchers.IO) {
            network.getClassroomById(classId).asDomainModel(context, contactUtils)
        }
    }

    suspend fun saveClassroom(classroom: Classroom): Classroom {
        return withContext(Dispatchers.IO) {
            network.saveClassroom(classroom.asDto()).asDomainModel(context, contactUtils)
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
