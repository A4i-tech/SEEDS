package com.example.seeds.ui.createclassroom

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.navigation.fragment.findNavController
import com.example.seeds.adapters.RemoveStudentListAdapter
import com.example.seeds.databinding.FragmentCreateClassroomBinding
import com.example.seeds.model.Student
import com.example.seeds.ui.BaseFragment
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class CreateClassroomFragment : BaseFragment() {
    private lateinit var binding: FragmentCreateClassroomBinding
    private val viewModel: CreateClassroomViewModel by viewModels()
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentCreateClassroomBinding.inflate(layoutInflater)
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner

        binding.classroomMyStudentsList.adapter = RemoveStudentListAdapter(RemoveStudentListAdapter.OnClickListener{
            removeUser(it)
        })

        binding.addStudentsBtn.setOnClickListener {
            logMessage("Add students button clicked - ${viewModel.classroom}")
            val classroom = viewModel.classroom
            classroom.name = binding.classroomNameEdit.text.toString()
            findNavController()
            .navigate(CreateClassroomFragmentDirections
            .actionCreateClassroomFragmentToContactsFragment(classroom))
        }
        // Inflate the layout for this fragment
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
                classroom.leaders = emptyList()
                logMessage("Save classroom: ${classroom._id} - ${classroom.name} - $classroom")
                viewModel.saveClassroom(classroom)
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

                viewModel.updateClassroomStudents(viewModel.classroomStudents.value!!.toMutableList().toList())
                viewModel.updateClassroomStudents(newStudents)
                logMessage("Remove student from classroom ${student.phoneNumber} ${student.name}")
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
