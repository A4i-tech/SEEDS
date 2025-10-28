package com.example.seeds.ui.classroom

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.Classroom
import com.example.seeds.repository.ClassroomRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ClassroomViewModel @Inject constructor(
    private val classroomRepository: ClassroomRepository
): ViewModel() {

    private val _classrooms = MutableLiveData<List<Classroom>>(null)
    val classrooms: MutableLiveData<List<Classroom>>
        get() = _classrooms

    fun refreshClassrooms() {
        viewModelScope.launch {
            _classrooms.value = classroomRepository.getAllClassrooms()
        }
    }
}