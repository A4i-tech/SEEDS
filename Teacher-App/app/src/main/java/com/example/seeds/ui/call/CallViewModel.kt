package com.example.seeds.ui.call

import NetworkConnectivityLiveData
import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.AccessToken
import com.example.seeds.model.CallDetails
import com.example.seeds.model.CallerState
import com.example.seeds.model.Classroom
import com.example.seeds.model.ConferenceCreateRequest
import com.example.seeds.model.ConferenceCreateResponse
import com.example.seeds.model.Content
import com.example.seeds.model.Student
import com.example.seeds.model.StudentCallStatus
import com.example.seeds.network.SeedsService
import com.example.seeds.network.asDomainModel
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.TeacherRepository
import com.example.seeds.utils.Constants
import com.example.seeds.utils.ContactUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import javax.inject.Inject

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

    private val CONFERENCE_CREATE_URL = "$conferenceUrl/conference/create"
    private val CONFERENCE_START_URL = "$conferenceUrl/conference/start"
    private val CONFERENCE_END_URL = "$conferenceUrl/conference/end"
    private val CONFERENCE_ACTION_URL = "$conferenceUrl/conference/"
    private val CONFERENCE_PLAY_AUDIO_URL = "$conferenceUrl/conference/playaudio"

    init {
        getAccessToken()
        viewModelScope.launch {
            val selectedContentListIds = args.classroom.contentIds
            _allContent.value = contentRepository.getAllContent()

            val filteredListContent = _allContent.value?.filter {
                !selectedContentListIds.contains(it.id)
            }
            _allContent.value = filteredListContent!!

            _languages.value =
                filteredListContent.map { it.language.lowercase() }.distinct().map { it.capitalize() }
            _experiences.value = filteredListContent.map { it.type.lowercase() }.distinct().map {
                it.capitalize()
            }

//            _filteredContent.value = content
            if(filtersChosen.value != null) {
                val langs = _languages.value!!.filter { filtersChosen.value!!.contains(it) }.toMutableSet()
                val exps = _experiences.value!!.filter { filtersChosen.value!!.contains(it) }.toMutableSet()
                filterContent(langs, exps)
            } else{
                _filteredContent.value = filteredListContent!!
            }
        }

        Log.d("CONTENTCALL", args.classroom.contents!!.map{
            content -> content.title
        }.toString())
    }


    fun updateClassroomContent(classroom: Classroom) {
        viewModelScope.launch {
            classroomRepository.saveClassroom(classroom)
            _navigateBack.value = true
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
                // Log.d("PAYLOAD_DEBUG", "$sharedPreferences")
                sharedPreferences.all.forEach { (key, value) ->
                    Log.d("map values", "$key: $value")
                }
                Log.d("PAYLOAD_DEBUG", "Teacher: $teacherPhoneWithPrefix")
                Log.d("PAYLOAD_DEBUG", "Students: $studentPhonesWithPrefix")
                
                val payload = ConferenceCreateRequest(
                    teacher_phone = teacherPhoneWithPrefix,
                    student_phones = studentPhonesWithPrefix
                )

                val response = network.getAccessToken(
                    CONFERENCE_CREATE_URL,
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

                val fullUrl = "$CONFERENCE_START_URL/$confId"
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
            return
        }

        closeSocket()
        
        viewModelScope.launch {
            try {
                val fullUrl = "CONFERENCE_END_URL/$confId"
                Log.d("CALL_END", "Full URL: $fullUrl")
                Log.d("CALL_END", "About to call network.endCall()...")
                
                val response = network.endCall(fullUrl)
                Log.d("CALL_END", "Got response from network.endCall()")
                Log.d("CALL_END", "Response code: ${response.code()}")
                Log.d("CALL_END", "Response message: ${response.message()}")
                
                if (response.isSuccessful) {
                    Log.d("CALL_END", "Conference ended successfully!")
                } else {
                    Log.e("CALL_END", "Failed to end conference: ${response.code()} - ${response.message()}")
                    try {
                        Log.e("CALL_END", "Error body: ${response.errorBody()?.string()}")
                    } catch (e: Exception) {
                        Log.e("CALL_END", "Could not read error body: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e("CALL_END_ERROR", "Exception in endCall: ${e.message}", e)
                Log.e("CALL_END_ERROR", "Exception type: ${e::class.simpleName}")
                e.printStackTrace()
            }
        }
    }

    private fun closeSocket() {
        try {
            if (this::socket.isInitialized) {
                Log.d("CALL_END", "Closing socket")
                socket.close(1000, "close")
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
                                CallerState.COMPLETED, CallerState.FAILED, CallerState.REJECTED, CallerState.CANCELLED, CallerState.UNANSWERED, CallerState.BUSY -> true
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
        } else if(message.contains("muteAllDone") || message.contains("unMuteAllDone")) {
             refreshCallState()
             _isMuteOrUnmuteAllDone.postValue(true)
        } else if(message.contains("playDone") || message.contains("pauseDone") || message.contains("resumeDone")){
            Log.d("AUDIOCONTROLMESSAGE", message)
            _isAudioControlDone.postValue(true)
            refreshCallState()
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
                socket.send("lead:${args.leader}")
            }
            _connectionLost.postValue(false)
        } else if (message.contains("error")){
            _isErrorFromIVR.postValue(message)
        }
    }

    fun muteParticipant(phoneNumber: String) {
        val tempCallState = callState.value!!.toMutableList()
        val index = tempCallState?.indexOfFirst { it.phoneNumber == phoneNumber }
        index?.let {
            tempCallState[it].isMuteUnmuteDone = false
        }
        Log.d("MUTEPARTICIPANT", "MUTE TRIGGERED $phoneNumber")
        _callState.postValue(tempCallState)
        socket.send("mute:$phoneNumber")
    }

    fun unmuteParticipant(phoneNumber: String) {
        val tempCallState = callState.value!!.toMutableList()
        val index = tempCallState?.indexOfFirst { it.phoneNumber == phoneNumber }
        index?.let {
            tempCallState[it].isMuteUnmuteDone = false
        }
        _callState.postValue(tempCallState)
        Log.d("UNMUTEPARTICIPANT", "UNMUTE TRIGGERED")
        socket.send("unmute:$phoneNumber")
    }

    fun unmuteAll() {
        socket.send("unMuteAll")
    }

    fun muteAll() {
        socket.send("muteAll")
    }

    fun connectParticipant(name: String, phoneNumber: String) {
        socket.send("add:$phoneNumber:$name") // put name  // add:{phoneNumber}:{name}
    }

    fun disconnectParticipant(phoneNumber: String) {
        socket.send("remove:$phoneNumber")
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
                val fullUrl = "$CONFERENCE_ACTION_URL/${action.lowercase()}audio/$confId"
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
                
                val fullUrl = "$CONFERENCE_PLAY_AUDIO_URL/$confId"
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

    fun forwardAudio() {
        socket.send("forwardStream")
    }

    fun backwardAudio() {
        socket.send("backwardStream")
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
            socket.close(1000, null)
            Thread.sleep(4000)
            // connectWebSocket()
            cancelCallOnFailure = viewModelScope.launch {
                delay(180000L) // 3 minutes
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


