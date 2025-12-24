package com.example.seeds.model

sealed class HistoryItem {
    abstract val timestamp: Long
    abstract val id: String

    data class ContentItem(val contentHistoryItem: ContentHistoryItem) : HistoryItem() {
        override val timestamp: Long get() = contentHistoryItem.timestamp
        override val id: String get() = "${contentHistoryItem.content.id}_${contentHistoryItem.timestamp}"
    }

    data class SessionItem(val sessionHistoryItem: SessionHistoryItem) : HistoryItem() {
        override val timestamp: Long get() = sessionHistoryItem.timestamp
        override val id: String get() = "${sessionHistoryItem.groupId}_${sessionHistoryItem.timestamp}"
    }
}