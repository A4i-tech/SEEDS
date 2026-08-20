package com.example.seeds.ui.voiceCommand

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.example.seeds.R
import com.example.seeds.databinding.ItemVoiceResultBinding

class VoiceResultItemAdapter :
    RecyclerView.Adapter<VoiceResultItemAdapter.ResultViewHolder>() {

    private var items: List<FormattedResult> = emptyList()

    fun submit(list: List<FormattedResult>) {
        val diff = DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize() = items.size
            override fun getNewListSize() = list.size
            override fun areItemsTheSame(o: Int, n: Int) = items[o].title == list[n].title
            override fun areContentsTheSame(o: Int, n: Int) = items[o] == list[n]
        })
        items = list
        diff.dispatchUpdatesTo(this)
    }

    inner class ResultViewHolder(val binding: ItemVoiceResultBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: FormattedResult) {
            val ctx = binding.root.context
            val color = ContextCompat.getColor(
                ctx, if (item.isSuccess) R.color.seeds_green else R.color.seeds_orange
            )
            binding.resultCard.strokeColor = color
            binding.statusIcon.text = if (item.isSuccess) "✓" else "✕"
            binding.statusIcon.setTextColor(color)
            binding.resultTitle.text = item.title
            binding.resultSummary.text = item.summary

            if (item.items.isEmpty()) {
                binding.resultItems.visibility = View.GONE
            } else {
                // Cap at 10 like the web panel; append an "…and N more" line beyond that.
                val shown = item.items.take(10).joinToString("\n") { "• $it" }
                val extra = item.items.size - 10
                binding.resultItems.text = if (extra > 0) "$shown\n…and $extra more" else shown
                binding.resultItems.visibility = View.VISIBLE
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ResultViewHolder {
        val binding = ItemVoiceResultBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ResultViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ResultViewHolder, position: Int) =
        holder.bind(items[position])

    override fun getItemCount() = items.size
}
