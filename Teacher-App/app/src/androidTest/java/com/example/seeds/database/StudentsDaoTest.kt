package com.example.seeds.database

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.seeds.dao.StudentsDao
import com.example.seeds.model.Student
import com.example.seeds.util.getOrAwaitValue
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StudentsDaoTest {

    @get:Rule val instantTaskExecutorRule = InstantTaskExecutorRule()

    private lateinit var db: StudentDatabase
    private lateinit var dao: StudentsDao

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            StudentDatabase::class.java
        ).allowMainThreadQueries().build()
        dao = db.studentDao
    }

    @After
    fun teardown() = db.close()

    @Test
    fun insertAndRetrieveStudents() = runBlocking {
        dao.selectedStudents(listOf(Student(phoneNumber = "9999999999", name = "Test Student")))
        val result = dao.getAllSelectedStudents().getOrAwaitValue()
        assertThat(result).hasSize(1)
        assertThat(result.first().name).isEqualTo("Test Student")
    }

    @Test
    fun deleteAllSelectedStudents_clearsTable() = runBlocking {
        dao.selectedStudents(listOf(Student(phoneNumber = "9999999999", name = "Test Student")))
        dao.deleteAllSelectedStudents()
        val result = dao.getAllSelectedStudents().getOrAwaitValue()
        assertThat(result).isEmpty()
    }

    @Test
    fun insert_ignoresDuplicatePrimaryKey() = runBlocking {
        val student = Student(phoneNumber = "9999999999", name = "Test Student")
        dao.selectedStudents(listOf(student, student))
        val result = dao.getAllSelectedStudents().getOrAwaitValue()
        assertThat(result).hasSize(1)
    }

    @Test
    fun insertMultipleStudents_retrievesAll() = runBlocking {
        dao.selectedStudents(listOf(
            Student(phoneNumber = "1111111111", name = "Student A"),
            Student(phoneNumber = "2222222222", name = "Student B")
        ))
        val result = dao.getAllSelectedStudents().getOrAwaitValue()
        assertThat(result).hasSize(2)
    }
}
