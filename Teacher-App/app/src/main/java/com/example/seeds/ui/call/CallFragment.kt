package com.example.seeds.ui.call

import android.graphics.Color
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
import com.example.seeds.connectivity.ConnectivityRepository
import com.example.seeds.connectivity.ConnectivityStatus
import com.example.seeds.databinding.FragmentCallBinding
import com.example.seeds.ui.BaseFragment
import com.google.android.material.snackbar.Snackbar
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class CallFragment : BaseFragment() {

    companion object {
        private const val DELAY_FOR_SCOPE = 1500L
        private const val UI_STATE_LOG_TAG = "UI_STATE_DEBUG"
    }

    private lateinit var binding: FragmentCallBinding
    private val viewModel: CallViewModel by navGraphViewModels(R.id.call_nav) { defaultViewModelProviderFactory }
    private val args: CallFragmentArgs by navArgs()

    @Inject lateinit var connectivityRepository: ConnectivityRepository

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
        viewLifecycleOwner.lifecycleScope.launch {
            connectivityRepository.status.collect { status ->
                updateConnectivityBanner(status)
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
                viewModel.startSSE(it.confId)
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
                
                Snackbar.make(
                    binding.root,
                    message,
                    Snackbar.LENGTH_LONG
                ).show()
                
                logMessage("Student disconnected: $displayName ($phoneNumber)")
                viewModel.clearParticipantDroppedNotification()
            }
        }

        viewModel.holdDetectedEvent.observe(viewLifecycleOwner) { event ->
            event.getContentIfNotHandled()?.let {
                Snackbar.make(
                    binding.root,
                    "Hold detected on conference audio",
                    Snackbar.LENGTH_LONG
                ).show()
                logMessage("Hold detected on conference audio")
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
            viewModel.notifyAudioControlStarted()
            viewModel.forwardAudio()
            logMessage("Audio forward clicked")
        }

        binding.backwardButton.setOnClickListener {
            viewModel.notifyAudioControlStarted()
            viewModel.backwardAudio()
            logMessage("Audio backward clicked")
        }
        // Seek bar handling
        binding.audioSeekbar.setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
            var userSeeking = false
            override fun onProgressChanged(seekBar: android.widget.SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    val sec = progress
                    binding.audioCurrentTime.text = String.format("%d:%02d", sec / 60, sec % 60)
                }
            }

            override fun onStartTrackingTouch(seekBar: android.widget.SeekBar?) {
                userSeeking = true
                viewModel.notifyAudioControlStarted()
            }

            override fun onStopTrackingTouch(seekBar: android.widget.SeekBar?) {
                userSeeking = false
                val sec = seekBar?.progress ?: 0
                viewModel.seekTo(sec.toFloat())
                // seekTo's finally block posts true — no explicit call needed here
            }
        })

        // Playback speed spinner — default to 1.0x (index 1) before attaching listener
        val spinner = binding.speedSpinner
        spinner.setSelection(1)
        spinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: android.widget.AdapterView<*>, view: View?, position: Int, id: Long) {
                val text = parent.getItemAtPosition(position) as String
                val speed = text.removeSuffix("x").toDoubleOrNull() ?: 1.0
                viewModel.setPlaybackSpeed(speed)
            }
            override fun onNothingSelected(parent: android.widget.AdapterView<*>) {}
        }

        // Observe position/duration to update seekbar
        viewModel.audioPositionSeconds.observe(viewLifecycleOwner) { pos ->
            val sec = pos?.toInt() ?: 0
            if (!binding.audioSeekbar.isPressed) {
                binding.audioSeekbar.progress = sec
                binding.audioCurrentTime.text = String.format("%d:%02d", sec / 60, sec % 60)
            }
        }
        viewModel.audioDurationSeconds.observe(viewLifecycleOwner) { dur ->
            val sec = dur?.toInt() ?: 0
            binding.audioSeekbar.max = if (sec > 0) sec else 0
            binding.audioTotalTime.text = if (sec > 0) String.format("%d:%02d", sec / 60, sec % 60) else "--:--"
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

    private fun updateConnectivityBanner(status: ConnectivityStatus) {
        val container = binding.connectivityBannerContainer
        val text = binding.connectivityBannerText
        when (status) {
            ConnectivityStatus.OFFLINE -> {
                container.setBackgroundColor(Color.parseColor("#B00020"))
                text.text = getString(R.string.connectivity_offline)
                container.visibility = View.VISIBLE
            }
            ConnectivityStatus.DEGRADED -> {
                container.setBackgroundColor(Color.parseColor("#E65100"))
                text.text = getString(R.string.connectivity_degraded)
                container.visibility = View.VISIBLE
            }
            ConnectivityStatus.ONLINE -> {
                container.visibility = View.GONE
                // SSE reconnects itself: EventSource is built with reconnectTime(3s), so no
                // manual reconnect is needed here. Resetting SSE state on every ONLINE tick
                // also risked bouncing the teacher out of a live call on a transient is_running=false.
            }
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
        connectivityRepository.startSessionMonitoring()
    }

    override fun onStop() {
        super.onStop()
        logMessage("onStop")
        connectivityRepository.stopSessionMonitoring()
    }
}
