package com.example.seeds.e2e

import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.IdlingRegistry
import androidx.test.espresso.UiController
import androidx.test.espresso.ViewAction
import androidx.test.espresso.action.ViewActions.typeText
import androidx.test.espresso.assertion.ViewAssertions.doesNotExist
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.recyclerview.widget.RecyclerView
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import com.example.seeds.MainActivity
import com.example.seeds.R
import com.example.seeds.di.TestAppModule
import com.example.seeds.ui.home.HomeFragment
import com.example.seeds.model.Content
import com.example.seeds.model.LocalizedContent
import com.example.seeds.model.Pagination
import com.example.seeds.model.PaginatedResponse
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.hamcrest.Matcher
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

private class RecyclerViewRenderedIdlingResource(
    private val recyclerView: RecyclerView
) : androidx.test.espresso.IdlingResource {
    @Volatile private var rendered = false
    @Volatile private var registered = true
    private var callback: androidx.test.espresso.IdlingResource.ResourceCallback? = null

    private val observer = object : RecyclerView.AdapterDataObserver() {
        override fun onChanged() = checkRendered()
        override fun onItemRangeInserted(positionStart: Int, itemCount: Int) = checkRendered()
    }

    init {
        recyclerView.adapter?.registerAdapterDataObserver(observer)
    }

    // Ignores the zero-item notifyItemRangeInserted a ListAdapter fires on its
    // very first submitList(emptyList()) — only the real content render counts.
    private fun checkRendered() {
        if (rendered) return
        if ((recyclerView.adapter?.itemCount ?: 0) > 0) {
            rendered = true
            unregister()
            callback?.onTransitionToIdle()
        }
    }

    fun unregister() {
        if (!registered) return
        registered = false
        recyclerView.adapter?.unregisterAdapterDataObserver(observer)
    }

    override fun getName() = "RecyclerViewRenderedIdlingResource"
    override fun isIdleNow() = rendered
    override fun registerIdleTransitionCallback(cb: androidx.test.espresso.IdlingResource.ResourceCallback) { callback = cb }
}

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class ContentBrowsingE2ETest {

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    private lateinit var scenario: ActivityScenario<MainActivity>
    private var recyclerViewIdlingResource: RecyclerViewRenderedIdlingResource? = null
    private var fragmentLifecycleCallback: FragmentManager.FragmentLifecycleCallbacks? = null

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

    private val sparrowSong = Content(
        _id = "c-1",
        type = "audio",
        language = "en",
        title = LocalizedContent(english = "Sparrow Song"),
        theme = LocalizedContent(english = "Nature"),
        isPullModel = false,
        isTeacherApp = true,
        createdBy = "admin",
        creation_time = 1_700_000_000_000L,
        isDeleted = false
    )

    @Before
    fun setup() {
        TestAppModule.fakeService.reset()
        IdlingRegistry.getInstance().register(TestAppModule.fakeService.idlingResource)
        hiltRule.inject()
        TestAppModule.fakeService.contentToReturn = PaginatedResponse(
            data = listOf(sparrowSong),
            pagination = Pagination(nextCursor = null, hasMore = false, limit = 15)
        )
        scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario.onActivity { activity ->
            val callback = object : FragmentManager.FragmentLifecycleCallbacks() {
                override fun onFragmentViewCreated(
                    fm: FragmentManager, f: Fragment, v: View, savedInstanceState: android.os.Bundle?
                ) {
                    if (f is HomeFragment && recyclerViewIdlingResource == null) {
                        val recyclerView = v.findViewById<RecyclerView>(R.id.content_list)
                        val resource = RecyclerViewRenderedIdlingResource(recyclerView)
                        recyclerViewIdlingResource = resource
                        IdlingRegistry.getInstance().register(resource)
                    }
                }
            }
            fragmentLifecycleCallback = callback
            (activity as FragmentActivity).supportFragmentManager.registerFragmentLifecycleCallbacks(callback, true)
        }
    }

    @After
    fun tearDown() {
        recyclerViewIdlingResource?.let {
            it.unregister()
            IdlingRegistry.getInstance().unregister(it)
        }
        fragmentLifecycleCallback?.let { callback ->
            if (::scenario.isInitialized) {
                scenario.onActivity { activity ->
                    (activity as FragmentActivity).supportFragmentManager.unregisterFragmentLifecycleCallbacks(callback)
                }
            }
        }
        IdlingRegistry.getInstance().unregister(TestAppModule.fakeService.idlingResource)
        if (::scenario.isInitialized) scenario.close()
        TestAppModule.fakeService.reset()
    }

    @Test
    fun homeTab_displaysContentFromApi() {
        onView(withId(R.id.homeFragment)).perform(performClickAction)
        onView(withText("Sparrow Song")).check(matches(isDisplayed()))
    }

    @Test
    fun clickContent_navigatesToDetailsFragment() {
        onView(withId(R.id.homeFragment)).perform(performClickAction)
        onView(withText("Sparrow Song")).perform(performClickAction)
        onView(withId(R.id.contact_name)).check(matches(withText("Sparrow Song")))
    }

    @Test
    fun searchContent_filtersResults() {
        onView(withId(R.id.homeFragment)).perform(performClickAction)
        onView(withText("Sparrow Song")).check(matches(isDisplayed()))
        onView(withId(R.id.content_search_text_box)).perform(typeText("xyz"))
        closeSoftKeyboard()
        onView(withText("Sparrow Song")).check(doesNotExist())
    }
}
