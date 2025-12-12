package com.example.seeds.model

/**
 * Sealed class representing different types of history items
 * that can be displayed in the recent activity feed.
 */
sealed class HistoryItem {
    abstract val timestamp: Long
    
    data class ContentItem(
        val historyItem: ContentHistoryItem
    ) : HistoryItem() {
        override val timestamp: Long get() = historyItem.timestamp
    }
    
    data class SessionItem(
        val historyItem: SessionHistoryItem
    ) : HistoryItem() {
        override val timestamp: Long get() = historyItem.timestamp
    }
}
