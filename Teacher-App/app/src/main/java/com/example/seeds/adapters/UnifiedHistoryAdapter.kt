package com.example.seeds.adapters

import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.seeds.databinding.UnifiedHistoryItemRowBinding
import com.example.seeds.model.ContentHistoryItem
import com.example.seeds.model.HistoryItem
import com.example.seeds.model.SessionHistoryItem

class UnifiedHistoryAdapter(
    private val onContentClick: (ContentHistoryItem) -> Unit,
    private val onSessionClick: (SessionHistoryItem) -> Unit
) : ListAdapter<HistoryItem, UnifiedHistoryAdapter.ViewHolder>(HistoryDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val layoutInflater = LayoutInflater.from(parent.context)
        val binding = UnifiedHistoryItemRowBinding.inflate(layoutInflater, parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.bind(item, onContentClick, onSessionClick)
    }

    class ViewHolder(private val binding: UnifiedHistoryItemRowBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(
            item: HistoryItem,
            onContentClick: (ContentHistoryItem) -> Unit,
            onSessionClick: (SessionHistoryItem) -> Unit
        ) {
            when (item) {
                is HistoryItem.ContentItem -> {
                    binding.contentItem = item.contentHistoryItem
                    binding.sessionItem = null 
                    
                    binding.clickListener = View.OnClickListener {
                        onContentClick(item.contentHistoryItem)
                    }
                    
                    setTimestamp(item.timestamp)
                }
                is HistoryItem.SessionItem -> {
                    binding.sessionItem = item.sessionHistoryItem
                    binding.contentItem = null 
                    
                    binding.clickListener = View.OnClickListener {
                        onSessionClick(item.sessionHistoryItem)
                    }
                    
                    setTimestamp(item.timestamp)
                }
            }
            
            binding.executePendingBindings()
        }

        private fun setTimestamp(timestamp: Long) {
            val timeString = DateUtils.getRelativeTimeSpanString(
                timestamp,
                System.currentTimeMillis(),
                DateUtils.MINUTE_IN_MILLIS
            ).toString()
            binding.itemTimestamp.text = timeString
        }
    }

    class HistoryDiffCallback : DiffUtil.ItemCallback<HistoryItem>() {
        override fun areItemsTheSame(oldItem: HistoryItem, newItem: HistoryItem): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: HistoryItem, newItem: HistoryItem): Boolean {
            return oldItem == newItem
        }
    }
}