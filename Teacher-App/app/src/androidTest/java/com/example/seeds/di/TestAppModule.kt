package com.example.seeds.di

import android.content.Context
import android.content.SharedPreferences
import androidx.room.Room
import com.example.seeds.HiltAppModule
import com.example.seeds.database.StudentDatabase
import com.example.seeds.network.SeedsService
import com.example.seeds.utils.EmailIdString
import dagger.Module
import dagger.Provides
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.hilt.testing.TestInstallIn
import javax.inject.Singleton

@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [HiltAppModule::class]
)
object TestAppModule {

    val fakeService = FakeSeedsService()

    @Provides
    @Singleton
    fun provideStudentDatabase(@ApplicationContext context: Context): StudentDatabase =
        Room.inMemoryDatabaseBuilder(context, StudentDatabase::class.java)
            .build()

    @Provides
    @Singleton
    fun provideNetworkService(): SeedsService = fakeService

    @Provides
    @Singleton
    @EmailIdString
    fun provideEmailIdString(): String = "test-phone-number"

    @Provides
    @Singleton
    fun provideSharedPreferences(@ApplicationContext context: Context): SharedPreferences =
        context.getSharedPreferences("test_prefs", Context.MODE_PRIVATE)

    @Provides
    @Singleton
    fun provideStudentDao(db: StudentDatabase) = db.studentDao

    @Provides
    @Singleton
    fun provideContext(@ApplicationContext context: Context): Context = context

    @Provides
    @Singleton
    fun provideLogDao(db: StudentDatabase) = db.logDao
}
