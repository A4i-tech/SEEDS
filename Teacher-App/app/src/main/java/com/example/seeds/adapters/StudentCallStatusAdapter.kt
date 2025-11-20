package com.example.seeds.adapters

import android.view.LayoutInflater
import android.util.Log
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.seeds.databinding.StudentCallItemRowBinding
import com.example.seeds.model.StudentCallStatus
import com.example.seeds.ui.call.CallViewModel

class StudentCallStatusAdapter(
    private val viewModel: CallViewModel,
    private val removeClickListener: OnClickListener
) : ListAdapter<StudentCallStatus, StudentCallStatusAdapter.ViewHolder>(DiffCallback) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(
            StudentCallItemRowBinding.inflate(
                LayoutInflater.from(parent.context),
                parent,
                false
            )
        )
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val student = getItem(position)
        Log.d("ADAPTER_DEBUG", "REDRAWING student: ${student.name} with state: ${student.callerState}")
        holder.bind(student, viewModel, removeClickListener)
    }

    class ViewHolder(private val binding: StudentCallItemRowBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(
            student: StudentCallStatus,
            viewModel: CallViewModel,
            removeListener: OnClickListener
        ) {
            binding.studentCallStatus = student
            binding.viewModel = viewModel
            binding.removeClickListener = removeListener
            binding.executePendingBindings()
        }
    }

    companion object DiffCallback : DiffUtil.ItemCallback<StudentCallStatus>() {
        override fun areItemsTheSame(oldItem: StudentCallStatus, newItem: StudentCallStatus): Boolean {
            return oldItem.phoneNumber == newItem.phoneNumber
        }

        override fun areContentsTheSame(oldItem: StudentCallStatus, newItem: StudentCallStatus): Boolean {
            return oldItem == newItem
        }
    }

    class OnClickListener(val clickListener: (student: StudentCallStatus) -> Unit) {
        fun onClick(student: StudentCallStatus) = clickListener(student)
    }
}