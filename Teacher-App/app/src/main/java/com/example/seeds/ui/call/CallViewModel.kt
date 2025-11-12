package com.example.seeds.ui.call

import NetworkConnectivityLiveData
import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.util.Log
import androidx.lifecycle.*
import com.example.seeds.model.*
import com.example.seeds.network.SeedsService
import com.example.seeds.network.asDomainModel
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.utils.ContactUtils
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.*
import okio.ByteString
import javax.inject.Inject
import android.content.SharedPreferences
import com.example.seeds.utils.Constants

const val SOCKET_CLOSE = 1000   
const val THREAD_SLEEP_TIME = 5000L
const val DELAY_FOR_VIEW_MODEL = 180000L

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
//    val networkConnectivityLiveData: NetworkConnectivityLiveData
    ) : ViewModel(){

    private val contactUtils = ContactUtils(context)
    private val conferenceUrl = Constants.CONTENT_URL
    val args = CallFragmentArgs.fromSavedStateHandle(savedStateHandle)

    val leader = args.leader.toString()

    private var callStarted = false
    private var phoneNumbers: List<String> = args.phoneNumbers.toMutableList()
    private var allStudents = listOf<Student>()
    private lateinit var token: AccessToken
    private var cancelCallOnFailure: Job? = null

    val teacherPhoneNumber = "91${teacherRepository.getTeacherPhoneNumber()}"
    // Log.d("PAYLOAD_DEBUG","Teacher: $teacherPhoneNumber")
    var startedAudio = false

    var content: Content? = if (args.classroom.contents!!.isNotEmpty()) args.classroom.contents!![0] else null

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

    // val _forwardStreamDone = MutableLiveData<Boolean>(true)
    // val forwardStreamDone: LiveData<Boolean>
    //     get() = _forwardStreamDone

    // val _backwardStreamDone = MutableLiveData<Boolean>(true)
    // val backwardStreamDone: LiveData<Boolean>
    //     get() = _backwardStreamDone

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

    private val _audioPlaying = MutableLiveData(false)
    val audioPlaying: LiveData<Boolean>
        get() = _audioPlaying

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
        
        val initialCallStatuses = args.classroom.students.map { student ->
            StudentCallStatus(
                name = student.name,
                phoneNumber = student.phoneNumber,
                callerState = CallerState.ANSWERED, 
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
            // Filter the complete list of content against what's already selected
            val filteredListContent = allContentList.filter {
                !selectedContentListIds.contains(it.id)
            }

            // Assign the final, complete lists to the LiveData
            _allContent.value = filteredListContent
            _filteredContent.value = filteredListContent // Initialize filtered content

            _languages.value =
                filteredListContent.map { it.language.lowercase() }.distinct().map { it.capitalize() }
            _experiences.value = filteredListContent.map { it.type.lowercase() }.distinct().map {
                it.capitalize()
            }
        }

        Log.d("CONTENTCALL", args.classroom.contents!!.map{
            content -> content.title
        }.toString())
    }

    fun doneNavigating() {
        _navigateBack.value = false
    }

    // private fun getAccessToken() {
    //     viewModelScope.launch {
    //         try {
    //             val payload = ConferenceCreateRequest(
    //                 teacher_phone = teacherPhoneNumber,
    //                 student_phones = phoneNumbers
    //             )

    //             // Directly get the parsed object
    //             val response = network.getAccessToken(
    //                 "https://samella-cemeterial-unfortunately.ngrok-free.app/conference/create",
    //                 payload
    //             )

    //             val confId = response.id
    //             Log.d("CONF_ID", "Created conference ID: $confId")

    //             startCall(confId)

    //         } catch (e: Exception) {
    //             Log.e("GET_ACCESS_TOKEN", "Error creating conference: ${e.message}", e)
    //         }
    //     }
    // }
    private fun getAccessToken() {
        viewModelScope.launch {
            try {
                val teacherPhoneWithPrefix = "$teacherPhoneNumber"
                
                val studentPhonesWithPrefix = phoneNumbers.map { "$it" }
                // Log.d("PAYLOAD_DEBUG", "$sharedPreferences")
                // sharedPreferences.all.forEach { (key, value) ->
                //     Log.d("map values", "$key: $value")
                // }
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
                startCall(confId)

            } catch (e: Exception) {
                Log.e("GET_ACCESS_TOKEN", "Error creating conference: ${e.message}", e)
            }
        }
    }
    // private fun getAccessToken() {
    //     viewModelScope.launch { // gave some Fatal Exception: java.lang.IndexOutOfBoundsException Index 0 out of bounds for length 0 error
    //         token = network.getAccessToken()
    //         allStudents = args.classroom.students //teacherRepository.getMyStudents()
    //         _callToken.postValue(token)
    //         connectWebSocket()
    //     }
    // }

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
            _audioPlaying.value = callStatus.audio.state == "play"
            Log.d("AUDIOCONTROLNETWORK", callStatus.audio.toString())
            _callState.postValue(networkCallState.sortedByDescending { it.raiseHand })
            Log.d("REFRESHED NETWORK CALL STATE", networkCallState.toString())
            _teacherCallStatus.postValue(networkCallState.find {
                it.phoneNumber == teacherPhoneNumber
            })
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

    fun muteParticipant(phoneNumber: String) {
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

    fun unmuteParticipant(phoneNumber: String) {
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

    fun connectParticipant(name: String, phoneNumber: String) {
        val confId = _callToken.value?.confId ?: return

        val currentList = _callState.value?.toMutableList() ?: return
        val studentIndex = currentList.indexOfFirst { it.phoneNumber == phoneNumber }
        if (studentIndex != -1) {
            currentList[studentIndex] = currentList[studentIndex].copy(callerState = CallerState.ANSWERED)
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
                // Create a new CallerStatus object with DISCONNECTED state
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
    fun sendAudioCommand(action: String, shouldPlay: Boolean) {
        Log.d("AUDIO_COMMAND", "$action() called")

        val confId = _callToken.value?.confId
        Log.d("AUDIO_COMMAND", "Conference ID: $confId")

        if (confId == null) {
            Log.e("AUDIO_COMMAND", "Conference ID is null")
            _isErrorFromIVR.postValue("Conference not initialized")
            _isAudioControlDone.postValue(true) // Re-enable button on early exit
            return
        }

        viewModelScope.launch {
            try {
                val fullUrl = "$conferenceUrl/conference/${action.lowercase()}audio/$confId"
                Log.d("AUDIO_COMMAND", "Action: $action | Full URL: $fullUrl")
                Log.d("AUDIO_COMMAND", "Sending $action request...")

                val response = network.audioCommand(fullUrl) // This will now call the suspend function
                Log.d("AUDIO_COMMAND", "Response received - Code: ${response.code()}")

                if (response.isSuccessful) {
                    Log.d("AUDIO_COMMAND", "Audio $action request sent successfully")
                    _audioPlaying.postValue(shouldPlay)
                } else {
                    Log.e("AUDIO_COMMAND", "Failed to $action audio: ${response.code()} - ${response.message()}")
                    try {
                        Log.e("AUDIO_COMMAND", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("AUDIO_COMMAND", "Could not read error body")
                    }
                    _isErrorFromIVR.postValue("Failed to $action audio: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e("AUDIO_COMMAND_ERROR", "Exception in $action: ${e.message}", e)
                e.printStackTrace()
                _isErrorFromIVR.postValue("Error: ${e.message}")
            } finally {
                // This is crucial: always re-enable the button
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
                
                Log.d("PLAY_AUDIO", "Got audio URL: $audioUrl")
                
                val fullUrl = "$conferenceUrl/conference/playaudio/$confId"
                Log.d("PLAY_AUDIO", "Full URL: $fullUrl")
                Log.d("PLAY_AUDIO", "Audio URL param: $audioUrl")
                Log.d("PLAY_AUDIO", "Sending play request...")
                
                val response = network.playAudio(fullUrl, audioUrl)
                Log.d("PLAY_AUDIO", "Response received - Code: ${response.code()}")
                
                if (response.isSuccessful) {
                    Log.d("PLAY_AUDIO", "Audio play request sent successfully")
                    _audioPlaying.postValue(true)
                } else {
                    Log.e("PLAY_AUDIO", "Failed to play audio: ${response.code()} - ${response.message()}")
                    try {
                        Log.e("PLAY_AUDIO", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("PLAY_AUDIO", "Could not read error body")
                    }
                    _isErrorFromIVR.postValue("Failed to play audio: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e("PLAY_AUDIO_ERROR", "Exception in playAudio: ${e.message}", e)
                e.printStackTrace()
                _isErrorFromIVR.postValue("Error: ${e.message}")
            } finally {
                _isAudioControlDone.postValue(true) // This will always run
            }
        }
    }

    fun pauseAudio(audioId: String? = null) = sendAudioCommand("Pause", false)

    fun resumeAudio(audioId: String? = null) = sendAudioCommand("Resume", true)
    // fun resumeAudio(audioId: String) {
    //     if(startedAudio) {
    //         socket.send("resume:$audioId")
    //     } else {
    //         playAudio(audioId)
    //         startedAudio = true
    //         return
    //     }
    //     _audioPlaying.postValue(true)
    // }

    // fun pauseAudio() {
    //     socket.send("pause")
    //     _audioPlaying.postValue(false)
    // }

    fun forwardAudio() {
        socket.send("forwardStream")
    }

    fun backwardAudio() {
        socket.send("backwardStream")
    }

    // fun endCall() {
    //     //how to check if socket is initialized
    //     if (this::socket.isInitialized) {
    //         socket.send("end")
    //     }
    //      // Null Error here
    // }

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

    // override fun onCleared() {
    //     endCall()
    //     if (this::socket.isInitialized) {
    //         socket.close(1000, "close")
    //     }
    //     //socket.close(1000, "close")
    // }

    fun startNetworkCallback() {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val networkRequest = NetworkRequest.Builder().build()
        connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
    }

    // fun connectWebSocket() {
    //     val request = Request.Builder()
    //         .url(token.accessToken)
    //         .build()
    //     socket = client.newWebSocket(request, SeedsWebSocketListener())
    // }

}


