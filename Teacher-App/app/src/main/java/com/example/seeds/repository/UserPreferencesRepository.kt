package com.example.seeds.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.example.seeds.model.Classroom
import com.example.seeds.model.SessionHistoryItem
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

// 1. Setup DataStore (Same as before)
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "seeds_user_config")

// 2. Wrapper Data Class (To send all data to ViewModels easily)
data class UserPrefs(
    val userId: String = "",
    val userName: String = "",
    
    // Quick Start / Last Call Details
    val lastConferenceId: String = "",
    val lastClassroomId: String = "",
    val lastClassroomName: String = "",
    val lastStudentIds: Set<String> = emptySet(),
    
    // Resume / Active State
    val activeGroupId: String = "",
    val activeStudentIds: Set<String> = emptySet(),
    val isAudioPlaying: Boolean = false,
    val activeContentId: String = "",
    
    // History List
    val history: List<SessionHistoryItem> = emptyList()
)

@Singleton
class UserPreferencesRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val dataStore = context.dataStore
    private val gson = Gson() 

    // 3. Define ALL Keys here
    private object Keys {
        // User Info
        val USER_ID = stringPreferencesKey("user_id")
        val USER_NAME = stringPreferencesKey("user_name")
        val PHONE = stringPreferencesKey("user_phone")

        // Offline Cache (Stored as JSON String - Existing)
        val CLASSROOMS_JSON = stringPreferencesKey("classrooms_cache_json")

        // Resume State (Crash Recovery)
        val ACTIVE_GROUP_ID = stringPreferencesKey("active_group_id")
        val ACTIVE_STUDENT_IDS = stringSetPreferencesKey("active_student_ids")
        val IS_CONFERENCE_MODE = booleanPreferencesKey("is_conference_mode")
        val ACTIVE_CONTENT_ID = stringPreferencesKey("active_content_id")
        val IS_AUDIO_PLAYING = booleanPreferencesKey("is_audio_playing")

        // Quick Start / Last Call Details (Includes Conference ID)
        val LAST_CONF_ID = stringPreferencesKey("last_conference_id") 
        val LAST_CLASSROOM_ID = stringPreferencesKey("last_classroom_id")
        val LAST_CLASSROOM_NAME = stringPreferencesKey("last_classroom_name")
        val LAST_STUDENT_IDS = stringSetPreferencesKey("last_student_ids")

        // History (Stored as JSON String - New)
        val HISTORY_JSON = stringPreferencesKey("history_json")
    }

    // 4. Main Data Flow (Parses JSONs automatically)
    val userPrefs: Flow<UserPrefs> = dataStore.data.map { prefs ->
        
        // Deserialize History JSON
        val historyJson = prefs[Keys.HISTORY_JSON]
        val historyList: List<SessionHistoryItem> = if (!historyJson.isNullOrEmpty()) {
            val type = object : TypeToken<List<SessionHistoryItem>>() {}.type
            gson.fromJson(historyJson, type)
        } else {
            emptyList()
        }

        UserPrefs(
            userId = prefs[Keys.USER_ID] ?: "",
            userName = prefs[Keys.USER_NAME] ?: "",
            
            lastConferenceId = prefs[Keys.LAST_CONF_ID] ?: "",
            lastClassroomId = prefs[Keys.LAST_CLASSROOM_ID] ?: "",
            lastClassroomName = prefs[Keys.LAST_CLASSROOM_NAME] ?: "",
            lastStudentIds = prefs[Keys.LAST_STUDENT_IDS] ?: emptySet(),

            activeGroupId = prefs[Keys.ACTIVE_GROUP_ID] ?: "",
            activeStudentIds = prefs[Keys.ACTIVE_STUDENT_IDS] ?: emptySet(),
            isAudioPlaying = prefs[Keys.IS_AUDIO_PLAYING] ?: false,
            activeContentId = prefs[Keys.ACTIVE_CONTENT_ID] ?: "",
            
            history = historyList
        )
    }

    // --- SAVE FUNCTIONS ---

    suspend fun saveUser(id: String, name: String, phone: String) {
        dataStore.edit { 
            it[Keys.USER_ID] = id
            it[Keys.USER_NAME] = name
            it[Keys.PHONE] = phone
        }
    }

    // --- CLASSROOM CACHING (Your existing JSON logic) ---
    suspend fun saveClassrooms(classrooms: List<Classroom>) {
        val jsonString = gson.toJson(classrooms)
        dataStore.edit { prefs ->
            prefs[Keys.CLASSROOMS_JSON] = jsonString
        }
    }

    val cachedClassroomsFlow: Flow<List<Classroom>> = dataStore.data.map { prefs ->
        val jsonString = prefs[Keys.CLASSROOMS_JSON]
        if (jsonString.isNullOrEmpty()) {
            emptyList()
        } else {
            val type = object : TypeToken<List<Classroom>>() {}.type
            gson.fromJson(jsonString, type)
        }
    }

    // --- RESUME STATE (Called when call starts) ---
    suspend fun saveSessionState(groupId: String, studentIds: Set<String>, isConference: Boolean) {
        dataStore.edit { 
            it[Keys.ACTIVE_GROUP_ID] = groupId
            it[Keys.ACTIVE_STUDENT_IDS] = studentIds
            it[Keys.IS_CONFERENCE_MODE] = isConference
        }
    }

    // --- AUDIO STATE (Called when Play/Pause clicked) ---
    suspend fun saveAudioState(contentId: String, isPlaying: Boolean) {
        dataStore.edit { 
            it[Keys.ACTIVE_CONTENT_ID] = contentId
            it[Keys.IS_AUDIO_PLAYING] = isPlaying
        }
    }

    // --- QUICK START / LAST CALL (Saves Conf ID) ---
    suspend fun saveLastCallDetails(
        conferenceId: String, 
        classroomId: String, 
        classroomName: String, 
        studentIds: Set<String>
    ) {
        dataStore.edit { 
            it[Keys.LAST_CONF_ID] = conferenceId
            it[Keys.LAST_CLASSROOM_ID] = classroomId
            it[Keys.LAST_CLASSROOM_NAME] = classroomName
            it[Keys.LAST_STUDENT_IDS] = studentIds
            
            // Also update Active state to ensure Resume works if crash happens now
            it[Keys.ACTIVE_GROUP_ID] = classroomId
            it[Keys.ACTIVE_STUDENT_IDS] = studentIds
        }
    }

    // --- HISTORY (Uses JSON Strategy) ---
    suspend fun addSessionToHistory(item: SessionHistoryItem) {
        dataStore.edit { prefs ->
            // 1. Get existing JSON
            val currentJson = prefs[Keys.HISTORY_JSON]
            
            // 2. Convert JSON -> List
            val currentList: List<SessionHistoryItem> = if (!currentJson.isNullOrEmpty()) {
                val type = object : TypeToken<List<SessionHistoryItem>>() {}.type
                gson.fromJson(currentJson, type)
            } else {
                emptyList()
            }

            // 3. Add new item to top, keep max 10
            val newList = (listOf(item) + currentList).take(10)
            
            // 4. Convert List -> JSON -> Save
            prefs[Keys.HISTORY_JSON] = gson.toJson(newList)
        }
    }

    // --- CLEAR SESSION (Called on End Call) ---
    suspend fun clearSession() {
        dataStore.edit { 
            it.remove(Keys.ACTIVE_GROUP_ID)
            it.remove(Keys.ACTIVE_STUDENT_IDS)
            it.remove(Keys.ACTIVE_CONTENT_ID)
            it.remove(Keys.IS_AUDIO_PLAYING)
        }
    }
    
    suspend fun getCachedClassrooms(): List<Classroom> {
        var classrooms: List<Classroom> = emptyList()
        dataStore.edit { prefs ->
            val jsonString = prefs[Keys.CLASSROOMS_JSON]
            if (!jsonString.isNullOrEmpty()) {
                val type = object : TypeToken<List<Classroom>>() {}.type
                classrooms = gson.fromJson(jsonString, type)
            }
        }
        return classrooms
    }
}