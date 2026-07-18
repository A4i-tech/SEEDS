package com.example.seeds.adapters

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.seeds.databinding.StudentCallItemRowBinding
import com.example.seeds.model.StudentCallStatus
import com.example.seeds.model.Student
import com.example.seeds.ui.call.CallViewModel

private fun strip91(p: String): String {
    // Strip only the E.164 India country code: exactly 12 digits (91 + 10-digit number).
    // Using length > 10 would truncate any 11-digit number starting with 91 and match nobody.
    return if (p.length == 12 && p.startsWith("91")) p.substring(2) else p
}

class StudentCallStatusAdapter(
    private val viewModel: CallViewModel,
    private val allStudents: List<Student>,
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
        val status = getItem(position)
        val statusKey = strip91(status.phoneNumber)
        val matchingStudent = allStudents.find { strip91(it.phoneNumber) == statusKey }
            ?: com.example.seeds.model.Student(
                phoneNumber = status.phoneNumber,
                name = status.name,
                _id = null,
                isLeader = false
            )
        holder.bind(status, matchingStudent, viewModel, removeClickListener)
    }

    class ViewHolder(private val binding: StudentCallItemRowBinding) :
        RecyclerView.ViewHolder(binding.root) {
        
        fun bind(
            studentCallStatus: StudentCallStatus,
            student: Student, 
            viewModel: CallViewModel,
            removeListener: OnClickListener
        ) {
            binding.studentCallStatus = studentCallStatus
            binding.student = student 
            binding.viewModel = viewModel
            binding.removeClickListener = removeListener
            binding.executePendingBindings()
        }
    }

    companion object DiffCallback : DiffUtil.ItemCallback<StudentCallStatus>() {
        override fun areItemsTheSame(oldItem: StudentCallStatus, newItem: StudentCallStatus): Boolean {
            return strip91(oldItem.phoneNumber) == strip91(newItem.phoneNumber)
        }

        override fun areContentsTheSame(oldItem: StudentCallStatus, newItem: StudentCallStatus): Boolean {
            return oldItem == newItem
        }
    }

    class OnClickListener(val clickListener: (student: StudentCallStatus) -> Unit) {
        fun onClick(student: StudentCallStatus) = clickListener(student)
    }
}