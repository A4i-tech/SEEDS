package com.example.seeds.utils

object NativeEncryptor {
    init { System.loadLibrary("native-lib") }
    external fun encrypt(data: String, key: ByteArray, iv: ByteArray): ByteArray
    external fun decrypt(encryptedData: ByteArray, key: ByteArray, iv: ByteArray): String
}