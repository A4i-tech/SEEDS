package com.example.seeds.utils

import com.example.seeds.model.CallerState
import com.example.seeds.model.Student
import com.example.seeds.model.StudentCallStatus

/**
 * Utility for call-related logic, aligned with teacher-webapp (e.g. phone normalization, initial state).
 */
object CallUtils {

    /**
     * Normalizes a phone number to the format expected by the conference API (91XXXXXXXXXX).
     * Mirrors [teacher-webapp] utils/phoneUtils.js.
     */
    fun normalizePhoneNumber(phoneNumber: String?): String {
        if (phoneNumber.isNullOrBlank()) return ""
        val normalized = if (phoneNumber.startsWith("91")) phoneNumber else "91$phoneNumber"
        return normalized
    }

    /**
     * Returns true if [student]'s phone is in [selectedStudentPhones] (normalized comparison).
     */
    fun isStudentSelected(student: Student, selectedStudentPhones: Set<String>): Boolean {
        val normalized = normalizePhoneNumber(student.phoneNumber)
        return selectedStudentPhones.contains(normalized) || selectedStudentPhones.contains(student.phoneNumber)
    }

    /**
     * Builds initial [StudentCallStatus] list for selected students (RINGING, not muted).
     * Filters [students] to those in [selectedStudentPhones] and maps to call status.
     */
    fun buildInitialCallStatuses(
        students: List<Student>,
        selectedStudentPhones: Set<String>
    ): List<StudentCallStatus> {
        return students
            .filter { isStudentSelected(it, selectedStudentPhones) }
            .map { student ->
                StudentCallStatus(
                    name = student.name,
                    phoneNumber = student.phoneNumber,
                    callerState = CallerState.RINGING,
                    isMuted = false,
                    onHold = false,
                    raiseHand = false
                )
            }
    }
}
