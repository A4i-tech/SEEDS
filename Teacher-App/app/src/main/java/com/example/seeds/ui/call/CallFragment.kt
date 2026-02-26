package com.example.seeds.ui.call

import NetworkConnectivityLiveData
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.addCallback
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import androidx.navigation.navGraphViewModels
import com.example.seeds.R
import com.example.seeds.adapters.StudentCallStatusAdapter
import com.example.seeds.databinding.FragmentCallBinding
import com.example.seeds.ui.BaseFragment
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch

@AndroidEntryPoint
class CallFragment : BaseFragment() {

    companion object {
        private const val DELAY_FOR_SCOPE = 1500L
        private const val UI_STATE_LOG_TAG = "UI_STATE_DEBUG"
    }

    private lateinit var binding: FragmentCallBinding
    private val viewModel: CallViewModel by navGraphViewModels(R.id.call_nav) { defaultViewModelProviderFactory }
    private val args: CallFragmentArgs by navArgs()
    private lateinit var networkConnectivityLiveData: NetworkConnectivityLiveData

    private var studentAdapter: StudentCallStatusAdapter? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentCallBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner
        networkConnectivityLiveData = NetworkConnectivityLiveData(requireActivity().applicationContext)

        setupObservers()
        setupClickListeners()
        setupRecyclerView()
        setupOnBackPressed()
    }

    private fun setupRecyclerView() {
        if (studentAdapter == null) {
            studentAdapter = StudentCallStatusAdapter(
                viewModel,
                emptyList(), 
                StudentCallStatusAdapter.OnClickListener { student ->
                    student.phoneNumber?.let { phoneNumber ->
                        removeUser(phoneNumber)
                    }
                }
            )
        }
        binding.myStudentsList.adapter = studentAdapter
        binding.myStudentsList.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())
    }

    private fun setupObservers() {
        networkConnectivityLiveData.observe(viewLifecycleOwner) { isConnected ->
            if (isConnected) {
                Log.d("CallFragment", "Network is connected")
            } else {
                findNavController().navigate(CallFragmentDirections.actionCallFragmentToCallNoInternetFragment())
                Log.d("CallFragment", "Network is not connected")
            }
        }
        viewModel.validatedStudents.observe(viewLifecycleOwner) { fixedStudents ->
            Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Received validated student list. Count: ${fixedStudents.size}")
            studentAdapter = StudentCallStatusAdapter(
                viewModel,
                fixedStudents, 
                StudentCallStatusAdapter.OnClickListener { student ->
                    student.phoneNumber?.let { phoneNumber ->
                        removeUser(phoneNumber)
                    }
                }
            )
            binding.myStudentsList.adapter = studentAdapter
            viewModel.callState.value?.let { currentCallState ->
                studentAdapter?.submitList(currentCallState)
            }
        }

        viewModel.callState.observe(viewLifecycleOwner) { studentList ->
            Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Student list updated. Count: ${studentList?.size ?: 0}. Submitting to adapter.")
            studentList?.let {
                studentAdapter?.submitList(it)
            }
        }

        viewModel.teacherCallStatus.observe(viewLifecycleOwner) { teacherStatus ->
            if (teacherStatus != null) {
                Log.d(UI_STATE_LOG_TAG, "UI OBSERVER: Teacher status updated. Data: $teacherStatus")
            }
        }

        viewModel.callToken.observe(viewLifecycleOwner) {
            if (it != null) {
                Log.d("CallFragment", "Call token: $it")
                logMessage("Call token: $it")
                viewModel.startPollingForCallerState(it.confId)
            }
        }

        viewModel.navigateBack.observe(viewLifecycleOwner) {
            if (it) {
                findNavController().popBackStack()
                viewModel.doneNavigating()
            }
        }

        viewModel.isErrorFromIVR.observe(viewLifecycleOwner) {
            if (it != null) {
                logMessage("Error from IVR server: $it")
            }
        }

        viewModel.participantDropped.observe(viewLifecycleOwner) { phoneNumber ->
            if (phoneNumber != null) {
                // 1. Find the student in the validated list whose phone number matches
                val student = viewModel.validatedStudents.value?.find { it.phoneNumber == phoneNumber }
                
                // 2. Use the name if found, otherwise fallback to the phone number
                val displayName = student?.name ?: phoneNumber
                val message = "$displayName has left the call"
                
                com.google.android.material.snackbar.Snackbar.make(
                    binding.root,
                    message,
                    com.google.android.material.snackbar.Snackbar.LENGTH_LONG
                ).show()
                
                logMessage("Student disconnected: $displayName ($phoneNumber)")
                viewModel.clearParticipantDroppedNotification()
            }
        }

        viewModel.participantOnHold.observe(viewLifecycleOwner) { phoneNumber ->
            if (phoneNumber != null) {
                val student = viewModel.validatedStudents.value?.find { it.phoneNumber == phoneNumber }
                val displayName = student?.name ?: phoneNumber
                val message = "$displayName is on hold"

                com.google.android.material.snackbar.Snackbar.make(
                    binding.root,
                    message,
                    com.google.android.material.snackbar.Snackbar.LENGTH_LONG
                ).show()

                logMessage("Student on hold: $displayName ($phoneNumber)")
                viewModel.clearParticipantOnHoldNotification()
            }
        }
    }

    private fun setupClickListeners() {
        binding.endCallBtn.setOnClickListener {
            val classroom = args.classroom
            classroom.contentIds = viewModel.selectedContentList.value?.map { it.id } ?: emptyList()
            logMessage("Call Ended on end call button with final contents - id: ${classroom._id}")

            viewModel.endCall()
            viewModel.updateClassroomContent(classroom)
        }

        binding.muteAllBtn.setOnClickListener {
            val willBeMuted = viewModel.isMutedAll.value != true
            logMessage(if (willBeMuted) "Muted all" else "Unmuted all")
            viewModel.toggleMuteAll()
        }

        binding.retryTeacher.setOnClickListener {
            logMessage("Teacher clicked to rejoin call")
            viewModel.rejoinTeacher()
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

        binding.forwardButton.setOnClickListener {
            viewModel._isAudioControlDone.postValue(false)
            viewModel.forwardAudio()
            logMessage("Audio forward clicked")
        }

        binding.backwardButton.setOnClickListener {
            viewModel._isAudioControlDone.postValue(false)
            viewModel.backwardAudio()
            logMessage("Audio backward clicked")
        }
        
        binding.addStudentsButton.setOnClickListener {
            logMessage("Add students button clicked")
            viewModel.prepareStudentListForAdding() 
            findNavController().navigate(CallFragmentDirections.actionCallFragmentToAddStudentsFragment())
        }
    }

    private fun setupOnBackPressed() {
        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner) {
            AlertDialog.Builder(requireContext())
                .setMessage("Do you wish to end the call?")
                .setCancelable(false)
                .setPositiveButton("Yes") { _, _ ->
                    lifecycleScope.launch {
                        val classroom = args.classroom
                        classroom.contentIds = viewModel.selectedContentList.value?.map { it.id } ?: emptyList()
                        viewModel.endCall()
                        logMessage("Call Ended on Back")
                        viewModel.updateClassroomContent(classroom)
                    }
                }
                .setNegativeButton("No", null)
                .show()
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
        super.onStart()
        logMessage("onStart")
    }

    override fun onStop() {
        super.onStop()
        logMessage("onStop")
    }
}
