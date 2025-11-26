package com.example.seeds.ui.classroom

import android.util.Log
import androidx.lifecycle.*
import com.example.seeds.model.Classroom
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.UserPreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ClassroomViewModel @Inject constructor(
    private val classroomRepository: ClassroomRepository,
    private val userPreferencesRepository: UserPreferencesRepository
    ): ViewModel() {

    private val _classrooms = MutableLiveData<List<Classroom>>(emptyList())
    val classrooms: LiveData<List<Classroom>> get() = _classrooms

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> get() = _isLoading

    private val _errorMessage = MutableLiveData<String?>(null)
    val errorMessage: LiveData<String?> get() = _errorMessage

    fun refreshClassrooms() {
        Log.d("GroupsDebug", "refreshClassrooms() called.")
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _classrooms.value = classroomRepository.getAllClassrooms()
            } catch (e: Exception) {
                _errorMessage.value = "Failed to load groups."
            } finally {
                _isLoading.value = false
            }
        }
    }

    val userPrefs = userPreferencesRepository.userPrefs.asLiveData()

    val showResumeCard = Transformations.map(userPrefs) { prefs ->
        !prefs.lastClassroomId.isNullOrEmpty()
    }

    private val _navigateToCallSettings = MutableLiveData<Classroom?>()
    val navigateToCallSettings: LiveData<Classroom?> get() = _navigateToCallSettings

    fun onResumeSessionClicked() {
        Log.d("ResumeDebug", "onResumeSessionClicked TRIGGERED")
        val prefs = userPrefs.value ?: return

        if (prefs.lastClassroomId.isEmpty()) {
            Log.w("ResumeDebug", "lastClassroomId is empty. Cannot resume.")
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            try {
                Log.d("ResumeDebug", "Fetching classroom with ID: ${prefs.lastClassroomId}")
                val classroom = classroomRepository.getClassroomById(prefs.lastClassroomId)
                Log.d("ResumeDebug", "Classroom found. Firing navigation event to settings.")
                _navigateToCallSettings.value = classroom // Fire the event
            } catch (e: Exception) {
                Log.e("ResumeDebug", "Error resuming session: ${e.message}", e)
                _errorMessage.value = "Could not resume session. Group not found."
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun onNavigationComplete() {
        _navigateToCallSettings.value = null
    }
}