package com.example.seeds.model

data class SessionHistoryItem(
    val groupId: String,
    val groupName: String,
    val timestamp: Long,
    val studentCount: Int,
    val wasConference: Boolean
)