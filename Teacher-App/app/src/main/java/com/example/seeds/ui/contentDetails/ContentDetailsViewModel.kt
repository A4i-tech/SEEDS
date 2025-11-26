package com.example.seeds.ui.contentDetails

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.Content
import com.example.seeds.repository.ContentRepository
import com.example.seeds.repository.UserPreferencesRepository // <--- 1. Import This
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContentDetailsViewModel @Inject constructor(
    val savedStateHandle: SavedStateHandle,
    val contentRepository: ContentRepository,
    private val userPreferencesRepository: UserPreferencesRepository // <--- 2. Inject This
) : ViewModel() {

    // Get current content from navigation args
    val content = ContentDetailsFragmentArgs.fromSavedStateHandle(savedStateHandle).content

    // Observable content (current item displayed). Initialize with the nav-arg content.
    val currentContent = MutableLiveData<Content>(content)

    // SAS URL for current content
    private val _contentUrl = MutableLiveData<String?>(null)
    val contentUrl: MutableLiveData<String?>
        get() = _contentUrl

    // Optional: store list of contents if loaded in advance
    private val contentsList = mutableListOf<Content>()
    private var currentIndex = 0

    fun setContents(contents: List<Content>) {
        contentsList.clear()
        contentsList.addAll(contents)
        currentIndex = contentsList.indexOfFirst { it.id == currentContent.value?.id }
        if (currentIndex < 0) currentIndex = 0
    }

    fun refreshContentUrl() {
        val content = currentContent.value ?: return

        // <--- 3. SAVE TO HISTORY HERE ---
        // Whenever we prepare the URL (which happens on load and next page), we save state.
        viewModelScope.launch {
            userPreferencesRepository.saveLastPlayedContent(content)
        }
        // ------------------------------

        // Prefer the first audioContent entry if available
        val src = when {
            content.audioContent.isNotEmpty() -> content.audioContent.first().audioUrl
            content.title?.audioUrl != null -> content.title.audioUrl
            content.theme?.audioUrl != null -> content.theme.audioUrl
            else -> null
        } ?: return  // No URL found

        viewModelScope.launch {
            try {
                // Optionally fetch SAS token if needed, else use src directly
                _contentUrl.value = contentRepository.getContentSas(src)
            } catch (ex: Exception) {
                _contentUrl.value = null
            }
        }
    }


    /**
     * Move to next content from the provided contentsList. Returns true if moved.
     */
    fun loadNextContent(): Boolean {
        if (contentsList.isEmpty()) return false
        if (currentIndex >= contentsList.size - 1) return false
        currentIndex++
        currentContent.value = contentsList[currentIndex]
        
        // This will trigger the save logic inside refreshContentUrl again for the new page
        refreshContentUrl() 
        return true
    }
}
