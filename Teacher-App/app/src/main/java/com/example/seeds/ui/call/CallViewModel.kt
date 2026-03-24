package com.example.seeds.ui.call

import com.google.gson.Gson
import kotlinx.coroutines.flow.first
import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.Transformations 
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.AccessToken
import com.example.seeds.model.CallDetails
import com.example.seeds.model.CallerState
import com.example.seeds.model.Classroom
import com.example.seeds.model.ConferenceCreateRequest
import com.example.seeds.model.Content
import com.example.seeds.model.Student
import com.example.seeds.model.ParticipantTracker
import com.example.seeds.model.StudentCallStatus
import com.example.seeds.model.PlayerState
import com.example.seeds.model.SessionHistoryItem
import com.example.seeds.network.ConferenceSSEClient
import com.example.seeds.network.SeedsService
import com.example.seeds.network.asDomainModel
import com.example.seeds.utils.Encryptor
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.repository.UserPreferencesRepository
import com.example.seeds.repository.TeacherStudentsDirectory
import com.example.seeds.utils.CallUtils
import com.example.seeds.utils.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import com.example.seeds.network.CONFERENCE_CREATE_TIMEOUT_SECONDS
import java.util.concurrent.TimeoutException
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import javax.inject.Inject

const val SOCKET_CLOSE = 1000
const val THREAD_SLEEP_TIME = 5000L
const val DELAY_FOR_VIEW_MODEL = 180000L

@HiltViewModel
class CallViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val network: SeedsService,
    private val context: Context,
    private val sharedPreferences: SharedPreferences,
    private val teacherRepository: TeacherRepository,
    private val teacherStudentsDirectory: TeacherStudentsDirectory,
    private val contentRepository: ContentRepository,
    private val classroomRepository: ClassroomRepository,
    private val userPreferencesRepository: UserPreferencesRepository
) : ViewModel(){

    private val TAG = "CallViewModel_LOG"

    private val conferenceUrl = Constants.CONTENT_URL
    val args = CallFragmentArgs.fromSavedStateHandle(savedStateHandle)

    val leader = args.leader.toString()

    private var callStarted = false
    
    private var allStudents = listOf<Student>()
    private var teacherStudentsMap: Map<String, Student> = emptyMap()
    
    private lateinit var token: AccessToken
    private var cancelCallOnFailure: Job? = null
    private val sseClient = ConferenceSSEClient()

    // Timestamp of the last play command. Used to ignore spurious "Stopped" SSE events
    // that arrive right after the teacher taps play (e.g., staging confv2server lag).
    private var lastPlayCommandMs = 0L

    val teacherPhoneNumber = "91${teacherRepository.getTeacherPhoneNumber()}"
    
    // Filter out teacher phone
    // args.phoneNumbers should only contain selected students from CallSettingsFragment
    private var phoneNumbers: List<String> = args.phoneNumbers
        .filter { it != teacherPhoneNumber } // Remove teacher phone if present
        .distinct()
        .toMutableList()

    var content: Content? = args.classroom?.contents?.firstOrNull()

    private val client =  OkHttpClient()
    private lateinit var socket: WebSocket
    private val gson = Gson()

    private val _callToken = MutableLiveData<AccessToken>()
    val callToken: LiveData<AccessToken>
        get() = _callToken

    private val _callState = MutableLiveData<List<StudentCallStatus>>()
    val callState: LiveData<List<StudentCallStatus>>
        get() = _callState

    private val _validatedStudents = MutableLiveData<List<Student>>()
    val validatedStudents: LiveData<List<Student>>
        get() = _validatedStudents

    val _isMutedAll = MutableLiveData(true)
    val isMutedAll: LiveData<Boolean>
        get() = _isMutedAll

    private val _connectionLost = MutableLiveData<Boolean>(true)
    val connectionLost: LiveData<Boolean>
        get() = _connectionLost

    private val _isErrorFromIVR = MutableLiveData<String>(null)
    val isErrorFromIVR: LiveData<String>
        get() = _isErrorFromIVR

    val _isMuteOrUnmuteAllDone = MutableLiveData<Boolean>(true)
    val isMuteOrUnmuteAllDone: LiveData<Boolean>
        get() = _isMuteOrUnmuteAllDone

    private val _isAudioControlDone = MutableLiveData<Boolean>(true)
    val isAudioControlDone: LiveData<Boolean>
        get() = _isAudioControlDone

    fun notifyAudioControlStarted() {
        _isAudioControlDone.postValue(false)
    }

    private val _students = MutableLiveData<List<Student>>(emptyList())
    val students: LiveData<List<Student>>
        get() = _students

    var studentsNotOnCall = listOf<Student>()

    private val _allContent = MutableLiveData<List<Content>>()
    val allContent: LiveData<List<Content>>
        get() = _allContent

    private val _selectedContent = MutableLiveData<Content>(content)
    val selectedContent: LiveData<Content>
        get() = _selectedContent

    private val _filteredContent = MutableLiveData<List<Content>>()
    val filteredContent: LiveData<List<Content>>
        get() = _filteredContent

    private val _languages = MutableLiveData<List<String>>()
    val languages: LiveData<List<String>>
        get() = _languages

    private val _experiences = MutableLiveData<List<String>>()
    val experiences: LiveData<List<String>>
        get() = _experiences

    private val _filtersChosen = MutableLiveData<List<String>>()
    val filtersChosen: LiveData<List<String>>
        get() = _filtersChosen

    private val _selectedContentList = MutableLiveData<List<Content>>(args.classroom.contents)
    val selectedContentList: LiveData<List<Content>>
        get() = _selectedContentList

    private val _teacherCallStatus = MutableLiveData<StudentCallStatus>()
    val teacherCallStatus: LiveData<StudentCallStatus>
        get() = _teacherCallStatus

    private val _playerState = MutableLiveData(PlayerState.STOPPED)
    val audioPlaying: LiveData<Boolean> = Transformations.map(_playerState) { state ->
        state == PlayerState.PLAYING
    }
    private val _audioPositionSeconds = MutableLiveData<Float?>(null)
    val audioPositionSeconds: LiveData<Float?> = _audioPositionSeconds
    private val _audioDurationSeconds = MutableLiveData<Float?>(null)
    val audioDurationSeconds: LiveData<Float?> = _audioDurationSeconds

    private val _navigateBack = MutableLiveData(false)
    val navigateBack: LiveData<Boolean>
        get() = _navigateBack

    private val _networkConnected = MutableLiveData<Boolean>()
    val networkConnected: LiveData<Boolean>
        get() = _networkConnected

    private val _participantDropped = MutableLiveData<String?>()
    val participantDropped: LiveData<String?>
        get() = _participantDropped
    private val _participantOnHold = MutableLiveData<String?>()
    val participantOnHold: LiveData<String?>
        get() = _participantOnHold

    
    private val participantTrackers = mutableMapOf<String, ParticipantTracker>()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _networkConnected.postValue(true)
        }

        override fun onLost(network: Network) {
            _networkConnected.postValue(false)
        }
    }

    init {
        if (args.classroom == null) {
            Log.e(TAG, "FATAL: CallViewModel received a null classroom argument.")
            _isErrorFromIVR.postValue("Error: Classroom data is missing.")
            _navigateBack.postValue(true)
        } else {
            viewModelScope.launch {
                loadCorrectStudentNames()
            }

            val selectedStudentPhones = phoneNumbers.toSet()
            val initialCallStatuses = CallUtils.buildInitialCallStatuses(
                args.classroom.students,
                selectedStudentPhones
            )
            _callState.postValue(initialCallStatuses)
            updateStudentsNotOnCall(initialCallStatuses)

            _teacherCallStatus.postValue(
                StudentCallStatus(
                    name = "You (Teacher)",
                    phoneNumber = teacherPhoneNumber,
                    callerState = CallerState.CONNECTING,
                )
            )

            getAccessToken()

            viewModelScope.launch {
                val allContentList = mutableListOf<Content>()
                var nextCursor: String? = null
                var hasMore: Boolean

                do {
                    val response = contentRepository.getAllContent(cursor = nextCursor)
                    allContentList.addAll(response.data)
                    nextCursor = response.pagination.nextCursor
                    hasMore = response.pagination.hasMore
                } while (hasMore)

                val selectedContentListIds = args.classroom.contentIds
                val filteredListContent = allContentList.filter {
                    !selectedContentListIds.contains(it.id)
                }
                _allContent.value = filteredListContent
                _filteredContent.value = filteredListContent 

                _languages.value =
                    filteredListContent.map { it.language.lowercase() }.distinct().map { it.capitalize() }
                _experiences.value = filteredListContent.map { it.type.lowercase() }.distinct().map {
                    it.capitalize()
                }

                restoreSessionState()
            }
        } 
    }

    private suspend fun loadCorrectStudentNames() {
        try {
            Log.d("NAME_FIX", "Starting to repair student names...")
            
            val directoryMap = teacherStudentsDirectory.studentsByPhone()
            
            val studentsFromArgs = args.classroom.students
            val fixedList = studentsFromArgs.map { badStudent ->
                val phone = badStudent.phoneNumber
                
                var correctDetails = directoryMap[phone]
                
                if (correctDetails == null && phone.startsWith("91") && phone.length > 10) {
                     val phoneWithoutPrefix = phone.substring(2)
                     correctDetails = directoryMap[phoneWithoutPrefix]
                }
                if (correctDetails == null && !phone.startsWith("91")) {
                    correctDetails = directoryMap["91$phone"]
                }
                
                if (correctDetails != null) {
                    Log.d("NAME_FIX", "FIXED: ${badStudent.phoneNumber} -> ${correctDetails.name}")
                    badStudent.copy(name = correctDetails.name)
                } else {
                    Log.w("NAME_FIX", "COULD NOT FIX: ${badStudent.phoneNumber}. Keeping original.")
                    badStudent
                }
            }
            
            // 3. Post the corrected list to the UI
            _validatedStudents.postValue(fixedList)
            
        } catch (e: Exception) {
            Log.e("NAME_FIX", "Error repairing names", e)
            _validatedStudents.postValue(args.classroom.students)
        }
    }

    private suspend fun restoreSessionState() {
         try {
            val prefs = userPreferencesRepository.userPrefs.first()
            if (prefs.lastClassroomId == args.classroom._id && prefs.lastCallContentJson.isNotEmpty()) {
                val savedContent = gson.fromJson(prefs.lastCallContentJson, Content::class.java)
                if (savedContent != null) {
                    _selectedContent.value = savedContent
                    content = savedContent 
                }
            }
        } catch (e: Exception) {
            Log.e("RESTORE_DEBUG", "Exception during restore", e)
        }
    }

    fun onPlayPauseClicked() {
        val content = _selectedContent.value ?: return
        when (_playerState.value) {
            PlayerState.PLAYING -> pauseAudio()
            PlayerState.PAUSED -> resumeAudio()
            PlayerState.STOPPED -> playAudio(content.id.toString())
            null -> {}
        }
    }

    fun doneNavigating() {
        _navigateBack.value = false
    }

    fun clearParticipantDroppedNotification() {
        _participantDropped.value = null
    }

    fun clearParticipantOnHoldNotification() {
        _participantOnHold.value = null
    }

    private fun getAccessToken() {
        viewModelScope.launch {
            try {
                val teacherPhoneWithPrefix = "$teacherPhoneNumber"
                val studentPhonesWithPrefix = phoneNumbers.map { "$it" }

                val payload = ConferenceCreateRequest(
                    teacher_phone = teacherPhoneWithPrefix,
                    student_phones = studentPhonesWithPrefix
                )

                val response = withTimeoutOrNull(CONFERENCE_CREATE_TIMEOUT_SECONDS * 1000) {
                    network.getAccessToken(
                        "$conferenceUrl/conference/create",
                        payload
                    )
                } ?: throw TimeoutException("Conference creation timed out")

                val confId = response.id
                Log.d("CONF_ID", "Created conference ID: $confId")

                saveCallStateToPrefs(confId)
                startCall(confId)

            } catch (e: Exception) {
                Log.e("CONFERENCE_CREATE", "Error creating conference: ${e.message}", e)
                _isErrorFromIVR.postValue("Unable to start conference. Please check your connection and try again.")
            }
        }
    }
    
    fun updateClassroomContent(classroom: Classroom) {
        viewModelScope.launch {
            try {
                classroomRepository.updateClassroom(classroom)
            } catch (e: Exception) {
                Log.e("CallViewModel", "Failed to update classroom", e)
            }
        }
    }

    fun setSelectedContent(content: Content){
        _selectedContent.value = content
        viewModelScope.launch {
            val classroomName = args.classroom?.name
            val studentCount = _callState.value?.size ?: 0
            
            userPreferencesRepository.saveContentToHistory(
                content = content,
                classroomName = classroomName,
                studentCount = studentCount,
                wasConference = true 
            )
        }
    }

    fun setSelectedContentList(content: List<Content>){
        _selectedContentList.value = content
    }

    fun setAllContentList(content: List<Content>){
        _allContent.value = content
    }

    fun startSSE(confId: String) {
        val encryptedToken = sharedPreferences.getString("auth_token", null)
        val iv = sharedPreferences.getString("auth_iv", null)
        val authToken = if (encryptedToken != null && iv != null) {
            try {
                Encryptor.decrypt(encryptedToken, iv)
            } catch (e: Exception) {
                Log.e(TAG, "SSE: Failed to decrypt auth token", e)
                null
            }
        } else null

        if (authToken == null) {
            val errorMsg = "Unable to start live updates: Authentication token unavailable. Relogin may be required."
            Log.e(TAG, "SSE: Cannot start — no auth token available")
            _isErrorFromIVR.postValue(errorMsg)
            return
        }

        val url = "$conferenceUrl/conference/teacherappconnect/$confId"
        sseClient.connect(url, authToken) { data ->
            Log.d(TAG, "SSE raw payload in ViewModel: $data")
            handleSSEUpdate(data)
        }
    }

    private fun handleSSEUpdate(data: String) {
        try {
            val json = gson.fromJson(data, com.google.gson.JsonObject::class.java)

            // --- Participants ---
            val participantsObj = json.getAsJsonObject("participants") ?: return
            val students = mutableListOf<StudentCallStatus>()
            var teacherStatus: StudentCallStatus? = null

            for ((phone, el) in participantsObj.entrySet()) {
                val p = el.asJsonObject
                val callerState = try {
                    CallerState.valueOf(p.get("call_status")?.asString?.uppercase() ?: "UNDEFINED")
                } catch (e: IllegalArgumentException) { CallerState.UNDEFINED }

                val status = StudentCallStatus(
                    callerState = callerState,
                    isMuted = p.get("is_muted")?.asBoolean ?: false,
                    phoneNumber = phone,
                    name = p.get("name")?.asString,
                    raiseHand = p.get("is_raised")?.asBoolean ?: false
                )
                if (p.get("role")?.asString == "Teacher") teacherStatus = status
                else {
                    // Detect hold/drop state changes
                    val previousState = updateTrackerFromServerState(phone, callerState)
                    if (previousState == CallerState.CONNECTED && callerState == CallerState.DISCONNECTED) {
                        Log.d("STUDENT_DROP", "Student $phone disconnected, posting notification")
                        _participantDropped.postValue(phone)
                    }
                    if (callerState == CallerState.ON_HOLD && previousState != CallerState.ON_HOLD) {
                        Log.d("STUDENT_HOLD", "Student $phone is on hold, posting notification")
                        _participantOnHold.postValue(phone)
                    }
                    students.add(status)
                }
            }

            _callState.postValue(students)
            teacherStatus?.let { _teacherCallStatus.postValue(it) }

            // --- Audio state ---
            val audioStateObj = json.getAsJsonObject("audio_content_state")
            val audioStatusStr = audioStateObj?.get("status")?.asString ?: "Stopped"
            val newPlayerState = when (audioStatusStr) {
                "Playing", "Starting" -> PlayerState.PLAYING
                "Paused"              -> PlayerState.PAUSED
                else                  -> PlayerState.STOPPED
            }
            // Grace period: ignore SSE "Stopped" events for 5 s after a play command.
            // This prevents staging backend lag (confv2server reconnecting) from
            // immediately reverting the optimistic PLAYING state.
            val inGracePeriod = newPlayerState == PlayerState.STOPPED &&
                (System.currentTimeMillis() - lastPlayCommandMs) < 5_000L
            if (!inGracePeriod && _playerState.value != newPlayerState) {
                _playerState.postValue(newPlayerState)
            }
            // publish position/duration if present
            try {
                val pos = audioStateObj?.get("position_seconds")?.asDouble
                val dur = audioStateObj?.get("duration_seconds")?.asDouble
                _audioPositionSeconds.postValue(pos?.toFloat())
                _audioDurationSeconds.postValue(dur?.toFloat())
            } catch (e: Exception) {
                Log.d(TAG, "SSE: failed to parse position/duration", e)
            }

        } catch (e: Exception) {
            Log.e(TAG, "SSE: Failed to parse update", e)
        }
    }

    private fun startCall(confId: String) {
        viewModelScope.launch {
            try {
                val names = mutableListOf<String>()
                names.add("Teacher")
                // Use phoneNumbers (which only contains selected students)
                for (num in phoneNumbers) {
                    val student = args.classroom.students.find { 
                        val normalizedPhone = if (it.phoneNumber.startsWith("91")) {
                            it.phoneNumber
                        } else {
                            "91${it.phoneNumber}"
                        }
                        it.phoneNumber == num || normalizedPhone == num
                    }
                    if (student != null) names.add(student.name)
                }

                val fullUrl = "$conferenceUrl/conference/start/$confId"
                // Use phoneNumbers which only contains selected students (teacher phone already filtered out)
                val response = network.startCall(fullUrl, CallDetails(confId, phoneNumbers, names))

                if (response.isSuccessful) {
                    _callToken.postValue(AccessToken(confId = confId, accessToken = ""))
                } 
            } catch (e: Exception) {
                Log.e("CALL_START_ERROR", "Error starting conference: ${e.message}", e)
            }
        }
    }

    private fun saveCallStateToPrefs(confId: String) {
        viewModelScope.launch {
            val activeStudentIds = args.classroom?.students
                ?.filter { phoneNumbers.contains(it.phoneNumber) }
                ?.map { it.phoneNumber } 
                ?.toSet() ?: emptySet()

            val classroomId = args.classroom?._id ?: ""
            val classroomName = args.classroom?.name ?: ""

            userPreferencesRepository.saveLastCallDetails(
                conferenceId = confId,
                classroomId = classroomId,
                classroomName = classroomName,
                studentIds = activeStudentIds
            )

            val historyItem = SessionHistoryItem(
                groupId = classroomId,
                groupName = classroomName,
                timestamp = System.currentTimeMillis(),
                wasConference = true,
                studentCount = activeStudentIds.size
            )
            userPreferencesRepository.addSessionToHistory(historyItem)
        }
    }

    fun endCall() {
        val confId = _callToken.value?.confId
        if (confId == null) {
            closeSocket()
            _navigateBack.postValue(true)
            return
        }

        closeSocket()

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/end/$confId"
                val response = network.endCall(fullUrl)

                if (response.isSuccessful) {
                    userPreferencesRepository.clearSession()
                    _navigateBack.postValue(true)
                } else {
                    _navigateBack.postValue(true)
                }
            } catch (e: Exception) {
                _navigateBack.postValue(true)
            }
        }
    }

    private fun closeSocket() {
        try {
            if (this::socket.isInitialized) {
                socket.close(SOCKET_CLOSE, "close")
            }
        } catch (e: Exception) {
            Log.e("CALL_END", "Error closing socket: ${e.message}")
        }
    }

    override fun onCleared() {
        closeSocket()
        sseClient.disconnect()
        participantTrackers.clear()
    }
    
    fun rejoinTeacher() {
        val confId = _callToken.value?.confId ?: return
        val currentStatus = _teacherCallStatus.value ?: return
        _teacherCallStatus.value = currentStatus.copy(callerState = CallerState.CONNECTING)

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/addparticipant/$confId"
                
                val response = network.connectParticipant(fullUrl, teacherPhoneNumber)
                
                if (!response.isSuccessful) {
                    Log.e(TAG, "Failed to rejoin teacher: ${response.code()}")
                    refreshCallState() 
                }
            } catch (e: Exception) {
                Log.e(TAG, "Exception rejoining teacher", e)
                refreshCallState()
            }
        }
    }

    fun refreshCallState() {
        viewModelScope.launch {
            try {
                // Also update local map here
                teacherStudentsMap = teacherStudentsDirectory.studentsByPhone()
                val callStatus = network.getCallStatus(_callToken.value!!.confId).asDomainModel(teacherStudentsMap)
                val networkCallState = callStatus.participants
                
                val serverAudioState = callStatus.audio.state 
                val newPlayerState = when (serverAudioState) {
                    "play" -> PlayerState.PLAYING
                    "pause" -> PlayerState.PAUSED
                    else -> PlayerState.STOPPED
                }

                if (_playerState.value != newPlayerState) {
                    _playerState.postValue(newPlayerState)
                }

                val serverParticipantPhones = networkCallState.mapNotNull { it.phoneNumber }.filter { it != teacherPhoneNumber }.toSet()
                networkCallState
                    .filter { it.phoneNumber != null && it.phoneNumber != teacherPhoneNumber }
                    .forEach { status ->
                        status.phoneNumber?.let {
                            val previousState = updateTrackerFromServerState(it, status.callerState ?: CallerState.UNDEFINED)
                            if (status.callerState == CallerState.ON_HOLD && previousState != CallerState.ON_HOLD) {
                                _participantOnHold.postValue(it)
                            }
                        }
                    }

                val currentStudentList = _callState.value ?: emptyList()
                val removedParticipants = computeRemovedParticipantsAsDisconnected(
                    currentStudentList, serverParticipantPhones, fromRefresh = true
                )

                // Combine server participants and removed participants (as disconnected)
                val combinedList = networkCallState + removedParticipants
                val sortedList = combinedList.sortedByDescending { it.raiseHand }
                
                _callState.postValue(sortedList)
                _teacherCallStatus.postValue(networkCallState.find {it.phoneNumber == teacherPhoneNumber})
                updateStudentsNotOnCall(sortedList)
                _isMutedAll.value = networkCallState.filter { it.phoneNumber != teacherPhoneNumber }.all { it.isMuted }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to refresh call state", e)
            }
        }
    }

    /**
     * Updates [participantTrackers] with server state for [phoneNumber]. Returns the previous state for transition detection.
     */
    private fun updateTrackerFromServerState(phoneNumber: String, newState: CallerState): CallerState? {
        val existing = participantTrackers[phoneNumber]
        val previousState = existing?.currentState
        participantTrackers[phoneNumber] = ParticipantTracker(
            phoneNumber = phoneNumber,
            currentState = newState,
            previousState = previousState,
            hasBeenInCall = true
        )
        return previousState
    }

    /**
     * Participants that are in [currentStudentList] and were in the call but are no longer in [serverParticipantPhones].
     * They are returned as DISCONNECTED so they can be reconnected. [participantTrackers] is updated as a side effect.
     * [fromRefresh] only affects the log message (e.g. "in refresh").
     */
    private fun computeRemovedParticipantsAsDisconnected(
        currentStudentList: List<StudentCallStatus>,
        serverParticipantPhones: Set<String>,
        fromRefresh: Boolean = false
    ): List<StudentCallStatus> {
        val logSuffix = if (fromRefresh) " in refresh" else ""
        return currentStudentList
            .filter { it.phoneNumber != null }
            .filter { it.phoneNumber !in serverParticipantPhones }
            .filter { participant -> participantTrackers[participant.phoneNumber]?.hasBeenInCall == true }
            .mapNotNull { participant ->
                val phoneNumber = participant.phoneNumber ?: return@mapNotNull null
                val tracker = participantTrackers[phoneNumber] ?: return@mapNotNull null
                val wasConnected = tracker.previousState == CallerState.CONNECTED || participant.callerState == CallerState.CONNECTED
                if (wasConnected) {
                    Log.d("PARTICIPANT_REMOVED", "Keeping removed participant $phoneNumber as DISCONNECTED$logSuffix")
                    participantTrackers[phoneNumber] = tracker.copy(
                        currentState = CallerState.DISCONNECTED,
                        previousState = tracker.currentState
                    )
                    participant.copy(callerState = CallerState.DISCONNECTED)
                } else null
            }
    }

    private fun updateStudentsNotOnCall(currentState: List<StudentCallStatus>?) {
        if (currentState == null || allStudents.isEmpty()) {
            return
        }
        studentsNotOnCall = allStudents.filter { stu ->
            val status = currentState.find { it.phoneNumber == stu.phoneNumber }
            status == null || when(status.callerState) {
                CallerState.COMPLETED,
                CallerState.FAILED,
                CallerState.REJECTED,
                CallerState.CANCELLED,
                CallerState.UNANSWERED,
                CallerState.BUSY -> true
                else -> false
            }
        }
        _students.postValue(studentsNotOnCall)
    }

    fun getStudentName(phoneNumber: String): String {
        return teacherStudentsMap[phoneNumber]?.name
            ?: args.classroom.students.find { it.phoneNumber == phoneNumber }?.name
            ?: phoneNumber
    }

    fun filterContent(languages: MutableSet<String>, experiences: MutableSet<String>) {
        val languagesChosen = languages.map { it.lowercase() }.toMutableSet()
        val experiencesChosen = experiences.map { it.lowercase() }.toMutableSet()

        _filteredContent.value = when {
            languages.isEmpty() && experiences.isEmpty() -> allContent.value
            languages.isEmpty() -> allContent.value?.filter { experiencesChosen.contains(it.type.lowercase()) }
            experiences.isEmpty() -> allContent.value?.filter { languagesChosen.contains(it.language.lowercase()) }
            else -> allContent.value?.filter {
                languagesChosen.contains(it.language.lowercase()) && experiencesChosen.contains(it.type.lowercase())
            }
        }
    }

    fun clearFilters() {
        _filteredContent.value = allContent.value
    }

    fun setFiltersChosen(filters: List<String>) {
        _filtersChosen.value = filters
    }

    private fun message(message: String) {
        if (message.contains("refresh")) {
            refreshCallState()
        } else if(message.contains("muteAllDone") || message.contains("unMuteAllDone")) {
             refreshCallState()
             _isMuteOrUnmuteAllDone.postValue(true)
        } else if(message.contains("playDone") || message.contains("pauseDone") || message.contains("resumeDone")){
            _isAudioControlDone.postValue(true)
            refreshCallState()
        } else if(message.contains("muteDone:") || message.contains("unmuteDone")){
            val phoneNumber = message.split(":")[1]
            val tempCallState = callState.value!!.toMutableList()
            val index = tempCallState.indexOfFirst { it.phoneNumber == phoneNumber }
            index.let {
                if (it != -1) tempCallState[it].isMuteUnmuteDone = true
            }
            _callState.postValue(tempCallState)
            refreshCallState()
        }
        else if (message.contains("vonageWebsocket:disconnected") || message.contains("vonageWebsocket:failed")) {
            _connectionLost.postValue(true)
        } else if (message.contains("vonageWebsocket:connected")) {
            if(!args.leader.isNullOrEmpty()){
                // socket.send("lead:${args.leader}")
            }
            _connectionLost.postValue(false)
        } else if (message.contains("error")){
            _isErrorFromIVR.postValue(message)
        }
    }

    fun onMuteToggle(student: StudentCallStatus) {
        if (student.isMuted) {
            unmuteParticipant(student.phoneNumber)
        } else {
            muteParticipant(student.phoneNumber)
        }
    }

    fun muteParticipant(phoneNumber: String?) {
        if (phoneNumber == null) return 
        val confId = _callToken.value?.confId ?: return

        val currentList = _callState.value?.toMutableList() ?: return
        val studentIndex = currentList.indexOfFirst { it.phoneNumber == phoneNumber }
        if (studentIndex != -1) {
            currentList[studentIndex] = currentList[studentIndex].copy(isMuted = true)
            _callState.postValue(currentList) 
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/muteparticipant/$confId"
                val response = network.muteParticipant(fullUrl, phoneNumber)
                if (!response.isSuccessful) refreshCallState()
            } catch (e: Exception) {
                refreshCallState() 
            }
        }
    }

    fun unmuteParticipant(phoneNumber: String?) {
        if (phoneNumber == null) return 
        val confId = _callToken.value?.confId ?: return

        val currentList = _callState.value?.toMutableList() ?: return
        val studentIndex = currentList.indexOfFirst { it.phoneNumber == phoneNumber }
        if (studentIndex != -1) {
            currentList[studentIndex] = currentList[studentIndex].copy(isMuted = false)
            _callState.postValue(currentList) 
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/unmuteparticipant/$confId"
                val response = network.unmuteParticipant(fullUrl, phoneNumber)
                if (!response.isSuccessful) refreshCallState()
            } catch (e: Exception) {
                refreshCallState()
            }
        }
    }

    fun toggleMuteAll() {
        val isCurrentlyMuted = _isMutedAll.value == true
        if (isCurrentlyMuted) {
            unmuteAll()
            _isMutedAll.value = false
        } else {
            muteAll()
            _isMutedAll.value = true
        }
        _isMuteOrUnmuteAllDone.value = false
    }

    fun connectParticipant(name: String, phoneNumber: String) {
        val confId = _callToken.value?.confId ?: return
        val currentList = _callState.value?.toMutableList() ?: return

        val existing = participantTrackers[phoneNumber]
        participantTrackers[phoneNumber] = ParticipantTracker(
            phoneNumber = phoneNumber,
            currentState = CallerState.RINGING,
            previousState = existing?.currentState,
            hasBeenInCall = true
        )

        val studentIndex = currentList.indexOfFirst { it.phoneNumber == phoneNumber }
        if (studentIndex != -1) {
            currentList[studentIndex] = currentList[studentIndex].copy(callerState = CallerState.RINGING)
            _callState.postValue(currentList) 
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/addparticipant/$confId"
                val response = network.connectParticipant(fullUrl, phoneNumber)
                if (!response.isSuccessful) refreshCallState() 
            } catch (e: Exception) {
                refreshCallState() 
            }
        }
    }


    fun disconnectParticipant(phoneNumber: String) {
        val confId = _callToken.value?.confId ?: return
        val currentList = _callState.value?.toMutableList() ?: return
        
        val tracker = participantTrackers[phoneNumber]
        if (tracker != null) {
            participantTrackers[phoneNumber] = tracker.copy(
                currentState = CallerState.DISCONNECTED,
                previousState = tracker.currentState
            )
        }

        val updatedList = currentList.map { participant ->
            if (participant.phoneNumber == phoneNumber) participant.copy(callerState = CallerState.DISCONNECTED)
            else participant
        }.toMutableList()
        _callState.postValue(updatedList)

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/removeparticipant/$confId"
                val response = network.disconnectParticipant(fullUrl, phoneNumber)
                if (!response.isSuccessful) {
                    // On failure, refresh to get server state
                    refreshCallState()
                }
                // On success, next polling cycle will handle the state correctly
                // The participant will be kept as DISCONNECTED by the polling logic
            } catch (e: Exception) {
                // On exception, refresh to get server state
                refreshCallState()
            }
        }
    }
    
    fun unmuteAll() {
        val confId = _callToken.value?.confId ?: return
        
        // Optimistic update: Mark all students as unmuted
        val currentList = _callState.value?.toMutableList() ?: return
        val updatedList = currentList.map { participant ->
            if (participant.phoneNumber != teacherPhoneNumber) {
                participant.copy(isMuted = false)
            } else {
                participant
            }
        }.toMutableList()
        _callState.postValue(updatedList)
        _isMuteOrUnmuteAllDone.postValue(false)

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/unmuteall/$confId"
                val response = network.unmuteAll(fullUrl)
                if (response.isSuccessful) {
                    // Success - refresh to get actual server state
                    refreshCallState()
                } else {
                    // Failed - revert optimistic update
                    refreshCallState()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to unmute all", e)
                refreshCallState()
            } finally {
                _isMuteOrUnmuteAllDone.postValue(true)
            }
        }
    }

    fun muteAll() {
        val confId = _callToken.value?.confId ?: return
        
        // Optimistic update: Mark all students as muted
        val currentList = _callState.value?.toMutableList() ?: return
        val updatedList = currentList.map { participant ->
            if (participant.phoneNumber != teacherPhoneNumber) {
                participant.copy(isMuted = true)
            } else {
                participant
            }
        }.toMutableList()
        _callState.postValue(updatedList)
        _isMuteOrUnmuteAllDone.postValue(false)

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/muteall/$confId"
                val response = network.muteAll(fullUrl)
                if (response.isSuccessful) {
                    // Success - refresh to get actual server state
                    refreshCallState()
                } else {
                    // Failed - revert optimistic update
                    refreshCallState()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to mute all", e)
                refreshCallState()
            } finally {
                _isMuteOrUnmuteAllDone.postValue(true)
            }
        }
    }

    fun sendAudioCommand(action: String, newStateOnSuccess: PlayerState) {
        val confId = _callToken.value?.confId
        if (confId == null) {
            _isErrorFromIVR.postValue("Conference not initialized")
            _isAudioControlDone.postValue(true) 
            return
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/${action.lowercase()}audio/$confId"
                val response = network.audioCommand(fullUrl)

                if (response.isSuccessful) {
                    _playerState.postValue(newStateOnSuccess)
                } else {
                    _isErrorFromIVR.postValue("Failed to $action audio: ${response.code()}")
                    refreshCallState()
                }
            } catch (e: Exception) {
                _isErrorFromIVR.postValue("Error: ${e.message}")
                refreshCallState()
            } finally {
                _isAudioControlDone.postValue(true)
            }
        }
    }

    fun playAudio(audioId: String) {
        val selectedContentObj = selectedContent.value

        if (selectedContentObj == null) {
            _isErrorFromIVR.postValue("No content selected")
            return
        }

        // Optimistic update: switch to PLAYING immediately so the pause icon
        // appears on tap without waiting for the network round-trip.
        _isAudioControlDone.postValue(false)
        _playerState.postValue(PlayerState.PLAYING)
        lastPlayCommandMs = System.currentTimeMillis()

        viewModelScope.launch {
            try {
                val confId = _callToken.value?.confId
                if (confId == null) {
                    _isErrorFromIVR.postValue("Conference not initialized")
                    _playerState.postValue(PlayerState.STOPPED)
                    return@launch
                }

                val audioUrl = when {
                    selectedContentObj.audioContent.isNotEmpty() -> selectedContentObj.audioContent.first().audioUrl
                    selectedContentObj.title?.audioUrl != null -> selectedContentObj.title.audioUrl
                    selectedContentObj.theme?.audioUrl != null -> selectedContentObj.theme.audioUrl
                    else -> null
                }

                if (audioUrl.isNullOrEmpty()) {
                    _isErrorFromIVR.postValue("No audio available")
                    _playerState.postValue(PlayerState.STOPPED)
                    return@launch
                }

                val contentId = selectedContent.value?.id ?: ""
                userPreferencesRepository.saveLastCallContent(
                    content = selectedContentObj,
                    classroomName = args.classroom?.name,
                    studentCount = _callState.value?.size,
                    wasConference = true
                )
                userPreferencesRepository.saveAudioState(contentId, true)

                val fullUrl = "$conferenceUrl/conference/playaudio/$confId"
                val response = network.playAudio(fullUrl, audioUrl)

                if (!response.isSuccessful) {
                    _isErrorFromIVR.postValue("Failed to play audio: ${response.code()}")
                    _playerState.postValue(PlayerState.STOPPED)
                }
                // On success: state is already PLAYING from the optimistic update above.
            } catch (e: Exception) {
                _isErrorFromIVR.postValue("Error: ${e.message}")
                _playerState.postValue(PlayerState.STOPPED)
            } finally {
                _isAudioControlDone.postValue(true)
            }
        }
    }

    fun pauseAudio(audioId: String? = null) = sendAudioCommand("Pause", PlayerState.PAUSED)
    fun resumeAudio(audioId: String? = null) = sendAudioCommand("Resume", PlayerState.PLAYING)

    fun seekAudio(deltaSeconds: Int) {
        val confId = _callToken.value?.confId
        if (confId == null) return

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/seekaudio/$confId?delta_seconds=$deltaSeconds"
                val response = network.seekAudio(fullUrl) 

                if (!response.isSuccessful) {
                    _isErrorFromIVR.postValue("Failed to seek audio")
                }
            } catch (e: Exception) {
                _isErrorFromIVR.postValue("Error: ${e.message}")
            } finally {
                _isAudioControlDone.postValue(true)
            }
        }
    }
    
    fun forwardAudio() {
        seekAudio(10)
    }

    fun backwardAudio() {
        seekAudio(-10)
    }

    // Seek to absolute position (seconds)
    fun seekTo(positionSeconds: Float) {
        val confId = _callToken.value?.confId ?: return
        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/seekaudio/$confId?position_seconds=$positionSeconds"
                val response = network.seekAudio(fullUrl)
                if (!response.isSuccessful) {
                    _isErrorFromIVR.postValue("Failed to seek audio")
                }
            } catch (e: Exception) {
                _isErrorFromIVR.postValue("Error: ${e.message}")
            } finally {
                _isAudioControlDone.postValue(true)
            }
        }
    }

    // Set playback speed
    fun setPlaybackSpeed(speed: Double) {
        val confId = _callToken.value?.confId ?: return
        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/setplaybackspeed/$confId"
                val response = network.setPlaybackSpeed(fullUrl, speed)
                if (!response.isSuccessful) {
                    _isErrorFromIVR.postValue("Failed to set playback speed")
                }
            } catch (e: Exception) {
                _isErrorFromIVR.postValue("Error: ${e.message}")
            } finally {
                _isAudioControlDone.postValue(true)
            }
        }
    }

    fun prepareStudentListForAdding() {
        if (allStudents.isEmpty()) {
            viewModelScope.launch {
                loadTeacherStudents()
            }
        }
    }

    private suspend fun loadTeacherStudents() {
        try {
            teacherStudentsMap = teacherStudentsDirectory.studentsByPhone()
            allStudents = teacherStudentsMap.values.toList()
            updateStudentsNotOnCall(_callState.value)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load teacher students", e)
        }
    }

    inner class SeedsWebSocketListener: WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            super.onOpen(webSocket, response)
            cancelCallOnFailure?.cancel()
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            super.onMessage(webSocket, text)
            message(text)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.d("SOCKETFAILURE", t.message.toString())
            socket.close(SOCKET_CLOSE, null)
            Thread.sleep(THREAD_SLEEP_TIME)
            cancelCallOnFailure = viewModelScope.launch {
                delay(DELAY_FOR_VIEW_MODEL) 
                _navigateBack.postValue(true)
            }
        }
    }

    fun startNetworkCallback() {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val networkRequest = NetworkRequest.Builder().build()
        connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
    }

}
