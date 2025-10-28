package com.example.seeds.ui.createclassroom

import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.databinding.DataBindingUtil
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import com.example.seeds.R
import com.example.seeds.adapters.CheckboxNameListAdapter
import com.example.seeds.adapters.RemoveStudentListAdapter
import com.example.seeds.databinding.AddLeadersBinding
import com.example.seeds.model.Student
import com.example.seeds.ui.BaseFragment
import dagger.hilt.android.AndroidEntryPoint
// Make sure this import is correct (it is usually auto-generated)
// If you named your layout 'fragment_create_classroom.xml', this is the right name.
import com.example.seeds.databinding.FragmentCreateClassroomBinding 

@AndroidEntryPoint
class CreateClassroomFragment : BaseFragment() {
    private lateinit var binding: FragmentCreateClassroomBinding
    private val viewModel: CreateClassroomViewModel by viewModels()
    private val args : CreateClassroomFragmentArgs by navArgs()
    private lateinit var alertDialog: android.app.AlertDialog
    
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        // FIX: Ensure you are inflating the correct binding type
        binding = FragmentCreateClassroomBinding.inflate(inflater, container, false)
        // Original used layoutInflater only, which is fine, but using inflater and container is best practice:
        // binding = FragmentCreateClassroomBinding.inflate(layoutInflater)
        
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner

        binding.classroomMyStudentsList.adapter = RemoveStudentListAdapter(RemoveStudentListAdapter.OnClickListener{
            removeUser(it)
        })

        binding.leadersList.adapter  = RemoveStudentListAdapter(RemoveStudentListAdapter.OnClickListener{
            removeLeader(it)
        })

        binding.addStudentsBtn.setOnClickListener {
            logMessage("Add students button clicked - ${viewModel.classroom}")
            val classroom = viewModel.classroom
            classroom.name = binding.classroomNameEdit.text.toString()
            
            // MaxLineLength fix by breaking long navigation chain
            findNavController()
                .navigate(CreateClassroomFragmentDirections
                .actionCreateClassroomFragmentToContactsFragment(classroom))
        }
        
        binding.saveClassroomBtn.setOnClickListener {
            val classroom = viewModel.classroom
            classroom.name = binding.classroomNameEdit.text.toString()
            if(classroom.name.isEmpty()){
                logMessage("Save classroom without title")
                AlertDialog.Builder(requireContext())
                    .setMessage("Title cannot be empty")
                    .setCancelable(true)
                    .setPositiveButton("OK", null)
                    .show()
            }
            else {
                logMessage("Save classroom: ${classroom._id} - ${classroom.name} - $classroom")
                viewModel.saveClassroom(classroom)
            }
        }

        binding.addLeadersBtn.setOnClickListener {
            logMessage("Add leaders button clicked")
            if(args.classroom.students.isNotEmpty()){
                showAddLeaderDialog()
            }
        }

        viewModel.navigateBack.observe(viewLifecycleOwner, Observer {
            if(it){
                requireActivity().onBackPressed()
                viewModel.doneNavigating()
            }
        })

        return binding.root
    }

    private fun removeUser(student: Student) {
        AlertDialog.Builder(requireContext())
            .setMessage("Are you sure you want to remove ${student.name}?")
            .setCancelable(true)
            .setPositiveButton("Yes") { _, _ ->
                val newStudents = viewModel.classroomStudents.value!!.filter {
                    it.phoneNumber != student.phoneNumber
                }

                val newLeaders = viewModel.classroomLeaders.value!!.filter {
                    it.phoneNumber != student.phoneNumber
                }

                viewModel.updateClassroomStudents(viewModel.classroomStudents.value!!.toMutableList().toList())
                viewModel.updateClassroomLeaders(newLeaders)
                viewModel.updateClassroomStudents(newStudents)
                logMessage("Remove student from classroom ${student.phoneNumber} ${student.name}")
            }
            .setNegativeButton("No", null)
            .show()
    }

    private fun removeLeader(student: Student) {
        AlertDialog.Builder(requireContext())
            .setMessage("Are you sure you want to remove ${student.name} as a leader?")
            .setCancelable(true)
            .setPositiveButton("Yes") { _, _ ->
                val newLeaders = viewModel.classroomLeaders.value!!.filter {
                    it.phoneNumber != student.phoneNumber
                }

                viewModel.updateClassroomStudents(viewModel.classroomStudents.value!!.toMutableList().toList())
                viewModel.updateClassroomLeaders(newLeaders)
                logMessage("Remove leader from classroom ${student.phoneNumber} ${student.name}")
            }
            .setNegativeButton("No", null)
            .show()
    }



    fun showAddLeaderDialog(){
        val dialogBinding: AddLeadersBinding = DataBindingUtil.inflate(
            LayoutInflater.from(context),
            R.layout.add_leaders,
            null,
            false
        )
        dialogBinding.viewModel = viewModel

        // MaxLineLength fixed by breaking the long chain
        dialogBinding.classroomMyPotentialLeadersList.adapter = CheckboxNameListAdapter(
            usersInGroup = viewModel.classroom.leaders.map { it.phoneNumber }.toMutableSet(), 
            maximumSelections = 2
        )

        val dialogBuilder: android.app.AlertDialog.Builder = android.app.AlertDialog.Builder(requireContext())
        dialogBuilder.setOnDismissListener { }
        dialogBuilder.setView(dialogBinding.root)
        alertDialog = dialogBuilder.create()
        val window = alertDialog.window
        window?.setBackgroundDrawableResource(R.drawable.rounded_assign_leader)
        window?.setGravity(Gravity.CENTER)

        dialogBinding.addLeadersBtn.setOnClickListener {
            val adapter = dialogBinding.classroomMyPotentialLeadersList.adapter as CheckboxNameListAdapter
            val leadersPhoneNumbers = adapter.usersInGroup.toList()

            val leaders = args.classroom.students.filter {
                leadersPhoneNumbers.contains(it.phoneNumber)
            }
            // MaxLineLength fixed by breaking the long log message
            logMessage("Assign leaders: $leaders - " +
                    "${leaders.map{it.name}} - " +
                    "${leaders.map{it.phoneNumber}}}")
            viewModel.updateClassroomLeaders(leaders)
            alertDialog.dismiss()
        }

        dialogBinding.cancelLeadersBtn.setOnClickListener {
            logMessage("Assign leaders cancelled")
            alertDialog.dismiss()
        }
        alertDialog.show()
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