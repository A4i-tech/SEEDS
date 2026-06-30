package com.example.seeds.ui.call

import android.app.AlertDialog
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.RadioButton
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.databinding.DataBindingUtil
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import com.example.seeds.R
import com.example.seeds.adapters.CheckboxNameListAdapter
import com.example.seeds.adapters.ContentListAdapter
import com.example.seeds.databinding.AssignLeaderBinding
import com.example.seeds.databinding.FragmentCallSettingsBinding
import com.example.seeds.model.Content
import com.example.seeds.ui.BaseFragment
import com.example.seeds.utils.CallUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch

@AndroidEntryPoint
class CallSettingsFragment : BaseFragment() {
    override var bottomNavigationViewVisibility = View.GONE
    private lateinit var binding: FragmentCallSettingsBinding
    private val viewModel: CallSettingsViewModel by viewModels()
    private val args: CallSettingsFragmentArgs by navArgs()
    private lateinit var alertDialog: AlertDialog
    private lateinit var phoneHintLauncher: ActivityResultLauncher<IntentSenderRequest>
    private var teacherPhoneNumber: String? = null
    private var teachList: ArrayList<String> = arrayListOf()
    private var leaderForCall: String? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentCallSettingsBinding.inflate(inflater, container, false)
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner

        // Edit Classroom
        binding.editClassroomButton.setOnClickListener {
            logMessage("Edit classroom button clicked - ${viewModel.classroom.value}")
            findNavController().navigate(
                CallSettingsFragmentDirections.actionCallSettingsFragmentToCreateClassroomFragment(
                    viewModel.classroom.value!!
                )
            )
        }

        // Delete Classroom
        binding.deleteClassroomButton.setOnClickListener {
            AlertDialog.Builder(requireContext())
                .setMessage("Are you sure you want to delete the classroom?")
                .setCancelable(false)
                .setPositiveButton("Yes") { _, _ ->
                    logMessage("Classroom deleted ${viewModel.classroom.value}")
                    viewModel.deleteClassroom()
                }
                .setNegativeButton("No", null)
                .show()
        }

        // Observe navigation
        viewModel.goToHome.observe(viewLifecycleOwner, Observer {
            if (it) findNavController().popBackStack(R.id.classroomFragment, false)
        })

        // Initialize adapters
        binding.myStudentsList.adapter = CheckboxNameListAdapter(
            showCrown = true,
            leaders = viewModel.classroom.value?.leaders?.map { it.phoneNumber }!!.toMutableSet()
        )
        binding.selectedContentList.adapter = ContentListAdapter(
            showRemoveContent = true,
            onContentClickListener = ContentListAdapter.OnClickListener { removeContent(it) }
        )

        // Initialize selected students
        if (args.selectedStudents == null) {
            (binding.myStudentsList.adapter as CheckboxNameListAdapter).usersInGroup =
                args.classroom.students.map { it.phoneNumber }.toMutableSet()
        } else {
            (binding.myStudentsList.adapter as CheckboxNameListAdapter).usersInGroup.addAll(
                args.selectedStudents!!
            )
        }

        // Enable buttons when classroom loaded
        viewModel.classroom.observe(viewLifecycleOwner, Observer {
            if (it != null) {
                binding.addContentCs.isEnabled = true
                binding.startCallBtn.isEnabled = true
                binding.editClassroomButton.isEnabled = true
                binding.deleteClassroomButton.isEnabled = true
            }
        })

        // Add Content
        binding.addContentCs.setOnClickListener {
            val phoneNumbers = (binding.myStudentsList.adapter as CheckboxNameListAdapter).usersInGroup
            logMessage("Call Settings add content - to classroom: ${viewModel.classroom.value}")
            findNavController().navigate(
                CallSettingsFragmentDirections.actionCallSettingsFragmentToHomeFragment()
                    .setSelectedStudents(phoneNumbers.toTypedArray())
                    .setClassroom(args.classroom)
                    .setSelectedContent(
                        viewModel.classroom.value?.contents?.map { it.id }?.toTypedArray()
                    )
            )
        }

        // Student search
        binding.studentsSearchTextBox.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(p0: CharSequence?, p1: Int, p2: Int, p3: Int) {}
            override fun onTextChanged(p0: CharSequence?, p1: Int, p2: Int, p3: Int) {}
            override fun afterTextChanged(p0: Editable?) {
                val text = binding.studentsSearchTextBox.text.toString().lowercase()
                val filtered = if (text.isNotEmpty()) {
                    viewModel.classroom.value?.students?.filter {
                        it.name.lowercase().contains(text)
                    }
                } else viewModel.classroom.value?.students
                (binding.myStudentsList.adapter as CheckboxNameListAdapter).submitList(filtered)
            }
        })

        // Start call
        binding.startCallBtn.setOnClickListener {
            val phoneNumbersForCall =
                (binding.myStudentsList.adapter as CheckboxNameListAdapter).usersInGroup

            if (phoneNumbersForCall.isEmpty()) {
                AlertDialog.Builder(requireContext())
                    .setMessage("Please select at least one student")
                    .setCancelable(true)
                    .setPositiveButton("OK", null)
                    .show()
                logMessage("Call Settings - no students selected for call")
                return@setOnClickListener
            }

            val prefs = requireActivity().getSharedPreferences("sharedPref", AppCompatActivity.MODE_PRIVATE)
            val teacherPhoneNumber = prefs.getString("teacher_phone", null)

            Log.d("CallSettingsDebug", "Read 'teacher_phone' from prefs. Value: [$teacherPhoneNumber]")

            if (teacherPhoneNumber.isNullOrEmpty()) {
                Toast.makeText(requireContext(), "Your phone number is not configured.", Toast.LENGTH_LONG).show()
                logMessage("Call failed: Teacher phone number not found in SharedPreferences. Value was null or empty.")
                return@setOnClickListener
            }

            logMessage("Call Settings - students selected for call: $phoneNumbersForCall")
            logMessage("Teacher phone number retrieved and normalized: $teacherPhoneNumber")

            startCallAfterPhoneHint()
        }

        return binding.root
    }

    private fun startCallAfterPhoneHint() {
        leaderForCall = null
        showAssignLeaderDialog()
    }

    private fun showAssignLeaderDialog() {
        val dialogBinding: AssignLeaderBinding = DataBindingUtil.inflate(
            LayoutInflater.from(context),
            R.layout.assign_leader,
            null,
            false
        )
        dialogBinding.viewModel = viewModel

        val phoneNumbersForCall =
            (binding.myStudentsList.adapter as CheckboxNameListAdapter).usersInGroup

        val classroomLeaderPhones = (viewModel.classroom.value?.leaders ?: args.classroom.leaders)
            .flatMap { leader ->
                listOf(leader.phoneNumber, CallUtils.normalizePhoneNumber(leader.phoneNumber))
            }
            .toSet()

        val selectedPhonesNormalized = phoneNumbersForCall
            .map { CallUtils.normalizePhoneNumber(it) }
            .toSet()
        val callStudents = (viewModel.classroom.value?.students ?: args.classroom.students).filter {
            selectedPhonesNormalized.contains(CallUtils.normalizePhoneNumber(it.phoneNumber))
        }

        dialogBinding.leaderRadioGroup.removeAllViews()
        val noLeaderOption = RadioButton(requireContext()).apply {
            id = View.generateViewId()
            text = "No leader"
            tag = null
            isChecked = true
        }
        dialogBinding.leaderRadioGroup.addView(noLeaderOption)

        callStudents.forEach { student ->
            val normalizedPhone = CallUtils.normalizePhoneNumber(student.phoneNumber)
            val isClassroomLeader = classroomLeaderPhones.contains(normalizedPhone)
            val optionText = if (isClassroomLeader) {
                "${student.name} (${student.phoneNumber}) - Classroom leader"
            } else {
                "${student.name} (${student.phoneNumber})"
            }

            val studentOption = RadioButton(requireContext()).apply {
                id = View.generateViewId()
                text = optionText
                tag = normalizedPhone
            }
            dialogBinding.leaderRadioGroup.addView(studentOption)
        }

        val dialogBuilder: AlertDialog.Builder = AlertDialog.Builder(requireContext())
        dialogBuilder.setOnDismissListener { }
        dialogBuilder.setView(dialogBinding.root)
        alertDialog = dialogBuilder.create()
        val window = alertDialog.window
        window?.setBackgroundDrawableResource(R.drawable.rounded_assign_leader)
        window?.setGravity(Gravity.CENTER)

        dialogBinding.assignLeadersBtn.setOnClickListener {
            val selectedOptionId = dialogBinding.leaderRadioGroup.checkedRadioButtonId
            val selectedOption = dialogBinding.leaderRadioGroup.findViewById<RadioButton>(selectedOptionId)
            leaderForCall = selectedOption?.tag as? String
            logMessage("Leader selected for call: $leaderForCall")
            alertDialog.dismiss()
            findNavController().navigate(
                CallSettingsFragmentDirections.actionCallSettingsFragmentToCallNav(
                    phoneNumbersForCall.toTypedArray(),
                    viewModel.classroom.value!!
                ).setLeader(leaderForCall)
            )
        }

        dialogBinding.cancelLeadersBtn.setOnClickListener {
            alertDialog.dismiss()
        }

        alertDialog.show()
    }

    private fun removeContent(content: Content) {
        AlertDialog.Builder(requireContext())
            .setMessage("Are you sure you want to remove ${content.titleText}?")
            .setCancelable(true)
            .setPositiveButton("Yes") { _, _ ->
                val classroom = viewModel.classroom.value!!
                classroom.contentIds = classroom.contentIds.filter { it != content.id }
                viewModel.updateClassroomContent(classroom)
                logMessage("Content removed from call settings: ${content.id} (${content.titleText})")
            }
            .setNegativeButton("No", null)
            .show()
    }

    override fun onStart() {
        lifecycleScope.launch {
            logMessage("onStart")
            viewModel.refreshClassroom()
            binding.studentsSearchTextBox.setText("")
        }
        super.onStart()
    }

    override fun onStop() {
        logMessage("onStop")
        super.onStop()
    }
}
