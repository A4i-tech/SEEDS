package com.example.seeds.ui.students

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.example.seeds.model.Student
import com.example.seeds.repository.TeacherRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@Suppress("UnusedPrivateMember") // Suppresses warning for teacherRepository
@HiltViewModel
class MyStudentsViewModel @Inject constructor(private val teacherRepository: TeacherRepository): ViewModel() {

    private val _students = MutableLiveData<List<Student>>(null)
    val students: MutableLiveData<List<Student>>
        get() = _students

    fun refreshStudents() {
//        viewModelScope.launch {
//            _students.value = teacherRepository.getMyStudents()
//        }
    }

    @Suppress("UnusedPrivateMember") // Suppresses warning for 'students' parameter
    fun setMyStudents(students: List<String>){
//        viewModelScope.launch {
//            teacherRepository.setMyStudents(students)
//        }
    }
}