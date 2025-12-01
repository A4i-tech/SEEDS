package com.example.seeds.ui.classroom

import android.util.Log
import androidx.lifecycle.*
import com.example.seeds.model.Classroom
import com.example.seeds.model.Content
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.UserPreferencesRepository
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LastSessionUiState(
    val mainTitle: String = "",
    val studentCountInfo: String = "",
    val lastAudioInfo: String = "",
    val isClassDetailsVisible: Boolean = true,
    val classroomId: String = "" // Added ID here for fallback
)

@HiltViewModel
class ClassroomViewModel @Inject constructor(
    private val classroomRepository: ClassroomRepository,
    private val userPreferencesRepository: UserPreferencesRepository
) : ViewModel() {

    private val gson = Gson()
    private val _classrooms = MutableLiveData<List<Classroom>>(emptyList())
    val classrooms: LiveData<List<Classroom>> get() = _classrooms
    
    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> get() = _isLoading
    
    private val _errorMessage = MutableLiveData<String?>(null)
    val errorMessage: LiveData<String?> get() = _errorMessage

    private val _lastSessionUiState = MutableLiveData<LastSessionUiState>()
    val lastSessionUiState: LiveData<LastSessionUiState> get() = _lastSessionUiState

    private val _isLastSessionContent = MutableLiveData(false)
    val isLastSessionContent: LiveData<Boolean> get() = _isLastSessionContent

    // These hold the actual objects for navigation
    private var lastClassroomObject: Classroom? = null
    private var lastContentObject: Content? = null

    val userPrefs = userPreferencesRepository.userPrefs.asLiveData()

    // --- VISIBILITY & MODE LOGIC ---
    val showResumeCard = Transformations.map(userPrefs) { prefs ->
        val classId = prefs.lastClassroomId ?: ""
        val standaloneContentJson = prefs.lastContentJson ?: ""
        val callContentJson = prefs.lastCallContentJson ?: ""
        val actionType = prefs.lastActionType // "CALL" or "CONTENT"

        var hasSession = false
        var isContentMode = false

        // 1. CHECK IF WE SHOULD SHOW AUDIO MODE
        if (actionType == "CONTENT" && standaloneContentJson.isNotEmpty()) {
            try {
                val content = gson.fromJson(standaloneContentJson, Content::class.java)
                lastContentObject = content
                
                _lastSessionUiState.value = LastSessionUiState(
                    mainTitle = content.titleText ?: "Resume Audio",
                    isClassDetailsVisible = false, // Hides student row
                    classroomId = ""
                )
                isContentMode = true
                hasSession = true
            } catch (e: Exception) {
                isContentMode = false
            }
        } 
        
        // 2. CHECK IF WE SHOULD SHOW CALL MODE
        if (!isContentMode && classId.isNotEmpty()) {
            // We are in Call Mode.
            // Even if classroom fetch is slow, we set hasSession = true so card appears.
            hasSession = true
            isContentMode = false
            
            // Trigger fetch for details
            fetchClassSessionDetails(classId, callContentJson)
        }
        
        _isLastSessionContent.value = isContentMode
        hasSession 
    }

    private fun fetchClassSessionDetails(classId: String, callContentJson: String) {
        viewModelScope.launch {
            try {
                val classroom = classroomRepository.getClassroomById(classId)
                lastClassroomObject = classroom
                
                val count = classroom.students?.size ?: 0
                val studentText = "$count Students"
                
                // Parse In-Call Audio
                var audioText = "No audio played"
                if (callContentJson.isNotEmpty()) {
                    try {
                        val content = gson.fromJson(callContentJson, Content::class.java)
                        audioText = "Last: ${content.titleText}"
                    } catch (e: Exception) {
                        Log.e("ResumeDebug", "Error parsing call content", e)
                    }
                }

                _lastSessionUiState.value = LastSessionUiState(
                    mainTitle = classroom.name ?: "Unknown Class",
                    studentCountInfo = studentText,
                    lastAudioInfo = audioText,
                    isClassDetailsVisible = true,
                    classroomId = classroom._id ?: ""
                )
            } catch (e: Exception) {
                Log.e("ResumeDebug", "Failed to fetch classroom details", e)
            }
        }
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
    private val _navigateToCall = MutableLiveData<Classroom?>()
    val navigateToCall: LiveData<Classroom?> get() = _navigateToCall
    
    private val _navigateToCallSettings = MutableLiveData<Classroom?>()
    val navigateToCallSettings: LiveData<Classroom?> get() = _navigateToCallSettings

    private val _navigateToContentDetails = MutableLiveData<Content?>()
    val navigateToContentDetails: LiveData<Content?> get() = _navigateToContentDetails
    
    private val _navigateToLibrary = MutableLiveData<Boolean>()
    val navigateToLibrary: LiveData<Boolean> get() = _navigateToLibrary


    fun onResumeCallClicked() {
        if (lastClassroomObject != null) {
            // Case A: Object exists in memory -> Navigate immediately
            _navigateToCall.value = lastClassroomObject
        } else {
            // Case B: Object missing (App restart) -> Reload it from ID, THEN navigate
            val currentState = _lastSessionUiState.value
            val id = currentState?.classroomId // <--- Make sure this ID is saved in the State
            
            if (!id.isNullOrEmpty()) {
                _isLoading.value = true
                viewModelScope.launch {
                    try {
                        // Fetch fresh object from DB
                        val classroom = classroomRepository.getClassroomById(id)
                        lastClassroomObject = classroom
                        _navigateToCall.value = classroom // <--- Navigate now
                    } catch (e: Exception) {
                        _errorMessage.value = "Unable to start call."
                    } finally {
                        _isLoading.value = false
                    }
                }
            }
        }
    }
    
    fun onEditClassClicked() {
        if (lastClassroomObject != null) {
            _navigateToCallSettings.value = lastClassroomObject
        }
    }

    fun onResumeAudioClicked() {
        if (lastContentObject != null) {
            _navigateToContentDetails.value = lastContentObject
        }
    }

    fun onChooseAudioClicked() {
         _navigateToLibrary.value = true
    }

    fun onNavigationComplete() {
        _navigateToCallSettings.value = null
        _navigateToCall.value = null
        _navigateToContentDetails.value = null
        _navigateToLibrary.value = false
    }
}