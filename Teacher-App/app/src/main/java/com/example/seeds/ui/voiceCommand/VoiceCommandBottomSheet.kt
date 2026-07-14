package com.example.seeds.ui.voiceCommand

import android.Manifest
import android.app.Dialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.content.DialogInterface
import androidx.core.content.ContextCompat
import androidx.fragment.app.viewModels
import androidx.navigation.Navigation
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.seeds.R
import com.example.seeds.databinding.BottomSheetVoiceCommandBinding
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class VoiceCommandBottomSheet : BottomSheetDialogFragment() {

    private val viewModel: VoiceCommandViewModel by viewModels()
    private var _binding: BottomSheetVoiceCommandBinding? = null
    private val binding get() = _binding!!
    private val resultAdapter = VoiceResultItemAdapter()

    // If true, start recording as soon as the sheet is shown (long-press / volume-up entry — Phase 7).
    private val autoRecord get() = arguments?.getBoolean(ARG_AUTO_RECORD) ?: false

    // One-shot guard so an auto-navigate target fires once, not on every UiState emission (Phase 8).
    private var hasAutoNavigated = false

    // Recording only starts once RECORD_AUDIO is granted; this holds the deferred start (Phase 7).
    private var pendingRecordAction: (() -> Unit)? = null

    /** True while actively recording — MainActivity forwards volume-up here to stop. */
    fun isRecording() = viewModel.uiState.value.status == VoiceStatus.RECORDING

    fun stopRecording() = viewModel.onStopRecording()

    private fun withMicPermission(action: () -> Unit) {
        val granted = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            action()
        } else {
            pendingRecordAction = action
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC_PERMISSION)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_MIC_PERMISSION) return
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        if (granted) pendingRecordAction?.invoke() else viewModel.onPermissionDenied()
        pendingRecordAction = null
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val dialog = super.onCreateDialog(savedInstanceState) as BottomSheetDialog
        dialog.setOnShowListener {
            val sheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            sheet?.let {
                val behavior = BottomSheetBehavior.from(it)
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
                behavior.skipCollapsed = true
            }
        }
        return dialog
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = BottomSheetVoiceCommandBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel.setContext(arguments?.getString(ARG_CLASS_ID))

        binding.resultsList.layoutManager = LinearLayoutManager(requireContext())
        binding.resultsList.adapter = resultAdapter

        binding.closeButton.setOnClickListener { dismiss() }
        binding.micButton.setOnClickListener { onMicTapped() }
        binding.sendButton.setOnClickListener { sendText() }
        binding.tryAgainButton.setOnClickListener { viewModel.onTryAgain() }
        binding.settingsButton.setOnClickListener { openAppSettings() }
        binding.textInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) { sendText(); true } else false
        }

        viewModel.uiStateLiveData.observe(viewLifecycleOwner) { render(it) }

        if (autoRecord && savedInstanceState == null) withMicPermission { viewModel.onStartRecording() }
    }

    private fun onMicTapped() {
        if (viewModel.uiState.value.status == VoiceStatus.RECORDING) {
            viewModel.onStopRecording()
        } else {
            withMicPermission { viewModel.onStartRecording() }
        }
    }

    private fun openAppSettings() {
        startActivity(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", requireContext().packageName, null)
            )
        )
    }

    private fun sendText() {
        val text = binding.textInput.text?.toString().orEmpty()
        if (text.isBlank()) return
        binding.textInput.setText("")
        viewModel.onSendText(text)
    }

    private fun render(state: VoiceCommandUiState) {
        val recording = state.status == VoiceStatus.RECORDING

        // Mic button reflects record state
        binding.micButton.setImageResource(if (recording) R.drawable.ic_mic_off else R.drawable.ic_mic)
        binding.micButton.backgroundTintList = ContextCompat.getColorStateList(
            requireContext(), if (recording) R.color.seeds_orange else R.color.seeds_green
        )
        binding.micButton.isEnabled = !state.isBusy

        // Status row (spinner + label)
        val showStatus = state.status != VoiceStatus.IDLE && state.status.label.isNotEmpty()
        binding.statusRow.visibility = if (showStatus) View.VISIBLE else View.GONE
        binding.statusLabel.text = state.status.label
        binding.statusProgress.visibility =
            if (state.isBusy || recording) View.VISIBLE else View.GONE

        binding.textInput.isEnabled = !state.isBusy
        binding.sendButton.isEnabled = !state.isBusy

        // Transcript
        binding.transcriptCard.visibility = if (!state.transcript.isNullOrEmpty()) View.VISIBLE else View.GONE
        binding.transcriptText.text = state.transcript

        // Spoken summary
        val showSummary = state.status == VoiceStatus.DONE && !state.spokenSummary.isNullOrEmpty()
        binding.summaryCard.visibility = if (showSummary) View.VISIBLE else View.GONE
        binding.summaryText.text = state.spokenSummary

        // Error
        val showError = state.status == VoiceStatus.ERROR && !state.error.isNullOrEmpty()
        binding.errorCard.visibility = if (showError) View.VISIBLE else View.GONE
        binding.errorText.text = state.error
        binding.settingsButton.visibility = if (state.needsMicPermission) View.VISIBLE else View.GONE

        // Result cards
        resultAdapter.submit(state.formattedResults)
        binding.resultsList.visibility = if (state.formattedResults.isEmpty()) View.GONE else View.VISIBLE

        // Navigation button
        val nav = state.navigationTarget?.takeIf { state.status == VoiceStatus.DONE }
        binding.navButton.visibility = if (nav != null) View.VISIBLE else View.GONE
        binding.navButton.text = nav?.label
        binding.navButton.setOnClickListener { nav?.destinationId?.let { navigateTo(it) } }

        // Phase 8: auto-navigate targets that carry a real destination jump straight there (once).
        // ponytail: arg-carrying targets (content play / conference) have no destinationId — the
        // app has no argless deep-link to those graphs, so they stay button-only for now.
        if (nav != null && nav.autoNavigate && nav.destinationId != null && !hasAutoNavigated) {
            hasAutoNavigated = true
            navigateTo(nav.destinationId)
        }
    }

    private fun navigateTo(destinationId: Int) {
        Navigation.findNavController(requireActivity(), R.id.nav_host_fragment_activity_main)
            .navigate(destinationId)
        dismiss()
    }

    override fun onDismiss(dialog: DialogInterface) {
        viewModel.onDismiss()
        super.onDismiss(dialog)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val ARG_CLASS_ID = "currentClassId"
        private const val ARG_AUTO_RECORD = "autoRecord"
        private const val REQ_MIC_PERMISSION = 4201

        fun newInstance(currentClassId: String? = null, autoRecord: Boolean = false) =
            VoiceCommandBottomSheet().apply {
                arguments = Bundle().apply {
                    putString(ARG_CLASS_ID, currentClassId)
                    putBoolean(ARG_AUTO_RECORD, autoRecord)
                }
            }
    }
}
