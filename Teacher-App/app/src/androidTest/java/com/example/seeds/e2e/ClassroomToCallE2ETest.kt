package com.example.seeds.e2e

import android.view.View
import androidx.recyclerview.widget.RecyclerView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.action.ViewActions.typeText
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.contrib.RecyclerViewActions
import androidx.test.espresso.matcher.ViewMatchers.hasDescendant
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.seeds.MainActivity
import com.example.seeds.R
import com.example.seeds.di.TestAppModule
import com.example.seeds.network.ClassroomDto
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.hamcrest.Matcher
import org.hamcrest.Matchers.not
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class ClassroomToCallE2ETest {

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    private lateinit var scenario: ActivityScenario<MainActivity>

    // Uses performClick() instead of coordinate injection to avoid
    // SecurityException when the item center lands on the navigation bar.
    private val performClickAction = object : ViewAction {
        override fun getConstraints(): Matcher<View> = isDisplayed()
        override fun getDescription() = "performClick on item view"
        override fun perform(uiController: UiController, view: View) {
            view.performClick()
            uiController.loopMainThreadUntilIdle()
        }
    }

    @Before
    fun setup() {
        hiltRule.inject()
        TestAppModule.fakeService.classroomsToReturn = listOf(
            ClassroomDto(_id = "cls-1", name = "Alpha Class", teacher = "teacher-1",
                students = emptyList(), leaders = emptyList()),
            ClassroomDto(_id = "cls-2", name = "Beta Group", teacher = "teacher-1",
                students = emptyList(), leaders = emptyList())
        )
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    @After
    fun tearDown() {
        if (::scenario.isInitialized) scenario.close()
        TestAppModule.fakeService.reset()
    }

    @Test
    fun classroomList_showsLoadedClassrooms() {
        onView(withId(R.id.my_classrooms_list))
            .perform(RecyclerViewActions.scrollTo<RecyclerView.ViewHolder>(hasDescendant(withText("Alpha Class"))))
        onView(withId(R.id.my_classrooms_list))
            .perform(RecyclerViewActions.scrollTo<RecyclerView.ViewHolder>(hasDescendant(withText("Beta Group"))))
    }

    @Test
    fun createClassroomButton_isDisplayed() {
        onView(withId(R.id.create_classroom_btn)).check(matches(isDisplayed()))
    }

    @Test
    fun clickClassroom_navigatesToCallSettings() {
        onView(withId(R.id.my_classrooms_list))
            .perform(RecyclerViewActions.actionOnItem<RecyclerView.ViewHolder>(
                hasDescendant(withText("Alpha Class")), performClickAction
            ))
        onView(withId(R.id.start_call_btn)).check(matches(isDisplayed()))
    }

    @Test
    fun searchBox_filtersClassroomList() {
        onView(withId(R.id.my_classrooms_list))
            .perform(RecyclerViewActions.scrollTo<RecyclerView.ViewHolder>(hasDescendant(withText("Alpha Class"))))
        onView(withId(R.id.search_text_box)).perform(typeText("Beta"))
        closeSoftKeyboard()
        onView(withId(R.id.my_classrooms_list))
            .perform(RecyclerViewActions.scrollTo<RecyclerView.ViewHolder>(hasDescendant(withText("Beta Group"))))
        onView(withId(R.id.my_classrooms_list))
            .check(matches(not(hasDescendant(withText("Alpha Class")))))
    }
}
