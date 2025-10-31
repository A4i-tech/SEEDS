cmake_minimum_required(VERSION 3.22.1)

project("seeds") # You can name your project anything

add_library(
        native-lib   # This is the library name we load in Kotlin (System.loadLibrary("native-lib"))
        SHARED       # This means it will be a shared object (.so file)
        native-lib.cpp
        aes.c)       # Include the C source file for the AES library

find_library(
        log-lib
        log)

target_link_libraries(
        native-lib
        ${log-lib})