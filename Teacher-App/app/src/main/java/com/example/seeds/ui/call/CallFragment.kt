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
        private const val UI_STATE_LOG_TAG = "UI_STATE_DEBUG"
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
                student.phoneNumber?.let { phoneNumber ->
                    removeUser(phoneNumber)
                }
            }
        )

        binding.myStudentsList.adapter = adapter
        binding.myStudentsList.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())

        viewModel.callState.observe(viewLifecycleOwner) { studentList ->
            Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Student list updated. Count: ${studentList?.size ?: 0}. Submitting to adapter.")
            Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Student Data: $studentList")
            studentList?.let {
                adapter.submitList(it)
            }
        }

        viewModel.teacherCallStatus.observe(viewLifecycleOwner) { teacherStatus ->
            if (teacherStatus == null) {
                Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Teacher status is NULL. UI should be in its initial/empty state.")
            } else {
                Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Teacher status updated. Data: $teacherStatus")
            }
        }

        viewModel.callToken.observe(viewLifecycleOwner, Observer {
            if(it != null) {
                Log.d("CallFragment", "Call token: $it")
                logMessage("Call token: $it")
                viewModel.startPollingForCallerState(it.confId)
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

        // binding.retryTeacher.setOnClickListener {
        //     viewModel.retryTeacherConnection()
        // }

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
            val willBeMuted = viewModel.isMutedAll.value != true
            logMessage(if (willBeMuted) "Muted all" else "Unmuted all")
            viewModel.toggleMuteAll()
        }

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
            // Added null check for safety
            if(viewModel.teacherCallStatus.value?.isMuted == true) {
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
            viewModel.onPlayPauseClicked()
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