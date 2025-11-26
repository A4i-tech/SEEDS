package com.example.seeds.ui.classroom

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.example.seeds.R
import com.example.seeds.adapters.ClassroomListAdapter
import com.example.seeds.databinding.FragmentClassroomBinding
import com.example.seeds.model.Classroom
import com.example.seeds.ui.BaseFragment
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class ClassroomFragment : BaseFragment() {

    private val viewModel: ClassroomViewModel by viewModels()
    override var bottomNavigationViewVisibility = View.VISIBLE
    private lateinit var binding: FragmentClassroomBinding

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentClassroomBinding.inflate(inflater, container, false)
        binding.lifecycleOwner = viewLifecycleOwner
        binding.viewModel = viewModel

        setupRecyclerView()
        setupSearchBox()
        setupListeners()
        setupObservers()

        return binding.root
    }

    private fun setupRecyclerView() {
        val adapter = ClassroomListAdapter(ClassroomListAdapter.OnClickListener { classroom ->
            navigateToCallSettings(classroom)
        })
        binding.myClassroomsList.adapter = adapter
    }

    private fun setupListeners() {
        binding.createClassroomBtn.setOnClickListener {
            val emptyClassroom = Classroom.getNewClassroom()
            findNavController().navigate(
                ClassroomFragmentDirections.actionClassroomFragmentToCreateClassroomFragment(emptyClassroom)
            )
        }
    }

    private fun setupObservers() {
        // List Observer
        viewModel.classrooms.observe(viewLifecycleOwner) { list ->
            (binding.myClassroomsList.adapter as? ClassroomListAdapter)?.submitList(list)
            if (binding.searchTextBox.text.isNullOrEmpty()) {
                updateEmptyState(list.isNullOrEmpty())
            }
        }

        viewModel.navigateToCallSettings.observe(viewLifecycleOwner) { classroom ->
            if (classroom != null) {
                navigateToCallSettings(classroom)
                viewModel.onNavigationComplete()
            }
        }

        viewModel.navigateToCall.observe(viewLifecycleOwner) { classroom ->
            if (classroom != null) {
                logMessage("Directly resuming call for: ${classroom.name}")
                val phoneNumbers = classroom.students?.map { it.phoneNumber }?.toTypedArray() ?: emptyArray()
                
                findNavController().navigate(
                    ClassroomFragmentDirections.actionClassroomFragmentToCallNav(
                        phoneNumbers,
                        classroom,
                    )
                )
                viewModel.onNavigationComplete()
            }
        }

         viewModel.navigateToContentDetails.observe(viewLifecycleOwner) { content ->
            if (content != null) {
                logMessage("Resuming content: ${content.titleText}")
                
                // Navigate to the Standalone Player (ContentDetailsFragment)
                // Ensure this action exists in your Navigation Graph!
                findNavController().navigate(
                   ClassroomFragmentDirections.actionClassroomFragmentToContentDetailsFragment(content)
                )
                viewModel.onNavigationComplete()
            }
        }

        // 2. Choose Audio (New - Optional, goes to Home/Library)
        viewModel.navigateToLibrary.observe(viewLifecycleOwner) { shouldNavigate ->
            if (shouldNavigate) {
                findNavController().navigate(R.id.homeFragment)
                viewModel.onNavigationComplete()
            }
        }

        viewModel.errorMessage.observe(viewLifecycleOwner) { error ->
            if (!error.isNullOrEmpty()) logMessage("Error: $error")
        }
    }

    private fun setupSearchBox() {
        binding.searchTextBox.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val searchText = s.toString().lowercase().trim()
                val currentList = viewModel.classrooms.value ?: emptyList()

                if (searchText.isNotEmpty()) {
                    val filteredList = currentList.filter {
                        it.name.lowercase().contains(searchText)
                    }
                    (binding.myClassroomsList.adapter as? ClassroomListAdapter)?.submitList(filteredList)
                    updateEmptyState(filteredList.isEmpty())
                } else {
                    (binding.myClassroomsList.adapter as? ClassroomListAdapter)?.submitList(currentList)
                    updateEmptyState(currentList.isEmpty())
                }
            }
        })
    }

    private fun updateEmptyState(isEmpty: Boolean) {
        binding.noGroupsFoundText.visibility = if (isEmpty) View.VISIBLE else View.INVISIBLE
    }

    private fun navigateToCallSettings(classroom: Classroom) {
        findNavController().navigate(
            ClassroomFragmentDirections.actionClassroomFragmentToCallSettingsFragment(classroom)
        )
    }

    override fun onStart() {
        super.onStart()
        viewModel.refreshClassrooms()
        binding.searchTextBox.setText("")
    }
}