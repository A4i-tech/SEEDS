package com.example.seeds.ui.call

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.Student
import com.example.seeds.repository.TeacherStudentsDirectory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val teacherStudentsDirectory: TeacherStudentsDirectory
) : ViewModel() {

    private val _students = MutableLiveData<List<Student>>(emptyList())
    val students: LiveData<List<Student>> get() = _students

    init {
        refreshStudents()
    }

    fun refreshStudents() {
        viewModelScope.launch {
            _students.postValue(teacherStudentsDirectory.students())
        }
    }
}