package com.example.seeds.utils

import android.util.Base64
import java.nio.charset.Charset
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec

object Encryptor {

    private const val TRANSFORMATION = "AES/CBC/PKCS7Padding"
    private val charset = Charset.forName("UTF-8")

    fun encrypt(data: String): Pair<String, String> {
        val key = KeyManager.getOrCreateSecretKey()
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)

        val iv = cipher.iv
        val encryptedBytes = cipher.doFinal(data.toByteArray(charset))

        val encryptedDataB64 = Base64.encodeToString(encryptedBytes, Base64.DEFAULT)
        val ivB64 = Base64.encodeToString(iv, Base64.DEFAULT)

        return Pair(encryptedDataB64, ivB64)
    }

    fun decrypt(encryptedDataB64: String, ivB64: String): String {
        val key = KeyManager.getOrCreateSecretKey()
        val cipher = Cipher.getInstance(TRANSFORMATION)

        val iv = Base64.decode(ivB64, Base64.DEFAULT)
        val ivSpec = IvParameterSpec(iv)
        cipher.init(Cipher.DECRYPT_MODE, key, ivSpec)

        val encryptedBytes = Base64.decode(encryptedDataB64, Base64.DEFAULT)
        val decryptedBytes = cipher.doFinal(encryptedBytes)

        return String(decryptedBytes, charset)
    }
}