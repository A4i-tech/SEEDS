package com.example.seeds.ui.home

import android.app.AlertDialog
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.databinding.DataBindingUtil
import androidx.fragment.app.viewModels
import androidx.lifecycle.Observer
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import com.example.seeds.R
import com.example.seeds.adapters.ContentListAdapter
import com.example.seeds.adapters.FilterContentAdapter
import com.example.seeds.databinding.FilterContentBinding
import com.example.seeds.databinding.FragmentHomeBinding
import com.example.seeds.ui.BaseFragment
import com.google.android.material.chip.Chip
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HomeFragment : BaseFragment() {
    private lateinit var binding: FragmentHomeBinding
    private val viewModel: HomeViewModel by viewModels()
    private val args: HomeFragmentArgs by navArgs()
    override var bottomNavigationViewVisibility = View.VISIBLE
    private lateinit var alertDialog: AlertDialog

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentHomeBinding.inflate(layoutInflater)
        binding.viewModel = viewModel
        binding.lifecycleOwner = viewLifecycleOwner
        bottomNavigationViewVisibility = if (args.classroom != null) View.GONE else View.VISIBLE

        val selectedContentIds = if (args.selectedContent != null) args.selectedContent!!.toMutableSet() else mutableSetOf<String>()

        // 1. SETUP THE ADAPTER
        val contentAdapter = ContentListAdapter(ContentListAdapter.OnClickListener {
            if (args.classroom == null) {
                logMessage("Content clicked: ${it.titleText} - ${it.id}")
                findNavController().navigate(
                    HomeFragmentDirections.actionHomeFragmentToContentDetailsFragment2(it)
                )
            }
        }, showCheckbox = args.classroom != null, usersInGroup = selectedContentIds)
        binding.contentList.adapter = contentAdapter

        // 2. SETUP THE SCROLL LISTENER
        val layoutManager = binding.contentList.layoutManager as androidx.recyclerview.widget.LinearLayoutManager
        binding.contentList.addOnScrollListener(object : androidx.recyclerview.widget.RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: androidx.recyclerview.widget.RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                if (dy > 0) { // Only check when scrolling down
                    val visibleItemCount = layoutManager.childCount
                    val totalItemCount = layoutManager.itemCount
                    val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()
                    val isLoading = viewModel.isLoading.value ?: false
                    if (!isLoading && (visibleItemCount + firstVisibleItemPosition) >= totalItemCount && firstVisibleItemPosition >= 0) {
                        viewModel.loadMoreContent()
                    }
                }
            }
        })

        // 3. SETUP THE SEARCH TEXT WATCHER
        binding.contentSearchTextBox.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(p0: CharSequence?, p1: Int, p2: Int, p3: Int) {}
            override fun onTextChanged(p0: CharSequence?, p1: Int, p2: Int, p3: Int) {}
            override fun afterTextChanged(s: Editable?) {
                // The Fragment's only job is to tell the ViewModel about the user's action.
                viewModel.onSearchQueryChanged(s.toString())
            }
        })

        // 4. SETUP THE OBSERVERS (THE VIEW "SUBSCRIBES" TO STATE CHANGES)

        // THIS IS THE ONLY OBSERVER THAT UPDATES THE LIST. It's clean and simple.
        viewModel.filteredContent.observe(viewLifecycleOwner, Observer { contentList ->
            contentAdapter.submitList(contentList)
        })

        viewModel.navigateBack.observe(viewLifecycleOwner, Observer {
            if (it) {
                val classroom = args.classroom
                classroom!!.contentIds = (binding.contentList.adapter as ContentListAdapter).usersInGroup.toList()
                val contentChosen = viewModel.allContent.value?.filter { classroom.contentIds.contains(it.id) }
                logMessage("Navigating back to call settings with content: ${classroom.contentIds} ${contentChosen?.map { it.titleText }}")
                findNavController().navigate(
                    HomeFragmentDirections.actionHomeFragmentToCallSettingsFragment(classroom).setSelectedStudents(args.selectedStudents)
                )
                viewModel.doneNavigating()
            }
        })

        // This observer only updates the chips, not the list.
        viewModel.filtersChosen.observe(viewLifecycleOwner, Observer { filterCriteria ->
            binding.filterContentBtn.isClickable = true
            setChips(filterCriteria)
        })

        // --- SETUP UI WIDGET LISTENERS ---
        binding.confirmCotentBtn.setOnClickListener {
            val contents = (binding.contentList.adapter as ContentListAdapter).usersInGroup
            val classroom = args.classroom
            classroom!!.contentIds = contents.toList()
            viewModel.updateClassroomContent(classroom)
        }

        binding.filterContentBtn.setOnClickListener {
            showFilterDialog()
        }

        return binding.root
    }

    private fun showFilterDialog() {
        val dialogBinding: FilterContentBinding = DataBindingUtil.inflate(
            layoutInflater,
            R.layout.filter_content,
            null,
            false
        )
        dialogBinding.viewModel = viewModel
        dialogBinding.lifecycleOwner = viewLifecycleOwner

        val currentFilters = viewModel.filtersChosen.value ?: FilterCriteria()
        dialogBinding.languagesList.adapter = FilterContentAdapter(usersInGroup = currentFilters.languages.toMutableSet())
        dialogBinding.experiencesList.adapter = FilterContentAdapter(usersInGroup = currentFilters.experiences.toMutableSet())

        val dialogBuilder = AlertDialog.Builder(requireContext())
        dialogBuilder.setView(dialogBinding.root)
        alertDialog = dialogBuilder.create()
        alertDialog.window?.apply {
            setBackgroundDrawableResource(R.drawable.rounded_assign_leader)
            setGravity(Gravity.CENTER)
        }

        dialogBinding.applyFiltersBtn.setOnClickListener {
            val languages = (dialogBinding.languagesList.adapter as FilterContentAdapter).usersInGroup
            val experiences = (dialogBinding.experiencesList.adapter as FilterContentAdapter).usersInGroup
            viewModel.setFiltersChosen(FilterCriteria(languages, experiences))
            logMessage("Applied filters: $languages - $experiences")
            alertDialog.dismiss()
        }

        dialogBinding.clearFiltersBtn.setOnClickListener {
            logMessage("Cleared filters")
            viewModel.clearFilters()
            alertDialog.dismiss()
        }
        alertDialog.show()
    }

    private fun setChips(filterCriteria: FilterCriteria) {
        binding.filterChips.removeAllViews()
        filterCriteria.languages.forEach { language ->
            addChip(language)
        }
        filterCriteria.experiences.forEach { experience ->
            addChip(experience)
        }
    }

    private fun addChip(filter: String) {
        val chip = Chip(binding.filterChips.context).apply {
            text = filter
            isClickable = false
            isCloseIconVisible = true
            closeIconContentDescription = "Remove $filter filter"
            setChipBackgroundColorResource(R.color.seeds_yellow)
            setTextColor(binding.filterChips.context.getColor(R.color.white))
            setTextAppearance(R.style.filterChips)
            setOnCloseIconClickListener {
                viewModel.removeFilter(filter)
                // The chip will be removed automatically by the `filtersChosen` observer calling setChips.
            }
        }
        binding.filterChips.addView(chip)
    }

    override fun onStart() {
        lifecycleScope.launch {
            logMessage("onStart")
            viewModel.registerUser()
            // We no longer need to manually clear text or apply filters here.
            // The ViewModel's state will be preserved and the observers will handle everything.
        }
        super.onStart()
    }

    override fun onStop() {
        logMessage("onStop")
        super.onStop()
    }
}