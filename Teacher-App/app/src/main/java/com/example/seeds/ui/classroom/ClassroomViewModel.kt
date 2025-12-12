package com.example.seeds.ui.classroom

import android.util.Log
import androidx.lifecycle.*
import com.example.seeds.model.Classroom
import com.example.seeds.model.HistoryItem
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.UserPreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ClassroomViewModel @Inject constructor(
    private val classroomRepository: ClassroomRepository,
    private val userPreferencesRepository: UserPreferencesRepository
) : ViewModel() {

    private val _classrooms = MutableLiveData<List<Classroom>>(emptyList())
    val classrooms: LiveData<List<Classroom>> get() = _classrooms
    
    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> get() = _isLoading
    
    private val _errorMessage = MutableLiveData<String?>(null)
    val errorMessage: LiveData<String?> get() = _errorMessage

    val userPrefs = userPreferencesRepository.userPrefs.asLiveData()

    // Observe content history to show/hide history card
    val contentHistory = userPreferencesRepository.getContentHistory().asLiveData()
    
    // Observe session history (conference calls)
    val sessionHistory = Transformations.map(userPrefs) { prefs ->
        prefs.history ?: emptyList()
    }
    
    // Unified history combining content and sessions, sorted by timestamp
    val unifiedHistory: LiveData<List<HistoryItem>> = MediatorLiveData<List<HistoryItem>>().apply {
        var currentContentHistory: List<com.example.seeds.model.ContentHistoryItem> = emptyList()
        var currentSessionHistory: List<com.example.seeds.model.SessionHistoryItem> = emptyList()
        
        fun update() {
            val combined = mutableListOf<HistoryItem>()
            currentContentHistory.forEach { combined.add(HistoryItem.ContentItem(it)) }
            currentSessionHistory.forEach { combined.add(HistoryItem.SessionItem(it)) }
            value = combined.sortedByDescending { it.timestamp }
        }
        
        addSource(contentHistory) { content ->
            currentContentHistory = content ?: emptyList()
            update()
        }
        
        addSource(sessionHistory) { sessions ->
            currentSessionHistory = sessions ?: emptyList()
            update()
        }
    }
    
    // Computed property to check if we have any history
    val hasHistory = Transformations.map(unifiedHistory) { history ->
        !history.isNullOrEmpty()
    }

    fun refreshClassrooms() {
        viewModelScope.launch {
            _isLoading.value = true
            try { _classrooms.value = classroomRepository.getAllClassrooms() } 
            catch (e: Exception) { _errorMessage.value = "Failed to load groups." } 
            finally { _isLoading.value = false }
        }
    }

    // --- NAVIGATION EVENTS ---
    private val _navigateToCallSettings = MutableLiveData<Classroom?>()
    val navigateToCallSettings: LiveData<Classroom?> get() = _navigateToCallSettings
    
    private val _navigateToHistoryContent = MutableLiveData<com.example.seeds.model.Content?>()
    val navigateToHistoryContent: LiveData<com.example.seeds.model.Content?> get() = _navigateToHistoryContent

    fun onContentHistoryItemClicked(historyItem: com.example.seeds.model.ContentHistoryItem) {
        _navigateToHistoryContent.value = historyItem.content
    }
    
    fun onSessionHistoryItemClicked(sessionItem: com.example.seeds.model.SessionHistoryItem) {
        // Navigate to call settings for the classroom from this session
        val classId = sessionItem.groupId
        if (!classId.isNullOrEmpty()) {
            _isLoading.value = true
            viewModelScope.launch {
                try {
                    val classroom = classroomRepository.getClassroomById(classId)
                    _navigateToCallSettings.value = classroom
                } catch (e: Exception) {
                    Log.e("SessionHistory", "Failed to load classroom for session: ${e.message}")
                    _errorMessage.value = "Unable to resume this session."
                } finally {
                    _isLoading.value = false
                }
            }
        }
    }

    fun onNavigationComplete() {
        _navigateToCallSettings.value = null
        _navigateToHistoryContent.value = null
    }
}