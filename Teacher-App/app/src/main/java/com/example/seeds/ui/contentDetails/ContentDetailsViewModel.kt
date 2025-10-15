package com.example.seeds.ui.contentDetails

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.seeds.model.Content
import com.example.seeds.repository.ContentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContentDetailsViewModel @Inject constructor(
    val savedStateHandle: SavedStateHandle,
    val contentRepository: ContentRepository
) : ViewModel() {

    // Get current content from navigation args (same as before)
    val content = ContentDetailsFragmentArgs.fromSavedStateHandle(savedStateHandle).content

    // Observable content (current item displayed). Initialize with the nav-arg content.
    val currentContent = MutableLiveData<Content>(content)

    // SAS URL for current content
    private val _contentUrl = MutableLiveData<String?>(null)
    val contentUrl: MutableLiveData<String?>
        get() = _contentUrl

    // Optional: store list of contents if loaded in advance (from pagination); caller can provide it
    private val contentsList = mutableListOf<Content>()
    private var currentIndex = 0

    fun setContents(contents: List<Content>) {
        contentsList.clear()
        contentsList.addAll(contents)
        // Find current index based on currentContent (nav-arg)
        currentIndex = contentsList.indexOfFirst { it.id == currentContent.value?.id }
        if (currentIndex < 0) currentIndex = 0
    }

    fun refreshContentUrl() {
        val content = currentContent.value ?: return
        val src = "https://seedscontent.blob.core.windows.net/output-original/${content.id}.mp3"
        viewModelScope.launch {
            try {
                _contentUrl.value = contentRepository.getContentSas(src)
            } catch (ex: Exception) {
                // You may want to handle errors more gracefully (expose an error LiveData, etc.)
                _contentUrl.value = null
            }
        }
    }

    /**
     * Move to next content from the provided contentsList. Returns true if moved.
     * Caller must call setContents(...) before using this if relying on a list.
     */
    fun loadNextContent(): Boolean {
        if (contentsList.isEmpty()) return false
        if (currentIndex >= contentsList.size - 1) return false
        currentIndex++
        currentContent.value = contentsList[currentIndex]
        refreshContentUrl()
        return true
    }
}


