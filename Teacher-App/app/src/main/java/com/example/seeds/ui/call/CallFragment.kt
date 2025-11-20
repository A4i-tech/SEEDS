package com.example.seeds.ui.call

import NetworkConnectivityLiveData
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.addCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.widget.PopupMenu
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import androidx.navigation.navGraphViewModels
import com.example.seeds.R
import com.example.seeds.adapters.ContentListAdapter
import com.example.seeds.adapters.StudentCallStatusAdapter
import com.example.seeds.databinding.FragmentCallBinding
import com.example.seeds.model.CallerState
import com.example.seeds.ui.BaseFragment
import com.example.seeds.ui.createclassroom.CreateClassroomFragmentArgs
import com.example.seeds.utils.ContactUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.log

@AndroidEntryPoint
class CallFragment : BaseFragment() {

    companion object{
        private const val DELAY_FOR_SCOPE = 1500L
        private const val DELAY_FOR_LAUNCH = 120000L
    }

    private lateinit var binding: FragmentCallBinding
    private val viewModel: CallViewModel by navGraphViewModels(R.id.call_nav) { defaultViewModelProviderFactory }
    private val args : CallFragmentArgs by navArgs()
    private lateinit var networkConnectivityLiveData: NetworkConnectivityLiveData


    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentCallBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner
        networkConnectivityLiveData = NetworkConnectivityLiveData(requireActivity().applicationContext)

        networkConnectivityLiveData.observe(viewLifecycleOwner, Observer { isConnected ->
            if(isConnected) {
                Log.d("CallFragment", "Network is connected")
            } else {
                findNavController().navigate(CallFragmentDirections.actionCallFragmentToCallNoInternetFragment())
                Log.d("CallFragment", "Network is not connected")
            }
        })

        val adapter = StudentCallStatusAdapter(
            viewModel, 
            StudentCallStatusAdapter.OnClickListener { student ->
                removeUser(student.phoneNumber)
            }
        )

        binding.myStudentsList.adapter = adapter
        binding.myStudentsList.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())

        viewModel.callState.observe(viewLifecycleOwner) { studentList ->
    
            studentList?.let {
                adapter.submitList(it)
            }
        }

        viewModel.callToken.observe(viewLifecycleOwner, Observer {
            if(it != null) {
                Log.d("CallFragment", "Call token: $it")
                logMessage("Call token: $it")
            }
        })

        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner) {
            if(viewModel.navigateBack.value == true) {
                if (!findNavController().navigateUp()) {
                    if (isEnabled) {
                        isEnabled = false
                        requireActivity().onBackPressedDispatcher.onBackPressed()
                        viewModel.doneNavigating()
                    }
                }
            }
            else {
                AlertDialog.Builder(requireContext())
                    .setMessage("Do you wish to end the call?")
                    .setCancelable(false)
                    .setPositiveButton("Yes") { _, _ ->
                        lifecycleScope.launch {
                            val classroom = args.classroom
                            classroom.contentIds = viewModel.selectedContentList.value?.map {
                                it.id
                            }?: emptyList()
                            viewModel.endCall()
                            logMessage("""Call Ended on Back with final contents - 
                            id: ${classroom._id} - name: ${classroom.name} - 
                            contentIds: ${classroom.contentIds}""")
                            logMessage("""Call ended with Final Call Status: 
                            ${viewModel.callState.value}""")
                            viewModel.updateClassroomContent(classroom)
                        }
                    }
                    .setNegativeButton("No", null)
                    .show()
            }
        }

        viewModel.navigateBack.observe(viewLifecycleOwner, Observer {
            if(it){
                requireActivity().onBackPressed()
            }
        })

        binding.retryTeacher.setOnClickListener {
            viewModel.connectParticipant("Teacher", viewModel.teacherPhoneNumber)
            lifecycleScope.launch {
                delay(DELAY_FOR_LAUNCH) // 120000 milliseconds = 2 minutes

                if (viewModel.teacherCallStatus.value?.callerState != CallerState.ANSWERED) {
                    val classroom = args.classroom
                    classroom.contentIds = viewModel.selectedContentList.value!!.map{
                        it.id
                    }
                    val logmessage = """Call ended because teacher didn't rejoin within 2 minutes - 
                                        Reason: ${viewModel.teacherCallStatus.value?.callerState}"""
                    viewModel.updateClassroomContent(classroom)

                    logMessage(logmessage)

                }
            }

        }

        binding.endCallBtn.setOnClickListener {
            val classroom = args.classroom
            classroom.contentIds = viewModel.selectedContentList.value?.map {
                it.id
            } ?: emptyList()
            logMessage("Call Ended on end call button with final contents - id: ${classroom._id}")

            viewModel.endCall()
            viewModel.updateClassroomContent(classroom)
        }

        binding.muteAllBtn.setOnClickListener {
            if(viewModel._isMutedAll.value!!){
                viewModel.unmuteAll()
                logMessage("Unmuted all")
                viewModel._isMutedAll.postValue(false)
            }
            else {
                viewModel.muteAll()
                logMessage("Muted all")
                viewModel._isMutedAll.postValue(true)
            }
            viewModel._isMuteOrUnmuteAllDone.postValue(false)
        }

        viewModel.callState.observe(viewLifecycleOwner, Observer {
            if(it != null) {
                logMessage("Call state changed to $it")
                if(it.none { state -> state.callerState != CallerState.COMPLETED }) {
                    requireActivity().onBackPressed()
                }
            }
        })

        viewModel.isErrorFromIVR.observe(viewLifecycleOwner, Observer {
            if(it != null){
                logMessage("Error from IVR server: $it")
            }
        })

        binding.addStudentsButton.setOnClickListener {
            logMessage("Add students button clicked")
            findNavController().navigate(CallFragmentDirections.actionCallFragmentToAddStudentsFragment())
        }

        binding.teacherMic.setOnClickListener {
            if(viewModel.teacherCallStatus.value!!.isMuted) {
                viewModel.unmuteParticipant(viewModel.teacherPhoneNumber)
                logMessage("Teacher unmuted")
            }
            else {
                viewModel.muteParticipant(viewModel.teacherPhoneNumber)
                logMessage("Teacher muted")
            }
        }

        binding.addContentButton.setOnClickListener {
            findNavController().navigate(CallFragmentDirections.actionCallFragmentToAddMoreContentToCallFragment())
        }

        binding.changeContent.setOnClickListener {
            findNavController().navigate(CallFragmentDirections.actionCallFragmentToAddContentToCallFragment2())
        }

        binding.pausePlayButton.setOnClickListener {
            viewModel._isAudioControlDone.postValue(false)
            if (viewModel.audioPlaying.value!!) {
                viewModel.pauseAudio()
                val logmessage = """Audio paused ${viewModel.selectedContent.value!!.id} 
                                    ${viewModel.selectedContent.value!!.title}}"""
                logMessage(logmessage)
                Log.d("AUDIOCONTROLPAUSEINI", viewModel.selectedContent.value!!.id)
            }
            else {
                if (!viewModel.startedAudio && viewModel.selectedContent.value != null) {
                    viewModel.playAudio(viewModel.selectedContent.value!!.id)
                    logMessage("Audio playing ${viewModel.selectedContent.value!!.title}")
                } else {
                    viewModel.resumeAudio(viewModel.selectedContent.value!!.id)
                    logMessage("Audio resumed ${viewModel.selectedContent.value!!.title}")
                }
            }
        }

        // Forward 10 Seconds
        binding.forwardButton.setOnClickListener {
            viewModel._isAudioControlDone.postValue(false)
            viewModel.forwardAudio()
            logMessage("Audio forward clicked")
        }

        // Rewind 10 Seconds
        binding.backwardButton.setOnClickListener {
            viewModel._isAudioControlDone.postValue(false)
            viewModel.backwardAudio()
            logMessage("Audio backward clicked")
        }
    }

    private fun showFeedback(textView: TextView, message: String) {
        textView.text = message
        textView.visibility = View.VISIBLE

        lifecycleScope.launch {
            delay(DELAY_FOR_SCOPE) // Delay for 1.5 seconds
            textView.visibility = View.INVISIBLE
        }
    }

    private fun removeUser(phoneNumber: String) {
        AlertDialog.Builder(requireContext())
            .setMessage("Are you sure?")
            .setCancelable(true)
            .setPositiveButton("Yes") { _, _ ->
                logMessage("Teacher removed student - $phoneNumber")
                viewModel.disconnectParticipant(phoneNumber)
            }
            .setNegativeButton("No", null)
            .show()
    }

    override fun onStart() {
        logMessage("onStart")
        super.onStart()
    }

    override fun onStop() {
        logMessage("onStop")
        super.onStop()
    }
}