package com.example.seeds.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.seeds.dao.LogDao
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LogDaoTest {

    private lateinit var db: StudentDatabase
    private lateinit var dao: LogDao

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            StudentDatabase::class.java
        ).allowMainThreadQueries().build()
        dao = db.logDao
    }

    @After
    fun teardown() = db.close()

    @Test
    fun insert_and_getAll_returnsInsertedLog() = runBlocking {
        dao.insert(LogEntity(id = "1", logText = "Test log", time = "2024-01-01", user = "teacher-1", priority = 1))
        val result = dao.getAll()
        assertThat(result).hasSize(1)
        assertThat(result.first().logText).isEqualTo("Test log")
    }

    @Test
    fun delete_removesSpecifiedIds() = runBlocking {
        dao.insert(LogEntity(id = "1", logText = "To delete", time = "2024-01-01", user = "teacher-1", priority = 1))
        val all = dao.getAll()
        dao.delete(all.map { it.id })
        assertThat(dao.getAll()).isEmpty()
    }

    @Test
    fun insert_multipleEntries_allPersisted() = runBlocking {
        dao.insert(LogEntity(id = "1", logText = "Log 1", time = "2024-01-01", user = "t1", priority = 1))
        dao.insert(LogEntity(id = "2", logText = "Log 2", time = "2024-01-02", user = "t1", priority = 2))
        assertThat(dao.getAll()).hasSize(2)
    }

    @Test
    fun delete_onlyRemovesSpecifiedIds() = runBlocking {
        dao.insert(LogEntity(id = "1", logText = "Keep", time = "2024-01-01", user = "t1", priority = 1))
        dao.insert(LogEntity(id = "2", logText = "Remove", time = "2024-01-02", user = "t1", priority = 2))
        val toRemove = dao.getAll().filter { it.logText == "Remove" }.map { it.id }
        dao.delete(toRemove)
        val remaining = dao.getAll()
        assertThat(remaining).hasSize(1)
        assertThat(remaining.first().logText).isEqualTo("Keep")
    }
}
