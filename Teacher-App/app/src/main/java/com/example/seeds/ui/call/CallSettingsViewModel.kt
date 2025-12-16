package com.example.seeds.ui.call

import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.Classroom
import com.example.seeds.model.Content
import com.example.seeds.model.Student
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.StudentRepository
import com.example.seeds.repository.TeacherStudentsDirectory 
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CallSettingsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val studentRepository: StudentRepository,
    private val classroomRepository: ClassroomRepository,
    private val contentRepository: ContentRepository,
    private val teacherStudentsDirectory: TeacherStudentsDirectory 
) : ViewModel() {

    val args = CallSettingsFragmentArgs.fromSavedStateHandle(savedStateHandle)

    private val _classroom = MutableLiveData<Classroom>(args.classroom)
    val classroom: LiveData<Classroom>
        get() = _classroom

    private val _studentsForCall = MutableLiveData<List<Student>>()
    val studentsForCall: LiveData<List<Student>>
        get() = _studentsForCall

    private val _goToHome = MutableLiveData(false)
    val goToHome: LiveData<Boolean>
        get() = _goToHome

    init {
        viewModelScope.launch {
            val fixedClassroom = repairClassroomNames(args.classroom)
            _classroom.postValue(fixedClassroom)
            
            refreshClassroom()
        }
    }

    fun updateStudentsForCall(students: List<Student>) {
        _studentsForCall.postValue(students)
    }

    fun updateClassroomContent(classroom: Classroom) {
        viewModelScope.launch {
            classroomRepository.saveClassroom(classroom)
            refreshClassroom()
        }
    }

    fun refreshClassroom() {
        viewModelScope.launch {
            try {
                var classroomById = classroomRepository.getClassroomById(args.classroom._id!!)
                Log.d("CallSettings", "Refreshed Classroom: ${classroomById.name}")

                if (classroomById.contentIds.isNotEmpty()) {
                    classroomById.contents = contentRepository.getContentsById(classroomById.contentIds)
                } else {
                    classroomById.contents = listOf()
                }

                classroomById = repairClassroomNames(classroomById)

                _classroom.postValue(classroomById)
                
            } catch (e: Exception) {
                Log.e("CallSettings", "Error refreshing classroom", e)
            }
        }
    }

    private suspend fun repairClassroomNames(classroom: Classroom): Classroom {
        return try {
            val directoryMap = teacherStudentsDirectory.studentsByPhone()
            
            val fixedStudents = classroom.students.map { student ->
                val correctDetails = directoryMap[student.phoneNumber] 
                    ?: directoryMap[student.phoneNumber.removePrefix("91")]
                    ?: directoryMap["91${student.phoneNumber}"]

                if (correctDetails != null) {
                    student.copy(name = correctDetails.name)
                } else {
                    student
                }
            }
            classroom.apply { students = fixedStudents }
        } catch (e: Exception) {
            Log.e("CallSettings", "Failed to repair names", e)
            classroom
        }
    }

    fun deleteClassroom() {
        viewModelScope.launch {
            classroomRepository.deleteClassroom(classroom.value!!)
            _goToHome.postValue(true)
        }
    }
}