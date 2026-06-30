package com.example.seeds.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * Wraps a Content object with playback metadata for history tracking.
 * Used to maintain a chronological list of recently played content items.
 */
@Parcelize
data class ContentHistoryItem(
    val content: Content,
    val timestamp: Long,  // Unix timestamp in milliseconds when content was last played
    val contentId: String = content._id,  // Denormalized for easier deduplication
    val classroomName: String? = null,  // Classroom/group name where content was played
    val studentCount: Int? = null,  // Number of students in the session
    val wasConference: Boolean = false  // Whether this was a conference call
) : Parcelable {
    
    /**
     * Helper to check if this history item refers to the same content as another.
     * Used for move-to-top deduplication strategy.
     */
    fun isSameContent(other: ContentHistoryItem): Boolean {
        return contentId == other.contentId
    }
    
    /**
     * Helper to check if this history item refers to a specific content ID.
     */
    fun isSameContent(id: String): Boolean {
        return contentId == id
    }
}
