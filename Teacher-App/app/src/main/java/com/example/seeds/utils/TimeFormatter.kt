package com.example.seeds.utils

import java.util.concurrent.TimeUnit

/**
 * Utility class for formatting timestamps into human-readable relative time strings.
 */
object TimeFormatter {
    
    /**
     * Converts a Unix timestamp (milliseconds) to a relative time string.
     * Examples: "Just now", "5 minutes ago", "2 hours ago", "3 days ago"
     * 
     * @param timestamp Unix timestamp in milliseconds
     * @return Human-readable relative time string
     */
    fun getRelativeTimeString(timestamp: Long): String {
        val now = System.currentTimeMillis()
        val diff = now - timestamp
        
        if (diff < 0) {
            return "Just now"
        }
        
        val seconds = TimeUnit.MILLISECONDS.toSeconds(diff)
        val minutes = TimeUnit.MILLISECONDS.toMinutes(diff)
        val hours = TimeUnit.MILLISECONDS.toHours(diff)
        val days = TimeUnit.MILLISECONDS.toDays(diff)
        
        return when {
            seconds < 60 -> "Just now"
            minutes < 60 -> if (minutes == 1L) "1 minute ago" else "$minutes minutes ago"
            hours < 24 -> if (hours == 1L) "1 hour ago" else "$hours hours ago"
            days < 7 -> if (days == 1L) "1 day ago" else "$days days ago"
            days < 30 -> {
                val weeks = days / 7
                if (weeks == 1L) "1 week ago" else "$weeks weeks ago"
            }
            days < 365 -> {
                val months = days / 30
                if (months == 1L) "1 month ago" else "$months months ago"
            }
            else -> {
                val years = days / 365
                if (years == 1L) "1 year ago" else "$years years ago"
            }
        }
    }
    
    /**
     * Formats a timestamp to a short date string.
     * Format: "MMM dd, yyyy" (e.g., "Dec 11, 2025")
     */
    fun getShortDateString(timestamp: Long): String {
        val date = java.util.Date(timestamp)
        val format = java.text.SimpleDateFormat("MMM dd, yyyy", java.util.Locale.getDefault())
        return format.format(date)
    }
    
    /**
     * Formats a timestamp to a time string.
     * Format: "hh:mm a" (e.g., "02:30 PM")
     */
    fun getTimeString(timestamp: Long): String {
        val date = java.util.Date(timestamp)
        val format = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault())
        return format.format(date)
    }
}
