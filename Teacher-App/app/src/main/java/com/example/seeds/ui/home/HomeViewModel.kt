package com.example.seeds.ui.home

import android.util.Log
import com.example.seeds.model.Classroom
import com.example.seeds.model.Content
import com.example.seeds.repository.ClassroomRepository
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.TeacherRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val teacherRepository: TeacherRepository,
    private val contentRepository: ContentRepository,
    private val classroomRepository: ClassroomRepository
) : ViewModel() {

    val args = HomeFragmentArgs.fromSavedStateHandle(savedStateHandle)
    val showConfirmButton = args.classroom

    private val _allContent = MutableLiveData<List<Content>>(emptyList())
    val allContent: LiveData<List<Content>> get() = _allContent
    private val _filtersChosen = MutableLiveData(FilterCriteria())
    private val _searchQuery = MutableLiveData("") 

    // --- UI-VISIBLE LIVE DATA ---
    val languages: LiveData<List<String>> = Transformations.map(_allContent) { list ->
        list.map { it.language.lowercase() }.distinct().map { lang -> lang.capitalize() }
    }
    val experiences: LiveData<List<String>> = Transformations.map(_allContent) { list ->
        list.map { it.type.lowercase() }.distinct().map { exp -> exp.capitalize() }
    }
    val filtersChosen: LiveData<FilterCriteria> get() = _filtersChosen

    private val _navigateBack = MutableLiveData(false)
    val navigateBack: LiveData<Boolean> get() = _navigateBack

    // --- PAGINATION STATE ---
    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> get() = _isLoading
    private var nextCursor: String? = null
    private var hasMore: Boolean = true
    private var isRequestInProgress: Boolean = false
    private val _filteredContent = MediatorLiveData<List<Content>>()
    val filteredContent: LiveData<List<Content>> get() = _filteredContent

    init {
        _filteredContent.addSource(_allContent) { recalculateFinalList() }
        _filteredContent.addSource(_filtersChosen) { recalculateFinalList() }
        _filteredContent.addSource(_searchQuery) { recalculateFinalList() }

        fetchInitialContent()
    }

    private fun recalculateFinalList() {
        val allContent = _allContent.value ?: emptyList()
        val filters = _filtersChosen.value ?: FilterCriteria()
        val query = _searchQuery.value ?: ""

        val filteredList = if (filters.languages.isEmpty() && filters.experiences.isEmpty()) {
            allContent
        } else {
            allContent.filter { content ->
                val matchesLanguage = filters.languages.isEmpty() || filters.languages.map { it.lowercase() }.contains(content.language.lowercase())
                val matchesExperience = filters.experiences.isEmpty() || filters.experiences.map { it.lowercase() }.contains(content.type.lowercase())
                matchesLanguage && matchesExperience
            }
        }

        val searchedList = if (query.isBlank()) {
            filteredList
        } else {
            filteredList.filter { it.titleText.lowercase().contains(query.lowercase()) }
        }
        _filteredContent.value = searchedList
    }

    fun fetchInitialContent() {
        if (isRequestInProgress) return
        viewModelScope.launch {
            isRequestInProgress = true
            _isLoading.postValue(true)
            try {
                val response = contentRepository.getAllContent(cursor = null)
                _allContent.postValue(response.data) 
                nextCursor = response.pagination.nextCursor
                hasMore = response.pagination.hasMore
            } catch (e: Exception) {
                Log.e("HomeViewModel", "Failed to fetch initial content", e)
                _allContent.postValue(emptyList())
            } finally {
                isRequestInProgress = false
                _isLoading.postValue(false)
            }
        }
    }

    fun loadMoreContent() {
        if (isRequestInProgress || !hasMore) return
        viewModelScope.launch {
            isRequestInProgress = true
            _isLoading.postValue(true)
            try {
                val response = contentRepository.getAllContent(cursor = nextCursor)
                val currentList = _allContent.value ?: emptyList()
                _allContent.postValue(currentList + response.data) 
                nextCursor = response.pagination.nextCursor
                hasMore = response.pagination.hasMore
            } catch (e: Exception) {
                Log.e("HomeViewModel", "Failed to load more content", e)
            } finally {
                isRequestInProgress = false
                _isLoading.postValue(false)
            }
        }
    }

    // --- ACTIONS FROM THE FRAGMENT ---

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query 
    }

    fun setFiltersChosen(newFilter: FilterCriteria) {
        _filtersChosen.value = newFilter
    }
    
    // Deleting applyFilters as the Mediator handles it automatically.

    fun removeFilter(filter: String) {
        val currentFilters = _filtersChosen.value ?: FilterCriteria()
        val updatedLanguages = currentFilters.languages.toMutableSet().apply { remove(filter) }
        val updatedExperiences = currentFilters.experiences.toMutableSet().apply { remove(filter) }
        setFiltersChosen(FilterCriteria(updatedLanguages, updatedExperiences))
    }

    fun clearFilters() {
        setFiltersChosen(FilterCriteria())
    }

    fun updateClassroomContent(classroom: Classroom) {
        viewModelScope.launch {
            classroomRepository.saveClassroom(classroom)
            _navigateBack.value = true
        }
    }

    fun doneNavigating() { _navigateBack.value = false }
    suspend fun registerUser() { teacherRepository.register() }
}