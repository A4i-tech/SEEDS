package com.example.seeds.ui.call

import NetworkConnectivityLiveData
import android.app.Application
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
import com.example.seeds.model.StudentCallStatus
import com.example.seeds.model.PlayerState
import com.example.seeds.model.SessionHistoryItem
import com.example.seeds.network.SeedsService
import com.example.seeds.network.asDomainModel
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.repository.UserPreferencesRepository
import com.example.seeds.utils.Constants
import com.example.seeds.utils.ContactUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive 
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import javax.inject.Inject

const val SOCKET_CLOSE = 1000   
const val THREAD_SLEEP_TIME = 5000L
const val DELAY_FOR_VIEW_MODEL = 180000L
const val DELAY_FOR_LAUNCH = 120000L
const val POLLING_INTERVAL_MS = 5000L 


@HiltViewModel
class CallViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val network: SeedsService,
    private val context: Context,

//    @ApplicationContext private val context: Context,
    private val sharedPreferences: SharedPreferences,
    private val teacherRepository: TeacherRepository,
    private val contentRepository: ContentRepository,
    private val classroomRepository: ClassroomRepository,
    private val userPreferencesRepository: UserPreferencesRepository
//    val networkConnectivityLiveData: NetworkConnectivityLiveData
    ) : ViewModel(){

    private val TAG = "CallViewModel_LOG"

    private val contactUtils = ContactUtils(context)
    private val conferenceUrl = Constants.CONTENT_URL
    val args = CallFragmentArgs.fromSavedStateHandle(savedStateHandle)

    val leader = args.leader.toString()

    private var callStarted = false
    private var phoneNumbers: List<String> = args.phoneNumbers.toMutableList()
    private var allStudents = listOf<Student>()
    private lateinit var token: AccessToken
    private var cancelCallOnFailure: Job? = null
    private var knownStateVersion = 0
    private var isPollingStarted = false

    val teacherPhoneNumber = "91${teacherRepository.getTeacherPhoneNumber()}"
    // Log.d("PAYLOAD_DEBUG","Teacher: $teacherPhoneNumber")

    var content: Content? = args.classroom?.contents?.firstOrNull()

    private val client =  OkHttpClient()
    private lateinit var socket: WebSocket

    private val _callToken = MutableLiveData<AccessToken>()
    val callToken: LiveData<AccessToken>
        get() = _callToken

    private val _callState = MutableLiveData<List<StudentCallStatus>>()
    val callState: LiveData<List<StudentCallStatus>>
        get() = _callState

    val _isMutedAll = MutableLiveData(false)
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

    val _isAudioControlDone = MutableLiveData<Boolean>(true)
    val isAudioControlDone: LiveData<Boolean>
        get() = _isAudioControlDone

    private val _students = MutableLiveData<List<Student>>()
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

    private val _navigateBack = MutableLiveData(false)
    val navigateBack: LiveData<Boolean>
        get() = _navigateBack

    private val _networkConnected = MutableLiveData<Boolean>()
    val networkConnected: LiveData<Boolean>
        get() = _networkConnected

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
            Log.e(TAG, "FATAL: CallViewModel received a null classroom argument. Cannot proceed.")
            _isErrorFromIVR.postValue("Error: Classroom data is missing.")
            _navigateBack.postValue(true)
        } else {

            val initialCallStatuses = args.classroom.students.map { student ->
                StudentCallStatus(
                    name = student.name,
                    phoneNumber = student.phoneNumber,
                    callerState = CallerState.RINGING,
                    isMuted = false,
                    onHold = false,
                    raiseHand = false
                )
            }
            _callState.postValue(initialCallStatuses)

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
            }
        } 

        Log.d("CONTENTCALL", args.classroom?.contents?.map { content -> content.title }?.toString() ?: "No content")
    }

    fun onPlayPauseClicked() {
        val content = _selectedContent.value ?: return

        when (_playerState.value) {
            PlayerState.PLAYING -> {
                pauseAudio()
            }
            PlayerState.PAUSED -> {
                resumeAudio()
            }
            PlayerState.STOPPED -> {
                playAudio(content.id.toString())
            }
            null -> {
            }
        }
    }

    fun doneNavigating() {
        _navigateBack.value = false
    }

    private fun getAccessToken() {
        viewModelScope.launch {
            try {
                val teacherPhoneWithPrefix = "$teacherPhoneNumber"
                
                val studentPhonesWithPrefix = phoneNumbers.map { "$it" }

                Log.d("PAYLOAD_DEBUG", "Teacher: $teacherPhoneWithPrefix")
                Log.d("PAYLOAD_DEBUG", "Students: $studentPhonesWithPrefix")
                
                val payload = ConferenceCreateRequest(
                    teacher_phone = teacherPhoneWithPrefix,
                    student_phones = studentPhonesWithPrefix
                )

                val response = network.getAccessToken(
                    "$conferenceUrl/conference/create",
                    payload
                )

                val confId = response.id
                Log.d("CONF_ID", "Created conference ID: $confId")

                saveCallStateToPrefs(confId)
                startCall(confId)

            } catch (e: Exception) {
                Log.e("GET_ACCESS_TOKEN", "Error creating conference: ${e.message}", e)
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
    }

    fun setSelectedContentList(content: List<Content>){
        _selectedContentList.value = content
    }


    fun setAllContentList(content: List<Content>){
        _allContent.value = content
    }

    fun startPollingForCallerState(confId: String) {
        if (isPollingStarted) return
        isPollingStarted = true
        Log.i(TAG, ">>>> POLLING STARTED for conference ID: $confId <<<<")

        viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val fullUrl = "$conferenceUrl/callerstate/$confId"
                    val response = network.getCallerState(fullUrl)

                    if (response.isSuccessful) {
                        when (response.code()) {
                            200 -> {
                                val partialStateMap = response.body()
                                val newVersion = response.headers()["X-State-Version"]?.toIntOrNull()

                                if (partialStateMap != null && newVersion != null) {
                                    if (newVersion > knownStateVersion) {
                                        knownStateVersion = newVersion
                                        
                                        Log.d("POLLING_DEBUG", "----------------- NEW STATE RECEIVED (Version: $newVersion) -----------------")
                                        Log.d("POLLING_DEBUG", "Partial Server Map Received: $partialStateMap")

                                        val teacherPartialUpdate = partialStateMap[teacherPhoneNumber]
                                        if (teacherPartialUpdate != null) {
                                            val currentTeacherStatus = _teacherCallStatus.value
                                            if(currentTeacherStatus != null) {
                                                val newTeacherStatus = currentTeacherStatus.copy(
                                                    callerState = teacherPartialUpdate.callerState,
                                                    isMuted = teacherPartialUpdate.isMuted,
                                                    onHold = teacherPartialUpdate.onHold,
                                                    raiseHand = teacherPartialUpdate.raiseHand
                                                )
                                                Log.d("POLLING_DEBUG", ">>> POSTING Teacher Status to UI: $newTeacherStatus")
                                                _teacherCallStatus.postValue(newTeacherStatus)
                                            }
                                        } else {
                                            Log.w("POLLING_DEBUG", "!!! Teacher status NOT FOUND in server map for key: $teacherPhoneNumber")
                                        }
                                        val currentStudentList = _callState.value ?: emptyList()
                                        val currentStudentMap = currentStudentList.associateBy { it.phoneNumber }
                                        val newStudentList = partialStateMap
                                            .filter { it.key != teacherPhoneNumber } 
                                            .map { (phoneNumber, partialUpdate) ->
                                                val existingStudent = currentStudentMap[phoneNumber]
                                                StudentCallStatus(
                                                    name = existingStudent?.name ?: phoneNumber,
                                                    phoneNumber = phoneNumber,
                                                    callerState = partialUpdate.callerState,
                                                    isMuted = partialUpdate.isMuted,
                                                    onHold = partialUpdate.onHold,
                                                    raiseHand = partialUpdate.raiseHand,
                                                    isMuteUnmuteDone = existingStudent?.isMuteUnmuteDone ?: true
                                                )
                                            }

                                        Log.d("POLLING_DEBUG", ">>> POSTING Student List to UI: $newStudentList")
                                        _callState.postValue(newStudentList.sortedByDescending { it.raiseHand })

                                        Log.d("POLLING_DEBUG", "------------------------------------------------------------------\n")
                                    }
                                }
                            }
                            204 -> { /* No Content. No state change. */ }
                        }
                    } else {
                        Log.w(TAG, "Polling: Received unsuccessful response: ${response.code()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Polling: An exception occurred", e)
                }
                delay(POLLING_INTERVAL_MS)
            }
        }
    }

    private fun startCall(confId: String) {
        viewModelScope.launch {
            try {
                val names = mutableListOf<String>()
                names.add("Teacher")
                for (num in args.phoneNumbers.drop(1)) {
                    val student = args.classroom.students.find { it.phoneNumber == num }
                    if (student != null) names.add(student.name)
                }

                val fullUrl = "$conferenceUrl/conference/start/$confId"
                val response = network.startCall(fullUrl, CallDetails(confId, phoneNumbers, names))

                if (response.isSuccessful) {
                    Log.d("CALL_START", "Conference started successfully!")
                    _callToken.postValue(AccessToken(confId = confId, accessToken = ""))
                } else {
                    Log.e("CALL_START", "Failed to start conference: ${response.code()} - ${response.message()}")
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
        Log.d("CALL_END", "endCall() called")

        val confId = _callToken.value?.confId
        Log.d("CALL_END", "Conference ID: $confId")

        if (confId == null) {
            Log.e("CALL_END", "Conference ID is null, cannot end call")
            closeSocket()
            _navigateBack.postValue(true)
            return
        }

        closeSocket()

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/end/$confId"
                Log.d("CALL_END", "Full URL: $fullUrl")
                Log.d("CALL_END", "About to call network.endCall()...")

                val response = network.endCall(fullUrl)

                Log.d("CALL_END", "Got response from network.endCall()")
                Log.d("CALL_END", "Response code: ${response.code()}")
                Log.d("CALL_END", "Response message: ${response.message()}")

                if (response.isSuccessful) {
                    Log.d("CALL_END", "Conference ended successfully!")
                    
                    userPreferencesRepository.clearSession()
                    _navigateBack.postValue(true)

                } else {
                    Log.e("CALL_END", "Failed to end conference: ${response.code()} - ${response.message()}")
                    try {
                        Log.e("CALL_END", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("CALL_END", "Could not read error body: ${e.message}")
                    }
                    _navigateBack.postValue(true)
                }
            } catch (e: Exception) {
                Log.e("CALL_END_ERROR", "Exception in endCall: ${e.message}", e)
                _navigateBack.postValue(true)
            }
        }
    }

    private fun closeSocket() {
        try {
            if (this::socket.isInitialized) {
                Log.d("CALL_END", "Closing socket")
                socket.close(SOCKET_CLOSE, "close")
            }
        } catch (e: Exception) {
            Log.e("CALL_END", "Error closing socket: ${e.message}")
        }
    }

    override fun onCleared() {
        Log.d("CALL_END", "onCleared() called")
        closeSocket()
    }

    fun refreshCallState() {
        viewModelScope.launch {
            val callStatus = network.getCallStatus(_callToken.value!!.confId).asDomainModel(contactUtils)
            val networkCallState = callStatus.participants
            Log.d("STATEOFCALL", callStatus.toString())
            val serverAudioState = callStatus.audio.state 
            val newPlayerState = when (serverAudioState) {
                "play" -> PlayerState.PLAYING
                "pause" -> PlayerState.PAUSED
                else -> PlayerState.STOPPED
            }

            if (_playerState.value != newPlayerState) {
                _playerState.postValue(newPlayerState)
            }

            Log.d("AUDIOCONTROLNETWORK", callStatus.audio.toString())
            _callState.postValue(networkCallState.sortedByDescending { it.raiseHand })
            Log.d("REFRESHED NETWORK CALL STATE", networkCallState.toString())
            _teacherCallStatus.postValue(networkCallState.find {it.phoneNumber == teacherPhoneNumber})
            Log.d("TEACHERCALLSTATUS", _teacherCallStatus.value.toString())
            studentsNotOnCall = allStudents.filter { stu ->
                networkCallState.find { stu.phoneNumber == it.phoneNumber } == null
                        || when(networkCallState.find { stu.phoneNumber == it.phoneNumber }?.callerState) {
                                CallerState.COMPLETED, 
                                CallerState.FAILED, 
                                CallerState.REJECTED, 
                                CallerState.CANCELLED, 
                                CallerState.UNANSWERED, 
                                CallerState.BUSY -> true
                                else -> false
                            }
            }
            _isMutedAll.value = networkCallState.filter { it.phoneNumber != teacherPhoneNumber }.all { it.isMuted }
        }
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
        //_filtersChosen.value = listOf()
        _filteredContent.value = allContent.value
    }

    fun setFiltersChosen(filters: List<String>) {
        _filtersChosen.value = filters
    }

    private fun message(message: String) {
        Log.d("MESSAGE", message)

        if (message.contains("refresh")) {
            refreshCallState()
        // } else if (message.contains("forwardStreamDone")){
        //     _forwardStreamDone.postValue(true)
        // } else if(message.contains("backwardStreamDone")){
        //     _backwardStreamDone.postValue(true)
        } else if(message.contains("muteAllDone") || message.contains("unMuteAllDone")) {
             refreshCallState()
             _isMuteOrUnmuteAllDone.postValue(true)
        } else if(message.contains("playDone") || message.contains("pauseDone") || message.contains("resumeDone")){
            Log.d("AUDIOCONTROLMESSAGE", message)
            _isAudioControlDone.postValue(true)
            refreshCallState()
//            Log.d("AUDIOCONTROL CURRENT", audioPlaying.value!!.toString())
        } else if(message.contains("muteDone:") || message.contains("unmuteDone")){
            val phoneNumber = message.split(":")[1]
            Log.d("MUTEUNMUTEDONE", phoneNumber)
            val tempCallState = callState.value!!.toMutableList()
            val index = tempCallState?.indexOfFirst { it.phoneNumber == phoneNumber }
            Log.d("MUTEUNMUTEDONEIN1", index.toString())
            index?.let {
                tempCallState[it].isMuteUnmuteDone = true
            }
            Log.d("MUTEUNMUTEDONEIN2", tempCallState[index!!].toString())
            _callState.postValue(tempCallState)
            Log.d("MUTEUNMUTEDONEIN3", tempCallState[index!!].toString())
            refreshCallState()
            Log.d("MUTEUNMUTEDONEIN4",  _callState.value!![index!!].toString())
        }
        else if (message.contains("vonageWebsocket:disconnected") || message.contains("vonageWebsocket:failed")) {
            Log.d("VONAGESENDINGWEBSOCCKETDISCONNECTED", message)
            _connectionLost.postValue(true)
        } else if (message.contains("vonageWebsocket:connected")) {
            Log.d("Message", message)
            //TODO: Put leader code here.
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

                if (!response.isSuccessful) {
                    Log.e("API_ACTION", "Server failed to mute $phoneNumber. Reverting UI.")
                    refreshCallState()
                }
            } catch (e: Exception) {
                Log.e("API_ACTION_ERROR", "Exception muting. Reverting UI.", e)
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
            _callState.postValue(currentList) // Update the UI immediately
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/unmuteparticipant/$confId"
                val response = network.unmuteParticipant(fullUrl, phoneNumber)

                if (!response.isSuccessful) {
                    Log.e("API_ACTION", "Server failed to unmute $phoneNumber. Reverting UI.")
                    refreshCallState()
                }
            } catch (e: Exception) {
                Log.e("API_ACTION_ERROR", "Exception unmuting. Reverting UI.", e)
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
        val studentIndex = currentList.indexOfFirst { it.phoneNumber == phoneNumber }
        if (studentIndex != -1) {
            currentList[studentIndex] = currentList[studentIndex].copy(callerState = CallerState.RINGING)
            // currentList[studentIndex] = currentList[studentIndex].copy(callerState = CallerState.RINGING)
            _callState.postValue(currentList) 
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/addparticipant/$confId"
                val response = network.connectParticipant(fullUrl, phoneNumber)

                if (!response.isSuccessful) {
                    Log.e("API_ACTION", "Server failed to connect $phoneNumber. Reverting UI.")
                    refreshCallState()
                }
            } catch (e: Exception) {
                Log.e("API_ACTION_ERROR", "Exception connecting participant. Reverting UI.", e)
                refreshCallState() 
            }
        }
    }


    fun disconnectParticipant(phoneNumber: String) {
        val confId = _callToken.value?.confId ?: return
        // Immediately update the UI to show DISCONNECTED state for the participant
        val currentList = _callState.value?.toMutableList() ?: return
        val updatedList = currentList.map { participant ->
            if (participant.phoneNumber == phoneNumber) {

                participant.copy(callerState = CallerState.TIMEOUT)
            } else {
                participant
            }
        }.toMutableList()
        _callState.postValue(updatedList)

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/removeparticipant/$confId"
                val response = network.disconnectParticipant(fullUrl, phoneNumber)

                if (response.isSuccessful) {
                    Log.d("API_ACTION", "$phoneNumber disconnected successfully from server.")
                    // For now, it will remain in the list as DISCONNECTED
                } else {
                    Log.e("API_ACTION", "Server failed to disconnect $phoneNumber. Reverting UI.")
                    refreshCallState() 
                }
            } catch (e: Exception) {
                Log.e("API_ACTION_ERROR", "Exception disconnecting participant. Reverting UI.", e)
                refreshCallState()
            }
        }
    }
    
    fun unmuteAll() {
        socket.send("unMuteAll")
    }

    fun muteAll() {
        socket.send("muteAll")
    }

    fun sendAudioCommand(action: String, newStateOnSuccess: PlayerState) {
        Log.d("AUDIO_COMMAND", "$action() called")

        val confId = _callToken.value?.confId
        Log.d("AUDIO_COMMAND", "Conference ID: $confId")

        if (confId == null) {
            Log.e("AUDIO_COMMAND", "Conference ID is null, cannot send command.")
            _isErrorFromIVR.postValue("Conference not initialized")
            _isAudioControlDone.postValue(true) 
            return
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/${action.lowercase()}audio/$confId"
                Log.d("AUDIO_COMMAND", "Sending $action request to: $fullUrl")

                val response = network.audioCommand(fullUrl)
                Log.d("AUDIO_COMMAND", "Response received - Code: ${response.code()}")

                if (response.isSuccessful) {
                    Log.d("AUDIO_COMMAND", "Audio $action request successful. Updating state.")
                    _playerState.postValue(newStateOnSuccess)
                } else {
                    Log.e("AUDIO_COMMAND", "Failed to $action audio: ${response.code()} - ${response.message()}")
                    _isErrorFromIVR.postValue("Failed to $action audio: ${response.code()}")
                    refreshCallState()
                    try {
                        Log.e("AUDIO_COMMAND", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("AUDIO_COMMAND", "Could not read error body")
                    }
                }
            } catch (e: Exception) {
                Log.e("AUDIO_COMMAND_ERROR", "Exception in $action: ${e.message}", e)
                _isErrorFromIVR.postValue("Error: ${e.message}")
                refreshCallState()
            } finally {
                _isAudioControlDone.postValue(true)
            }
        }
    }

    fun playAudio(audioId: String) {
        Log.d("PLAY_AUDIO", "playAudio() called with audioId: $audioId")
        
        val selectedContentObj = selectedContent.value
        Log.d("PLAY_AUDIO", "Selected content: $selectedContentObj")
        
        if (selectedContentObj == null) {
            Log.e("PLAY_AUDIO", "No content selected")
            _isErrorFromIVR.postValue("No content selected")
            _isAudioControlDone.postValue(true) // Re-enable button on immediate failure
            return
        }
        
        viewModelScope.launch {
            try {
                val confId = _callToken.value?.confId
                Log.d("PLAY_AUDIO", "Conference ID: $confId")
                
                if (confId == null) {
                    Log.e("PLAY_AUDIO", "Conference ID is null")
                    _isErrorFromIVR.postValue("Conference not initialized")
                    _isAudioControlDone.postValue(true) // Re-enable button
                    return@launch
                }
                
                val audioUrl = when {
                    selectedContentObj.audioContent.isNotEmpty() -> {
                        Log.d("PLAY_AUDIO", "Using audioContent URL")
                        selectedContentObj.audioContent.first().audioUrl
                    }
                    selectedContentObj.title?.audioUrl != null -> {
                        Log.d("PLAY_AUDIO", "Using title URL")
                        selectedContentObj.title.audioUrl
                    }
                    selectedContentObj.theme?.audioUrl != null -> {
                        Log.d("PLAY_AUDIO", "Using theme URL")
                        selectedContentObj.theme.audioUrl
                    }
                    else -> {
                        Log.e("PLAY_AUDIO", "No audio source found in any content field")
                        null
                    }
                }
                
                if (audioUrl.isNullOrEmpty()) {
                    Log.e("PLAY_AUDIO", "No audio URL found in content")
                    _isErrorFromIVR.postValue("No audio available for this content")
                    _isAudioControlDone.postValue(true) // Re-enable button
                    return@launch
                }

                val contentId = selectedContent.value?.id ?: ""
                userPreferencesRepository.saveAudioState(contentId, true)

                Log.d("PLAY_AUDIO", "Got audio URL: $audioUrl")
                
                val fullUrl = "$conferenceUrl/conference/playaudio/$confId"
                Log.d("PLAY_AUDIO", "Sending play request to: $fullUrl")
                
                val response = network.playAudio(fullUrl, audioUrl)
                Log.d("PLAY_AUDIO", "Response received - Code: ${response.code()}")
                
                if (response.isSuccessful) {
                    Log.d("PLAY_AUDIO", "Audio play request successful. Updating state.")
                    // Pessimistic Update: Change state only AFTER server confirmation.
                    _playerState.postValue(PlayerState.PLAYING)
                } else {
                    Log.e("PLAY_AUDIO", "Failed to play audio: ${response.code()} - ${response.message()}")
                    _isErrorFromIVR.postValue("Failed to play audio: ${response.code()}")
                    // On failure, ensure the state is correctly set to STOPPED.
                    _playerState.postValue(PlayerState.STOPPED)
                    try {
                        Log.e("PLAY_AUDIO", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("PLAY_AUDIO", "Could not read error body")
                    }
                }
            } catch (e: Exception) {
                Log.e("PLAY_AUDIO_ERROR", "Exception in playAudio: ${e.message}", e)
                _isErrorFromIVR.postValue("Error: ${e.message}")
                // Also ensure state is STOPPED on exception.
                _playerState.postValue(PlayerState.STOPPED)
            } finally {
                // This will always run to re-enable the UI button.
                _isAudioControlDone.postValue(true) 
            }
        }
    }

    fun pauseAudio(audioId: String? = null) = sendAudioCommand("Pause", PlayerState.PAUSED)
    fun resumeAudio(audioId: String? = null) = sendAudioCommand("Resume", PlayerState.PLAYING)

    fun seekAudio(deltaSeconds: Int) {
        Log.d("SEEK_AUDIO", "seekAudio() called with delta: $deltaSeconds")

        val confId = _callToken.value?.confId

        if (confId == null) {
            Log.e("SEEK_AUDIO", "Conference ID is null")
            _isErrorFromIVR.postValue("Conference not initialized")
            return
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/seekaudio/$confId?delta_seconds=$deltaSeconds"
                
                Log.d("SEEK_AUDIO", "Full URL: $fullUrl")
                Log.d("SEEK_AUDIO", "Sending seek request...")
                val response = network.seekAudio(fullUrl) 

                if (response.isSuccessful) {
                    Log.d("SEEK_AUDIO", "Audio seek request sent successfully")
                } else {
                    Log.e("SEEK_AUDIO", "Failed to seek audio: ${response.code()} - ${response.message()}")
                    try {
                        Log.e("SEEK_AUDIO", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("SEEK_AUDIO", "Could not read error body")
                    }
                    _isErrorFromIVR.postValue("Failed to seek audio")
                }
            } catch (e: Exception) {
                Log.e("SEEK_AUDIO_ERROR", "Exception in seekAudio: ${e.message}", e)
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

    /*

    Commands Server can send:
    refresh
    vonageWebSocket:connected
    vonageWebSocket:disconnected
    vonageWebSocket:failed

    *****************************************

    Commands the client can send:
    mute:phNo
    unmute:phNo
    play:audioId
    pause
    resume:audioId
    connect:phNo
    disconnect:phNo
    endcall

    After every command is complete, refresh event is sent to the client.
    */

    //event on disconnect to Android from Azure PubSub

    inner class SeedsWebSocketListener: WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            super.onOpen(webSocket, response)
            Log.d("socket", "Socket Created!!")
            //need to start the call here
            // startCall(confId)
            cancelCallOnFailure?.cancel()
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            super.onMessage(webSocket, text)
            Log.d("socket", text)
            message(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            super.onMessage(webSocket, bytes)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            super.onClosing(webSocket, code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d("SOCKETCLOSED", reason)
            super.onClosed(webSocket, code, reason)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.d("SOCKETFAILURE", t.message.toString())

            //reference: https://stackoverflow.com/questions/54088030/reconnect-okhttp-websocket-when-internet-disconnects
            socket.close(SOCKET_CLOSE, null)
            Thread.sleep(THREAD_SLEEP_TIME)
            // connectWebSocket()
            cancelCallOnFailure = viewModelScope.launch {
                delay(DELAY_FOR_VIEW_MODEL) // 3 minutes
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


