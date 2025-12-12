package com.example.seeds.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.seeds.model.Content
import com.example.seeds.model.ContentHistoryItem
import com.example.seeds.model.LocalizedContent
import com.example.seeds.utils.Constants
import com.google.gson.Gson
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Unit tests for UserPreferencesRepository content history functionality.
 * Tests the move-to-top deduplication strategy and N-item limit enforcement.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class UserPreferencesRepositoryTest {

    private lateinit var context: Context
    private lateinit var repository: UserPreferencesRepository
    private val gson = Gson()

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        repository = UserPreferencesRepository(context)
    }

    @After
    fun tearDown() = runTest {
        // Clear all preferences after each test
        context.dataStore.edit { it.clear() }
    }

    @Test
    fun saveContentToHistory_addsNewContent() = runTest {
        // Given
        val content = createTestContent("1", "Test Content 1")

        // When
        repository.saveContentToHistory(content)

        // Then
        val history = repository.getContentHistory().first()
        assertEquals(1, history.size)
        assertEquals("1", history[0].contentId)
        assertEquals("Test Content 1", history[0].content.titleText)
    }

    @Test
    fun saveContentToHistory_maintainsOrderNewestFirst() = runTest {
        // Given
        val content1 = createTestContent("1", "First")
        val content2 = createTestContent("2", "Second")
        val content3 = createTestContent("3", "Third")

        // When
        repository.saveContentToHistory(content1)
        Thread.sleep(10) // Ensure different timestamps
        repository.saveContentToHistory(content2)
        Thread.sleep(10)
        repository.saveContentToHistory(content3)

        // Then
        val history = repository.getContentHistory().first()
        assertEquals(3, history.size)
        assertEquals("3", history[0].contentId) // Most recent first
        assertEquals("2", history[1].contentId)
        assertEquals("1", history[2].contentId)
    }

    @Test
    fun saveContentToHistory_movesToTopWhenDuplicate() = runTest {
        // Given
        val content1 = createTestContent("1", "Content 1")
        val content2 = createTestContent("2", "Content 2")
        val content3 = createTestContent("3", "Content 3")
        val content1Updated = createTestContent("1", "Content 1 Updated")

        // When - Add 3 items, then re-add the first one
        repository.saveContentToHistory(content1)
        Thread.sleep(10)
        repository.saveContentToHistory(content2)
        Thread.sleep(10)
        repository.saveContentToHistory(content3)
        Thread.sleep(10)
        val timestampBefore = System.currentTimeMillis()
        Thread.sleep(10)
        repository.saveContentToHistory(content1Updated)
        val timestampAfter = System.currentTimeMillis()

        // Then - Should have 3 items (not 4), with content1 at top with new timestamp
        val history = repository.getContentHistory().first()
        assertEquals(3, history.size)
        assertEquals("1", history[0].contentId) // Moved to top
        assertEquals("3", history[1].contentId)
        assertEquals("2", history[2].contentId)
        
        // Verify timestamp was updated
        assertTrue(history[0].timestamp >= timestampBefore)
        assertTrue(history[0].timestamp <= timestampAfter)
    }

    @Test
    fun saveContentToHistory_enforcesLimit() = runTest {
        // Given - Create more items than the limit
        val itemsToCreate = Constants.DEFAULT_CONTENT_HISTORY_SIZE + 3

        // When - Add items exceeding the limit
        for (i in 1..itemsToCreate) {
            val content = createTestContent(i.toString(), "Content $i")
            repository.saveContentToHistory(content)
            Thread.sleep(5)
        }

        // Then - Should only keep the configured limit
        val history = repository.getContentHistory().first()
        assertEquals(Constants.DEFAULT_CONTENT_HISTORY_SIZE, history.size)
        
        // Verify newest items are kept
        assertEquals(itemsToCreate.toString(), history[0].contentId)
        assertEquals((itemsToCreate - 1).toString(), history[1].contentId)
        assertEquals((itemsToCreate - Constants.DEFAULT_CONTENT_HISTORY_SIZE + 1).toString(), 
            history[Constants.DEFAULT_CONTENT_HISTORY_SIZE - 1].contentId)
    }

    @Test
    fun getContentHistory_returnsEmptyListInitially() = runTest {
        // When
        val history = repository.getContentHistory().first()

        // Then
        assertTrue(history.isEmpty())
    }

    @Test
    fun saveLastPlayedContent_alsoSavesToHistory() = runTest {
        // Given
        val content = createTestContent("1", "Test Content")

        // When
        repository.saveLastPlayedContent(content)

        // Then - Content should be in both last played and history
        val userPrefs = repository.userPrefs.first()
        assertNotNull(userPrefs.lastContentJson)
        assertTrue(userPrefs.lastContentJson.contains("Test Content"))
        
        val history = repository.getContentHistory().first()
        assertEquals(1, history.size)
        assertEquals("1", history[0].contentId)
    }

    @Test
    fun contentHistoryItem_isSameContent_worksCorrectly() {
        // Given
        val content1 = createTestContent("1", "Content 1")
        val content2 = createTestContent("2", "Content 2")
        val item1 = ContentHistoryItem(content1, System.currentTimeMillis())
        val item1Duplicate = ContentHistoryItem(content1, System.currentTimeMillis() + 1000)
        val item2 = ContentHistoryItem(content2, System.currentTimeMillis())

        // Then
        assertTrue(item1.isSameContent(item1Duplicate))
        assertFalse(item1.isSameContent(item2))
        assertTrue(item1.isSameContent("1"))
        assertFalse(item1.isSameContent("2"))
    }

    @Test
    fun contentHistory_persistsAcrossInstances() = runTest {
        // Given
        val content = createTestContent("1", "Persistent Content")
        repository.saveContentToHistory(content)

        // When - Create new repository instance
        val newRepository = UserPreferencesRepository(context)
        val history = newRepository.getContentHistory().first()

        // Then - Data should persist
        assertEquals(1, history.size)
        assertEquals("1", history[0].contentId)
        assertEquals("Persistent Content", history[0].content.titleText)
    }

    // Helper Methods

    private fun createTestContent(id: String, title: String): Content {
        return Content(
            _id = id,
            type = "story",
            description = "Test description",
            language = "english",
            title = LocalizedContent(
                text = title,
                audioUrl = "https://example.com/audio.mp3"
            ),
            theme = null,
            audioContent = emptyList(),
            isPullModel = false,
            isTeacherApp = true,
            createdBy = "test",
            creation_time = System.currentTimeMillis(),
            isDeleted = false
        )
    }

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "seeds_user_config")
}
