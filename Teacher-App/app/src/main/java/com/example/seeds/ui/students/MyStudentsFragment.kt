package com.example.seeds.ui.students

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.lifecycle.lifecycleScope
import com.example.seeds.adapters.RemoveStudentListAdapter
import com.example.seeds.databinding.FragmentMyStudentsBinding
import com.example.seeds.model.Student
import com.example.seeds.ui.BaseFragment
import com.example.seeds.utils.VoiceCommandEvent
import com.example.seeds.utils.VoiceCommandEventBus
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject


@AndroidEntryPoint
class MyStudentsFragment : BaseFragment() {
    override var bottomNavigationViewVisibility = View.VISIBLE
    private lateinit var binding: FragmentMyStudentsBinding
    private val viewModel : MyStudentsViewModel by viewModels()
    private var studentPhoneNumbers = listOf<String>()

    // Phase 8: refresh the student list when a voice command mutates students.
    @Inject lateinit var eventBus: VoiceCommandEventBus

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentMyStudentsBinding.inflate(layoutInflater)
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner

        viewModel.students.observe(viewLifecycleOwner, Observer{
            if(it != null) {
                Log.d("STUDENTSINMYSTUDENTS", it.toString())
                studentPhoneNumbers = it.map{
                    it.phoneNumber
                }
            }
        })

        binding.addStudentsBtn.setOnClickListener {
            //findNavController().navigate(MyStudentsFragmentDirections.actionMyStudentsFragmentToContactsFragment(studentPhoneNumbers.toTypedArray()))
        }

        binding.editBtn.setOnClickListener {
            //findNavController().navigate(MyStudentsFragmentDirections.actionMyStudentsFragmentToContactsFragment(studentPhoneNumbers.toTypedArray()))
        }

        binding.myStudentsList.adapter = RemoveStudentListAdapter(RemoveStudentListAdapter.OnClickListener{
            removeUser(it)
        })

        // lifecycle 2.3.1 has no repeatOnLifecycle; onEach+launchIn on the view scope
        // cancels at onDestroyView, which is enough for a refresh trigger.
        eventBus.events
            .onEach { event ->
                if (event is VoiceCommandEvent.StudentMutated) viewModel.refreshStudents()
            }
            .launchIn(viewLifecycleOwner.lifecycleScope)

        return binding.root
    }

    override fun onStart() {
        logMessage("onStart")
        viewModel.refreshStudents()
        super.onStart()
    }

    private fun removeUser(student: Student) {
        AlertDialog.Builder(requireContext())
            .setMessage("Are you sure you want to remove ${student.name}?")
            .setCancelable(true)
            .setPositiveButton("Yes") { _, _ ->
                viewModel.students.value = viewModel.students.value?.toMutableList()?.apply{
                    remove(student)
                }?.toList()
            }
            .setNegativeButton("No", null)
            .show()
    }

    override fun onPause() {
        if(viewModel.students.value != null) {
            viewModel.setMyStudents(viewModel.students.value!!.map {
                it.phoneNumber
            })
        }
        super.onPause()
    }

    override fun onStop() {
        logMessage("onStop")
        super.onStop()
    }
}