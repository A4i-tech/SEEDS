package com.example.seeds.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.example.seeds.model.Content
import com.example.seeds.model.ContentHistoryItem
import com.example.seeds.model.Classroom
import com.example.seeds.model.SessionHistoryItem
import com.example.seeds.utils.Constants
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "seeds_user_config")

data class UserPrefs(
    val userId: String = "",
    val userName: String = "",
    
    // Resume State
    val lastActionType: String = "CALL", // "CALL" or "CONTENT"
    val lastClassroomId: String = "",
    
    // SEPARATE STORAGE:
    val lastContentJson: String = "",       
    val lastCallContentJson: String = "",   

    // Other existing fields...
    val activeGroupId: String = "",
    val activeStudentIds: Set<String> = emptySet(),
    val isAudioPlaying: Boolean = false,
    val activeContentId: String = "",
    val history: List<SessionHistoryItem> = emptyList(),
    val contentHistory: List<ContentHistoryItem> = emptyList(),
    val lastConferenceId: String = "",
    val lastClassroomName: String = "",
    val lastStudentIds: Set<String> = emptySet()
)

@Singleton
class UserPreferencesRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val dataStore = context.dataStore
    private val gson = Gson() 

    private object Keys {
        val USER_ID = stringPreferencesKey("user_id")
        val USER_NAME = stringPreferencesKey("user_name")
        val PHONE = stringPreferencesKey("user_phone")
        val CLASSROOMS_JSON = stringPreferencesKey("classrooms_cache_json")

        // Keys for Logic
        val LAST_ACTION_TYPE = stringPreferencesKey("last_action_type")
        val LAST_CLASSROOM_ID = stringPreferencesKey("last_classroom_id")
        
        // SEPARATE KEYS FOR AUDIO
        val LAST_CONTENT_JSON = stringPreferencesKey("last_content_json")          // Standalone
        val LAST_CALL_CONTENT_JSON = stringPreferencesKey("last_call_content_json") // In-Call

        // Other keys...
        val ACTIVE_GROUP_ID = stringPreferencesKey("active_group_id")
        val ACTIVE_STUDENT_IDS = stringSetPreferencesKey("active_student_ids")
        val IS_CONFERENCE_MODE = booleanPreferencesKey("is_conference_mode")
        val ACTIVE_CONTENT_ID = stringPreferencesKey("active_content_id")
        val IS_AUDIO_PLAYING = booleanPreferencesKey("is_audio_playing")
        val LAST_CONF_ID = stringPreferencesKey("last_conference_id") 
        val LAST_CLASSROOM_NAME = stringPreferencesKey("last_classroom_name")
        val LAST_STUDENT_IDS = stringSetPreferencesKey("last_student_ids")
        val HISTORY_JSON = stringPreferencesKey("history_json")
        val CONTENT_HISTORY_JSON = stringPreferencesKey("content_history_json")
    }

    val userPrefs: Flow<UserPrefs> = dataStore.data.map { prefs ->
        val historyJson = prefs[Keys.HISTORY_JSON]
        val historyList: List<SessionHistoryItem> = if (!historyJson.isNullOrEmpty()) {
            val type = object : TypeToken<List<SessionHistoryItem>>() {}.type
            gson.fromJson(historyJson, type) ?: emptyList()
        } else {
            emptyList()
        }
        
        val contentHistoryJson = prefs[Keys.CONTENT_HISTORY_JSON]
        val contentHistoryList: List<ContentHistoryItem> = if (!contentHistoryJson.isNullOrEmpty()) {
            val type = object : TypeToken<List<ContentHistoryItem>>() {}.type
            gson.fromJson(contentHistoryJson, type) ?: emptyList()
        } else {
            emptyList()
        }

        UserPrefs(
            userId = prefs[Keys.USER_ID] ?: "",
            userName = prefs[Keys.USER_NAME] ?: "",
            lastActionType = prefs[Keys.LAST_ACTION_TYPE] ?: "CALL",
            lastClassroomId = prefs[Keys.LAST_CLASSROOM_ID] ?: "",
            
            // MAP SEPARATE JSONS
            lastContentJson = prefs[Keys.LAST_CONTENT_JSON] ?: "",
            lastCallContentJson = prefs[Keys.LAST_CALL_CONTENT_JSON] ?: "",

            activeGroupId = prefs[Keys.ACTIVE_GROUP_ID] ?: "",
            activeStudentIds = prefs[Keys.ACTIVE_STUDENT_IDS] ?: emptySet(),
            isAudioPlaying = prefs[Keys.IS_AUDIO_PLAYING] ?: false,
            activeContentId = prefs[Keys.ACTIVE_CONTENT_ID] ?: "",
            history = historyList,
            contentHistory = contentHistoryList,
            lastConferenceId = prefs[Keys.LAST_CONF_ID] ?: "",
            lastClassroomName = prefs[Keys.LAST_CLASSROOM_NAME] ?: "",
            lastStudentIds = prefs[Keys.LAST_STUDENT_IDS] ?: emptySet()
        )
    }

    suspend fun saveUser(id: String, name: String, phone: String) {
        dataStore.edit { 
            it[Keys.USER_ID] = id
            it[Keys.USER_NAME] = name
            it[Keys.PHONE] = phone
        }
    }

    // Sets mode to "CALL"
    suspend fun saveLastCallDetails(conferenceId: String, classroomId: String, classroomName: String, studentIds: Set<String>) {
        dataStore.edit { 
            it[Keys.LAST_CONF_ID] = conferenceId
            it[Keys.LAST_CLASSROOM_ID] = classroomId
            it[Keys.LAST_CLASSROOM_NAME] = classroomName
            it[Keys.ACTIVE_GROUP_ID] = classroomId
            
            it[Keys.LAST_ACTION_TYPE] = "CALL" 
        }
    }

    // Sets mode to "CONTENT"
    suspend fun saveLastPlayedContent(content: Content) {
        val json = gson.toJson(content)
        dataStore.edit { 
            it[Keys.LAST_CONTENT_JSON] = json         
            it[Keys.ACTIVE_CONTENT_ID] = content.id.toString()
            
            it[Keys.LAST_ACTION_TYPE] = "CONTENT"
        }
        // Also add to content history
        saveContentToHistory(content)
    }

    // Saves audio, but KEEPS mode as "CALL"
    // Also saves to content history with conference details
    suspend fun saveLastCallContent(
        content: Content,
        classroomName: String? = null,
        studentCount: Int? = null,
        wasConference: Boolean = true
    ) {
        val json = gson.toJson(content)
        dataStore.edit { 
            it[Keys.LAST_CALL_CONTENT_JSON] = json      
        }
        // Also add to content history with conference details
        saveContentToHistory(content, classroomName, studentCount, wasConference)
    }

    suspend fun saveClassrooms(classrooms: List<Classroom>) {
        val jsonString = gson.toJson(classrooms)
        dataStore.edit { prefs -> prefs[Keys.CLASSROOMS_JSON] = jsonString }
    }
    
    suspend fun getCachedClassrooms(): List<Classroom> {
        var classrooms: List<Classroom> = emptyList()
        dataStore.edit { prefs ->
            val jsonString = prefs[Keys.CLASSROOMS_JSON]
            if (!jsonString.isNullOrEmpty()) {
                val type = object : TypeToken<List<Classroom>>() {}.type
                classrooms = gson.fromJson(jsonString, type) ?: emptyList()
            }
        }
        return classrooms
    }

    suspend fun saveSessionState(groupId: String, studentIds: Set<String>, isConference: Boolean) {
        dataStore.edit { 
            it[Keys.ACTIVE_GROUP_ID] = groupId
            it[Keys.ACTIVE_STUDENT_IDS] = studentIds
            it[Keys.IS_CONFERENCE_MODE] = isConference
        }
    }

    suspend fun saveAudioState(contentId: String, isPlaying: Boolean) {
        dataStore.edit { 
            it[Keys.ACTIVE_CONTENT_ID] = contentId
            it[Keys.IS_AUDIO_PLAYING] = isPlaying
        }
    }

    suspend fun addSessionToHistory(item: SessionHistoryItem) {
        dataStore.edit { prefs ->
            val currentJson = prefs[Keys.HISTORY_JSON]
            val currentList: List<SessionHistoryItem> = if (!currentJson.isNullOrEmpty()) {
                val type = object : TypeToken<List<SessionHistoryItem>>() {}.type
                gson.fromJson(currentJson, type) ?: emptyList()
            } else { emptyList() }
            val newList = (listOf(item) + currentList).take(Constants.DEFAULT_SESSION_HISTORY_SIZE)
            prefs[Keys.HISTORY_JSON] = gson.toJson(newList)
        }
    }
    
    /**
     * Saves content to history with move-to-top deduplication.
     * If the content already exists in history, it's moved to the top with updated timestamp.
     * Otherwise, it's added to the top and the list is trimmed to DEFAULT_CONTENT_HISTORY_SIZE.
     * 
     * @param content The content to save
     * @param classroomName Optional classroom/group name
     * @param studentCount Optional number of students in session
     * @param wasConference Whether this was a conference call
     */
    suspend fun saveContentToHistory(
        content: Content,
        classroomName: String? = null,
        studentCount: Int? = null,
        wasConference: Boolean = false
    ) {
        dataStore.edit { prefs ->
            val currentJson = prefs[Keys.CONTENT_HISTORY_JSON]
            val currentList: List<ContentHistoryItem> = if (!currentJson.isNullOrEmpty()) {
                val type = object : TypeToken<List<ContentHistoryItem>>() {}.type
                gson.fromJson(currentJson, type) ?: emptyList()
            } else { emptyList() }
            
            // Create new history item with current timestamp and session details
            val newItem = ContentHistoryItem(
                content = content,
                timestamp = System.currentTimeMillis(),
                classroomName = classroomName,
                studentCount = studentCount,
                wasConference = wasConference
            )
            
            // Remove existing entry for this content (move-to-top deduplication)
            val filteredList = currentList.filter { !it.isSameContent(content._id) }
            
            // Add new item at the top and limit to configured size
            val newList = (listOf(newItem) + filteredList).take(Constants.DEFAULT_CONTENT_HISTORY_SIZE)
            prefs[Keys.CONTENT_HISTORY_JSON] = gson.toJson(newList)
        }
    }
    
    /**
     * Returns a Flow of content history items, ordered by most recent first.
     */
    fun getContentHistory(): Flow<List<ContentHistoryItem>> {
        return dataStore.data.map { prefs ->
            val contentHistoryJson = prefs[Keys.CONTENT_HISTORY_JSON]
            if (!contentHistoryJson.isNullOrEmpty()) {
                val type = object : TypeToken<List<ContentHistoryItem>>() {}.type
                gson.fromJson<List<ContentHistoryItem>>(contentHistoryJson, type) ?: emptyList()
            } else {
                emptyList()
            }
        }
    }

    suspend fun clearSession() {
        dataStore.edit { 
            it.remove(Keys.ACTIVE_GROUP_ID)
            it.remove(Keys.ACTIVE_STUDENT_IDS)
            it.remove(Keys.ACTIVE_CONTENT_ID)
            it.remove(Keys.IS_AUDIO_PLAYING)
        }
    }
    
    suspend fun clearContentHistory() {
        dataStore.edit { 
            it.remove(Keys.CONTENT_HISTORY_JSON)
        }
    }
}