package com.example.seeds.adapters

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.seeds.databinding.ContentHistoryItemRowBinding
import com.example.seeds.databinding.SessionHistoryItemRowBinding
import com.example.seeds.model.ContentHistoryItem
import com.example.seeds.model.HistoryItem
import com.example.seeds.model.SessionHistoryItem
import com.example.seeds.utils.TimeFormatter
import java.text.SimpleDateFormat
import java.util.*

/**
 * Unified adapter for displaying both content and session history items.
 */
class UnifiedHistoryAdapter(
    private val onContentClick: (ContentHistoryItem) -> Unit,
    private val onSessionClick: (SessionHistoryItem) -> Unit
) : ListAdapter<HistoryItem, RecyclerView.ViewHolder>(DiffCallback) {

    companion object {
        private const val TYPE_CONTENT = 0
        private const val TYPE_SESSION = 1
        
        private object DiffCallback : DiffUtil.ItemCallback<HistoryItem>() {
            override fun areItemsTheSame(oldItem: HistoryItem, newItem: HistoryItem): Boolean {
                return when {
                    oldItem is HistoryItem.ContentItem && newItem is HistoryItem.ContentItem ->
                        oldItem.historyItem.contentId == newItem.historyItem.contentId
                    oldItem is HistoryItem.SessionItem && newItem is HistoryItem.SessionItem ->
                        oldItem.historyItem.groupId == newItem.historyItem.groupId &&
                                oldItem.historyItem.timestamp == newItem.historyItem.timestamp
                    else -> false
                }
            }

            override fun areContentsTheSame(oldItem: HistoryItem, newItem: HistoryItem): Boolean {
                return oldItem == newItem
            }
        }
    }

    override fun getItemViewType(position: Int): Int {
        return when (getItem(position)) {
            is HistoryItem.ContentItem -> TYPE_CONTENT
            is HistoryItem.SessionItem -> TYPE_SESSION
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return when (viewType) {
            TYPE_CONTENT -> {
                val binding = ContentHistoryItemRowBinding.inflate(
                    LayoutInflater.from(parent.context),
                    parent,
                    false
                )
                ContentViewHolder(binding, onContentClick)
            }
            TYPE_SESSION -> {
                val binding = SessionHistoryItemRowBinding.inflate(
                    LayoutInflater.from(parent.context),
                    parent,
                    false
                )
                SessionViewHolder(binding, onSessionClick)
            }
            else -> throw IllegalArgumentException("Unknown view type: $viewType")
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = getItem(position)) {
            is HistoryItem.ContentItem -> (holder as ContentViewHolder).bind(item.historyItem)
            is HistoryItem.SessionItem -> (holder as SessionViewHolder).bind(item.historyItem)
        }
    }

    class ContentViewHolder(
        private val binding: ContentHistoryItemRowBinding,
        private val onContentClick: (ContentHistoryItem) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(historyItem: ContentHistoryItem) {
            binding.historyItem = historyItem
            
            val relativeTime = TimeFormatter.getRelativeTimeString(historyItem.timestamp)
            binding.timestampText.text = relativeTime
            
            binding.root.setOnClickListener {
                onContentClick(historyItem)
            }
            
            binding.executePendingBindings()
        }
    }

    class SessionViewHolder(
        private val binding: SessionHistoryItemRowBinding,
        private val onSessionClick: (SessionHistoryItem) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(sessionItem: SessionHistoryItem) {
            binding.sessionItem = sessionItem
            
            // Set session title without emojis
            val sessionType = if (sessionItem.wasConference) "Conference" else "Classroom"
            binding.sessionTitle.text = "${sessionItem.groupName} • $sessionType"
            
            // Set session metadata
            binding.sessionMetadata.text = "${sessionItem.studentCount} students"
            
            // Format timestamp
            binding.timestampText.text = getRelativeTime(sessionItem.timestamp)
            
            binding.root.setOnClickListener {
                onSessionClick(sessionItem)
            }
            
            binding.executePendingBindings()
        }
        
        private fun getRelativeTime(timestamp: Long): String {
            val now = System.currentTimeMillis()
            val diff = now - timestamp
            
            return when {
                diff < 60_000 -> "Just now"
                diff < 3600_000 -> "${diff / 60_000} min ago"
                diff < 86400_000 -> "${diff / 3600_000} hours ago"
                diff < 604800_000 -> "${diff / 86400_000} days ago"
                else -> {
                    val dateFormat = SimpleDateFormat("MMM dd, yyyy", Locale.getDefault())
                    dateFormat.format(Date(timestamp))
                }
            }
        }
    }
}
